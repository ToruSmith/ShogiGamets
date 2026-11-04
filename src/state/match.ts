import { createEngine } from '../ai/engines.ts';
import type { AiLevel } from '../ai/levels.ts';
import { levelById, thinkingTime } from '../ai/levels.ts';
import type { ShogiEngine } from '../ai/types.ts';
import { CancelledError } from '../ai/types.ts';
import type { ClockState, TimeControl } from '../core/clock.ts';
import {
  initialClock,
  isTimed,
  readClock,
  replayClock,
  spendTime,
  UNTIMED,
} from '../core/clock.ts';
import { Game } from '../core/game.ts';
import type { HandicapId } from '../core/handicap.ts';
import { handicapById } from '../core/handicap.ts';
import type { Move } from '../core/move.ts';
import { moveToUsi, usiToMove } from '../core/notation.ts';
import type { Color, GameResult } from '../core/types.ts';
import { GOTE, SENTE, opponentOf } from '../core/types.ts';
import type { RoomView } from '../online/session.ts';
import { isFlagged, RoomSession } from '../online/session.ts';
import type { RoomBackend } from '../online/types.ts';
import { colorOfSeat, otherSeat } from '../online/types.ts';
import { loadRaw, save } from '../platform/storage.ts';
import { saveGame } from './records.ts';
import { settingsStore } from './settings.ts';
import { Store } from './store.ts';

export type PlayerKind = 'human' | 'ai' | 'remote';

export interface SideInfo {
  name: string;
  kind: PlayerKind;
}

export interface ClockView {
  control: TimeControl;
  state: ClockState;
  /** 目前這一手從何時開始計時（與 now() 同一個時間基準）；尚未開始為 null */
  turnStartedAt: number | null;
}

export interface OnlineInfo {
  code: string;
  seat: 'sente' | 'gote' | null;
  opponentJoined: boolean;
  opponentOnline: boolean;
  rematchRequested: boolean;
  opponentWantsRematch: boolean;
  closed: boolean;
}

export interface MatchSnapshot {
  version: number;
  mode: 'ai' | 'local' | 'online';
  game: Game;
  sides: [SideInfo, SideInfo];
  clock: ClockView | null;
  thinking: boolean;
  result: GameResult | null;
  lastMove: Move | null;
  canUndo: boolean;
  /** 現在可以入玉宣言 */
  canDeclare: boolean;
  /** 提和按鈕的狀態 */
  draw: DrawState;
  /** 現在輪到的一方能不能由這個畫面操作 */
  interactive: boolean;
  /** 預設放在下方的一方 */
  bottom: Color;
  times: number[];
  savedId: string | null;
  online: OnlineInfo | null;
}

export type DrawState = 'hidden' | 'available' | 'sent' | 'received';

export interface MatchController {
  readonly store: Store<MatchSnapshot>;
  now(): number;
  play(move: Move): void;
  resign(): void;
  declare(): void;
  offerDraw(): void;
  undo(): void;
  rematch(): void;
  dispose(): void;
}

let sharedEngine: ShogiEngine | null = null;
function engine(): ShogiEngine {
  sharedEngine ??= createEngine(settingsStore.get().engine);
  return sharedEngine;
}
/** 設定換了引擎時呼叫 */
export function resetEngine(): void {
  sharedEngine?.dispose();
  sharedEngine = null;
}

export interface LocalConfig {
  mode: 'ai' | 'local';
  handicap: HandicapId;
  control: TimeControl;
  /** 對電腦時人類執哪一方 */
  human: Color;
  level: number;
  names: [string, string];
}

/** 中斷後可以接著下的對局 */
interface Resume {
  config: LocalConfig;
  moves: string[];
  times: number[];
}
const RESUME_KEY = 'shogi-current';

export const resumableMatch = (): LocalConfig | null =>
  loadRaw<Resume | null>(RESUME_KEY, null)?.config ?? null;

/** 對電腦與雙人同機 */
export class LocalMatch implements MatchController {
  readonly store: Store<MatchSnapshot>;
  private readonly game: Game;
  private readonly level: AiLevel;
  private clock: ClockState;
  private turnStartedAt: number;
  private times: number[] = [];
  private thinking = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private savedId: string | null = null;
  private disposed = false;

  constructor(
    readonly config: LocalConfig,
    resume = false,
  ) {
    this.level = levelById(config.level);
    this.game = new Game(handicapById(config.handicap).sfen);
    this.clock = initialClock(config.control);
    if (resume) {
      const saved = loadRaw<Resume | null>(RESUME_KEY, null);
      for (const text of saved?.moves ?? []) {
        const move = usiToMove(text);
        if (move === null || !this.game.play(move)) break;
      }
      this.times = (saved?.times ?? []).slice(0, this.game.moves.length);
      this.clock = replayClock(config.control, this.firstMover(), this.times).state;
    }
    this.turnStartedAt = Date.now();
    this.store = new Store(this.snapshot(0));
    if (isTimed(config.control)) this.timer = setInterval(() => this.checkFlag(), 200);
    setTimeout(() => this.maybeAi(), 300);
  }

  now(): number {
    return Date.now();
  }

  private firstMover(): Color {
    return this.game.startSfen.split(' ')[1] === 'w' ? GOTE : SENTE;
  }

  private isHuman(color: Color): boolean {
    return this.config.mode === 'local' || color === this.config.human;
  }

  private snapshot(version: number): MatchSnapshot {
    const { config, game } = this;
    const result = game.result;
    const humanCount = game.moves.length;
    const timed = isTimed(config.control);
    return {
      version,
      mode: config.mode,
      game,
      sides: [
        { name: config.names[0], kind: this.isHuman(SENTE) ? 'human' : 'ai' },
        { name: config.names[1], kind: this.isHuman(GOTE) ? 'human' : 'ai' },
      ],
      clock: timed
        ? {
            control: config.control,
            state: this.clock,
            turnStartedAt: result ? null : this.turnStartedAt,
          }
        : null,
      thinking: this.thinking,
      result,
      lastMove: game.moves.at(-1) ?? null,
      canUndo: !timed && humanCount > 0 && (config.mode === 'local' || this.hasHumanMove()),
      canDeclare: !this.thinking && this.isHuman(game.turn) && game.canDeclare,
      draw: config.mode === 'local' ? 'available' : 'hidden',
      interactive: !result && !this.thinking && this.isHuman(game.turn),
      bottom: config.mode === 'ai' ? config.human : SENTE,
      times: [...this.times],
      savedId: this.savedId,
      online: null,
    };
  }

  private hasHumanMove(): boolean {
    let color = this.firstMover();
    for (let i = 0; i < this.game.moves.length; i++) {
      if (color === this.config.human) return true;
      color = opponentOf(color);
    }
    return false;
  }

  private emit(): void {
    if (this.disposed) return;
    this.store.set(this.snapshot(this.store.get().version + 1));
  }

  private persist(): void {
    if (this.game.result) save(RESUME_KEY, null);
    else
      save(RESUME_KEY, {
        config: this.config,
        moves: this.game.moves.map(moveToUsi),
        times: this.times,
      });
  }

  private apply(move: Move): boolean {
    if (this.game.result) return false;
    const mover = this.game.turn;
    const elapsed = Date.now() - this.turnStartedAt;
    const next = spendTime(this.config.control, this.clock, mover, elapsed);
    if (!next) {
      this.game.conclude(mover, 'timeout');
      this.finish();
      return false;
    }
    if (!this.game.play(move)) return false;
    this.clock = next;
    this.times.push(elapsed);
    this.turnStartedAt = Date.now();
    if (this.game.result) this.finish();
    else {
      this.persist();
      this.emit();
    }
    return true;
  }

  play(move: Move): void {
    if (!this.isHuman(this.game.turn) || this.thinking) return;
    if (this.apply(move)) this.maybeAi();
  }

  private async maybeAi(): Promise<void> {
    const { game, config } = this;
    if (
      this.disposed ||
      config.mode !== 'ai' ||
      game.result ||
      this.isHuman(game.turn) ||
      this.thinking
    )
      return;
    this.thinking = true;
    this.emit();
    const started = Date.now();
    const timed = isTimed(config.control);
    const remaining = timed ? this.clock.remaining[game.turn] : null;
    const movetimeMs = thinkingTime(this.level, remaining, config.control.byoyomiMs);
    try {
      const result = await engine().search({
        sfen: game.startSfen,
        moves: game.moves.map(moveToUsi),
        movetimeMs,
        skill: this.level.skill,
      });
      // 太快回應看起來不自然
      const wait = 350 - (Date.now() - started);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      if (this.disposed) return;
      this.thinking = false;
      const move = usiToMove(result.bestMove);
      if (move === null) {
        game.conclude(game.turn, 'resign');
        this.finish();
      } else if (!this.apply(move)) {
        this.emit();
      }
    } catch (error) {
      this.thinking = false;
      if (!(error instanceof CancelledError)) {
        console.error(error);
        this.emit();
      }
    }
  }

  private checkFlag(): void {
    if (this.game.result || this.disposed) return;
    const reading = readClock(
      this.config.control,
      this.clock,
      this.game.turn,
      Date.now() - this.turnStartedAt,
    );
    if (reading.flagged) {
      if (this.thinking) engine().cancel();
      this.thinking = false;
      this.game.conclude(this.game.turn, 'timeout');
      this.finish();
    }
  }

  private finish(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.persist();
    const saved = saveGame({
      ...(this.savedId ? { id: this.savedId } : {}),
      startSfen: this.game.startSfen,
      moves: [...this.game.moves],
      result: this.game.result,
      sente: this.config.names[0],
      gote: this.config.names[1],
      times: [...this.times],
      mode: this.config.mode,
    });
    this.savedId = saved.id;
    this.emit();
  }

  undo(): void {
    if (!this.store.get().canUndo) return;
    if (this.thinking) engine().cancel();
    this.thinking = false;
    const wasOver = this.game.result !== null;
    do {
      this.game.undo();
      this.times.pop();
    } while (
      this.config.mode === 'ai' &&
      this.game.moves.length > 0 &&
      !this.isHuman(this.game.turn)
    );
    if (this.config.mode === 'ai' && !this.isHuman(this.game.turn)) {
      // 退到開局且電腦先走：讓它重新思考
      setTimeout(() => this.maybeAi(), 0);
    }
    this.clock = replayClock(this.config.control, this.firstMover(), this.times).state;
    this.turnStartedAt = Date.now();
    if (wasOver && isTimed(this.config.control) && !this.timer) {
      this.timer = setInterval(() => this.checkFlag(), 200);
    }
    this.persist();
    this.emit();
  }

  resign(): void {
    if (this.game.result) return;
    if (this.thinking) engine().cancel();
    this.thinking = false;
    const loser = this.config.mode === 'ai' ? this.config.human : this.game.turn;
    this.game.conclude(loser, 'resign');
    this.finish();
  }

  declare(): void {
    if (!this.game.canDeclare || this.thinking || !this.isHuman(this.game.turn)) return;
    this.game.declare();
    this.finish();
  }

  /** 雙人同機時，提和就是雙方當場同意 */
  offerDraw(): void {
    if (this.game.result || this.config.mode !== 'local') return;
    this.game.agreeDraw();
    this.finish();
  }

  rematch(): void {
    // 由畫面重新建立 LocalMatch
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    if (this.thinking) engine().cancel();
  }
}

/** 線上對局：狀態完全來自 RoomSession 的房間資料 */
/** 手數變了，之前的提和就失效 */
function onlineDrawState(view: RoomView | null): DrawState {
  if (!view?.seat || !view.opponentJoined || view.game.result) return 'hidden';
  const ply = view.game.moves.length;
  const offers = view.room.draw ?? {};
  if (offers[view.seat] === ply) return 'sent';
  return offers[otherSeat(view.seat)] === ply ? 'received' : 'available';
}

export class OnlineMatch implements MatchController {
  readonly store: Store<MatchSnapshot>;
  readonly session: RoomSession;
  private view: RoomView | null = null;
  private closed = false;
  private timer: ReturnType<typeof setInterval>;
  private savedFor = new Set<string>();

  constructor(backend: RoomBackend) {
    this.session = new RoomSession(backend, (view, closed) => {
      this.view = view;
      this.closed = closed;
      this.emit();
    });
    this.store = new Store(this.snapshot(0));
    this.timer = setInterval(() => this.checkFlag(), 250);
  }

  now(): number {
    return this.session.serverNow();
  }

  private snapshot(version: number): MatchSnapshot {
    const view = this.view;
    const game = view?.game ?? new Game();
    const players = view?.room.players ?? {};
    const seat = view?.seat ?? null;
    const mine = seat ? colorOfSeat(seat) : SENTE;
    const timed = view ? isTimed(view.control) : false;
    const kindOf = (color: Color): PlayerKind =>
      seat && colorOfSeat(seat) === color ? 'human' : 'remote';
    const rematch = view?.room.rematch ?? {};
    return {
      version,
      mode: 'online',
      game,
      sides: [
        { name: players.sente?.name ?? '…', kind: kindOf(SENTE) },
        { name: players.gote?.name ?? '…', kind: kindOf(GOTE) },
      ],
      clock:
        view && timed
          ? {
              control: view.control,
              state: view.clock,
              turnStartedAt: game.result ? null : view.turnStartedAt,
            }
          : null,
      thinking: false,
      result: game.result,
      lastMove: game.moves.at(-1) ?? null,
      canUndo: false,
      canDeclare: Boolean(view?.myTurn) && game.canDeclare,
      draw: onlineDrawState(view),
      interactive: Boolean(view?.myTurn) && !game.result,
      bottom: mine,
      times: view?.times ?? [],
      savedId: view ? `online-${view.code}` : null,
      online: view
        ? {
            code: view.code,
            seat,
            opponentJoined: view.opponentJoined,
            opponentOnline: view.opponentOnline,
            rematchRequested: Boolean(seat && rematch[seat]),
            opponentWantsRematch: Boolean(seat && rematch[otherSeat(seat)]),
            closed: this.closed,
          }
        : this.closed
          ? {
              code: '',
              seat: null,
              opponentJoined: false,
              opponentOnline: false,
              rematchRequested: false,
              opponentWantsRematch: false,
              closed: true,
            }
          : null,
    };
  }

  private emit(): void {
    const view = this.view;
    if (view?.game.result && view.seat && !this.savedFor.has(view.code)) {
      this.savedFor.add(view.code);
      saveGame({
        id: `online-${view.code}`,
        startSfen: view.game.startSfen,
        moves: [...view.game.moves],
        result: view.game.result,
        sente: view.room.players.sente?.name ?? '',
        gote: view.room.players.gote?.name ?? '',
        times: view.times,
        mode: 'online',
      });
    }
    this.store.set(this.snapshot(this.store.get().version + 1));
  }

  /** 對方時間用完時，本機立刻顯示結果；雙方從同一份時間戳算，結論一致 */
  private checkFlag(): void {
    const view = this.view;
    if (!view || view.game.result) return;
    if (isFlagged(view, this.now())) {
      view.game.conclude(view.game.turn, 'timeout');
      this.emit();
    }
  }

  play(move: Move): void {
    void this.session.play(move).catch((error: unknown) => console.error(error));
  }

  resign(): void {
    void this.session.resign();
  }

  declare(): void {
    void this.session.declare();
  }

  offerDraw(): void {
    void this.session.offerDraw();
  }

  undo(): void {}

  rematch(): void {
    void this.session.requestRematch();
  }

  dispose(): void {
    clearInterval(this.timer);
    void this.session.leave();
  }
}

export const DEFAULT_CONTROL = UNTIMED;
