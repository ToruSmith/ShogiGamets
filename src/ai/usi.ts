import { moveToUsi, usiToMove } from '../core/notation.ts';
import type { Move } from '../core/move.ts';
import { START_SFEN } from '../core/position.ts';
import { Engine } from './engine.ts';
import type { SearchInfo, SearchLimits } from './engine.ts';
import { GOTE } from '../core/types.ts';

/**
 * 內建引擎的 USI 外殼。USI 是將棋引擎的標準文字協定，YaneuraOu 等引擎都講這個，
 * 所以主執行緒只要會講 USI，就能把內建引擎換成任何 USI 引擎。
 *
 * 支援：usi、isready、setoption、usinewgame、position、go（movetime / depth / nodes /
 * btime wtime byoyomi binc winc / infinite）、stop、quit。
 * 搜尋是同步的，所以 stop 只能在兩次搜尋之間生效；要立刻中斷請直接終止 Worker。
 */
export class UsiSession {
  private readonly engine = new Engine();
  private sfen = START_SFEN;
  private moves: Move[] = [];
  private skill = 20;

  constructor(private readonly send: (line: string) => void) {}

  handle(line: string): void {
    const [command = '', ...args] = line.trim().split(/\s+/);
    switch (command) {
      case 'usi':
        this.send('id name ShogiGamets Builtin');
        this.send('id author ShogiGamets');
        this.send('option name SkillLevel type spin default 20 min 0 max 20');
        this.send('option name USI_Hash type spin default 16 min 1 max 16');
        this.send('usiok');
        break;
      case 'isready':
        this.send('readyok');
        break;
      case 'setoption':
        this.setOption(args);
        break;
      case 'usinewgame':
        this.engine.newGame();
        break;
      case 'position':
        this.setPosition(args);
        break;
      case 'go':
        this.go(args);
        break;
      default:
        break; // stop、quit、gameover 等：同步搜尋不需要處理
    }
  }

  private setOption(args: string[]): void {
    const nameAt = args.indexOf('name');
    const valueAt = args.indexOf('value');
    const name = args.slice(nameAt + 1, valueAt < 0 ? undefined : valueAt).join(' ');
    const value = valueAt < 0 ? '' : args.slice(valueAt + 1).join(' ');
    if (name === 'SkillLevel') this.skill = Math.max(0, Math.min(20, Number(value) || 0));
  }

  private setPosition(args: string[]): void {
    let index = 0;
    if (args[0] === 'startpos') {
      this.sfen = START_SFEN;
      index = 1;
    } else if (args[0] === 'sfen') {
      this.sfen = args.slice(1, 5).join(' ');
      index = 5;
    }
    this.moves = [];
    if (args[index] === 'moves') {
      for (const text of args.slice(index + 1)) {
        const move = usiToMove(text);
        if (move !== null) this.moves.push(move);
      }
    }
    this.engine.setPosition(this.sfen, this.moves);
  }

  private go(args: string[]): void {
    const value = (key: string): number | undefined => {
      const at = args.indexOf(key);
      return at >= 0 ? Number(args[at + 1]) : undefined;
    };
    const limits: SearchLimits = { skill: this.skill };
    const movetime = value('movetime');
    const depth = value('depth');
    const nodes = value('nodes');
    if (movetime !== undefined) limits.timeMs = movetime;
    if (depth !== undefined) limits.depth = depth;
    if (nodes !== undefined) limits.nodes = nodes;
    const black = value('btime');
    if (black !== undefined && movetime === undefined) {
      // 有持時間時自己分配：剩餘時間的 1/40，加上大部分讀秒與加秒
      const gote = this.engine.currentPosition.turn === GOTE;
      const remaining = (gote ? value('wtime') : black) ?? 0;
      const increment = (gote ? value('winc') : value('binc')) ?? 0;
      const byoyomi = value('byoyomi') ?? 0;
      limits.timeMs = Math.max(100, remaining / 40 + byoyomi * 0.85 + increment * 0.8);
    }
    if (args.includes('infinite')) limits.timeMs = 60_000;
    if (!limits.timeMs && !limits.depth && !limits.nodes) limits.timeMs = 1000;

    const outcome = this.engine.search(limits, (info) => this.send(formatInfo(info)));
    this.send(`bestmove ${outcome.best === null ? 'resign' : moveToUsi(outcome.best)}`);
  }
}

export function formatInfo(info: SearchInfo): string {
  const score = info.mate !== null ? `mate ${info.mate}` : `cp ${info.score}`;
  const nps = info.timeMs > 0 ? Math.round((info.nodes * 1000) / info.timeMs) : 0;
  const pv = info.pv.length ? ` pv ${info.pv.map(moveToUsi).join(' ')}` : '';
  return `info depth ${info.depth} time ${info.timeMs} nodes ${info.nodes} nps ${nps} score ${score}${pv}`;
}
