import type { EngineInfo, EngineResult, EngineSearch, ShogiEngine } from './types.ts';
import { CancelledError } from './types.ts';

/** 雙向傳遞 USI 文字行的通道：Web Worker、測試用的同行程通道都行 */
export interface UsiTransport {
  send(line: string): void;
  onLine(listener: (line: string) => void): void;
  terminate(): void;
}

export function parseInfo(line: string): EngineInfo | null {
  if (!line.startsWith('info ') || !/ score /.test(line)) return null;
  const tokens = line.split(/\s+/);
  const number = (key: string): number | null => {
    const at = tokens.indexOf(key);
    return at >= 0 ? Number(tokens[at + 1]) : null;
  };
  const scoreAt = tokens.indexOf('score');
  const kind = tokens[scoreAt + 1];
  const raw = tokens[scoreAt + 2] ?? '';
  let mate: number | null = null;
  let scoreCp: number | null = null;
  if (kind === 'mate') {
    // YaneuraOu 可能送出 mate + 或 mate -（不知道手數）
    mate = raw === '+' ? 1 : raw === '-' ? -1 : Number(raw);
  } else scoreCp = Number(raw);
  const pvAt = tokens.indexOf('pv');
  return {
    depth: number('depth') ?? 0,
    scoreCp,
    mate,
    nodes: number('nodes') ?? 0,
    pv: pvAt >= 0 ? tokens.slice(pvAt + 1) : [],
  };
}

interface Pending {
  resolve: (result: EngineResult) => void;
  reject: (error: Error) => void;
  onInfo: ((info: EngineInfo) => void) | undefined;
  last: EngineInfo | null;
}

/**
 * 任何 USI 引擎的主執行緒端。一次只跑一個搜尋；取消時終止通道並在下次重建，
 * 因為內建引擎是同步搜尋，收不到 stop。
 */
export class UsiEngine implements ShogiEngine {
  private transport: UsiTransport | null = null;
  private ready: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;
  private pending: Pending | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private skill: number | null = null;
  /** cancel() 會加一；在這之前送出的搜尋全部作廢 */
  private generation = 0;

  constructor(
    readonly name: string,
    private readonly connect: () => UsiTransport,
  ) {}

  private boot(): Promise<void> {
    if (this.ready) return this.ready;
    const transport = this.connect();
    this.transport = transport;
    this.skill = null;
    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    transport.onLine((line) => this.receive(line));
    transport.send('usi');
    transport.send('isready');
    return this.ready;
  }

  private receive(line: string): void {
    if (line === 'readyok') {
      this.readyResolve?.();
      this.readyReject = null;
      return;
    }
    const pending = this.pending;
    if (!pending) return;
    const info = parseInfo(line);
    if (info) {
      pending.last = info;
      pending.onInfo?.(info);
      return;
    }
    if (line.startsWith('bestmove')) {
      this.pending = null;
      pending.resolve({ bestMove: line.split(/\s+/)[1] ?? 'resign', info: pending.last });
    }
  }

  search(request: EngineSearch, onInfo?: (info: EngineInfo) => void): Promise<EngineResult> {
    const generation = this.generation;
    const run = async (): Promise<EngineResult> => {
      if (generation !== this.generation) throw new CancelledError();
      await this.boot();
      if (generation !== this.generation) throw new CancelledError();
      const transport = this.transport as UsiTransport;
      const skill = request.skill ?? 20;
      if (skill !== this.skill) {
        transport.send(`setoption name SkillLevel value ${skill}`);
        this.skill = skill;
      }
      const moves = request.moves.length ? ` moves ${request.moves.join(' ')}` : '';
      transport.send(`position sfen ${request.sfen}${moves}`);
      const go = request.depth
        ? `go depth ${request.depth}${request.movetimeMs ? ` movetime ${request.movetimeMs}` : ''}`
        : `go movetime ${request.movetimeMs ?? 1000}`;
      return new Promise<EngineResult>((resolve, reject) => {
        this.pending = { resolve, reject, onInfo, last: null };
        transport.send(go);
      });
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  cancel(): void {
    this.generation++;
    const pending = this.pending;
    this.pending = null;
    this.transport?.terminate();
    this.transport = null;
    this.ready = null;
    this.readyReject?.(new CancelledError());
    this.readyReject = null;
    pending?.reject(new CancelledError());
  }

  dispose(): void {
    this.cancel();
  }
}
