import type { Move } from './move.ts';
import { Position, START_SFEN } from './position.ts';
import type { Color, GameResult } from './types.ts';
import { GOTE, SENTE, opponentOf } from './types.ts';

interface Snapshot {
  key: string;
  /** 走完這一手後，走子方是否將軍對手 */
  check: boolean;
}

/**
 * 一盤棋：起始局面加上一串棋步。和五子棋相同，悔棋、復盤、線上同步都是重演這串棋步。
 * 勝負只在這裡判定，UI、AI 與線上模式都不重複實作。
 */
export class Game {
  readonly position: Position;
  readonly startSfen: string;
  private readonly history: Move[] = [];
  private readonly snapshots: Snapshot[];
  private ending: GameResult | null = null;

  constructor(startSfen: string = START_SFEN) {
    this.startSfen = startSfen;
    this.position = Position.fromSfen(startSfen);
    this.snapshots = [{ key: this.position.repetitionKey, check: false }];
    this.evaluateEnding();
  }

  static fromMoves(startSfen: string, moves: readonly Move[]): Game {
    const game = new Game(startSfen);
    for (const move of moves) {
      if (!game.play(move)) throw new Error(`第 ${game.moves.length + 1} 手不合法`);
    }
    return game;
  }

  get moves(): readonly Move[] {
    return this.history;
  }

  get turn(): Color {
    return this.position.turn;
  }

  get result(): GameResult | null {
    return this.ending;
  }

  legalMoves(): Move[] {
    return this.ending ? [] : this.position.legalMoves();
  }

  /** 落子。合法時回傳 true；不合法則不改變任何狀態。 */
  play(move: Move): boolean {
    if (this.ending || !this.position.isLegal(move)) return false;
    this.position.make(move);
    this.history.push(move);
    this.snapshots.push({ key: this.position.repetitionKey, check: this.position.inCheck() });
    this.evaluateEnding();
    return true;
  }

  undo(): Move | null {
    const move = this.history.pop();
    if (move === undefined) return null;
    this.position.unmake();
    this.snapshots.pop();
    this.ending = null;
    this.evaluateEnding();
    return move;
  }

  conclude(loser: Color, reason: 'resign' | 'timeout'): void {
    if (!this.ending) this.ending = { winner: opponentOf(loser), reason };
  }

  private evaluateEnding(): void {
    this.ending = this.checkRepetition();
    if (this.ending) return;
    if (!this.position.hasLegalMove()) {
      this.ending = { winner: opponentOf(this.position.turn), reason: 'checkmate' };
    }
  }

  /**
   * 同一局面第四次出現時成立千日手，判和局。
   * 但如果這段循環裡有一方每手都在將軍，就是連續王手千日手，將軍的一方判負。
   */
  private checkRepetition(): GameResult | null {
    const current = this.snapshots.at(-1) as Snapshot;
    const seen: number[] = [];
    this.snapshots.forEach((snapshot, index) => {
      if (snapshot.key === current.key) seen.push(index);
    });
    if (seen.length < 4) return null;
    const first = seen[0] as number;
    const last = this.snapshots.length - 1;
    const allChecks = (mover: Color): boolean => {
      // snapshots[i] 是第 i 手走完的局面；奇偶對應走子方
      const startSide = this.sideOfPly(1);
      let found = false;
      for (let index = first + 1; index <= last; index++) {
        const side = (index - 1) % 2 === 0 ? startSide : opponentOf(startSide);
        if (side !== mover) continue;
        found = true;
        if (!(this.snapshots[index] as Snapshot).check) return false;
      }
      return found;
    };
    for (const color of [SENTE, GOTE] as const) {
      if (allChecks(color)) return { winner: opponentOf(color), reason: 'perpetual-check' };
    }
    return { winner: null, reason: 'repetition' };
  }

  /** 第 ply 手（從 1 起算）由誰下 */
  private sideOfPly(ply: number): Color {
    const startTurn: Color = this.startSfen.split(/\s+/)[1] === 'w' ? GOTE : SENTE;
    return (ply - 1) % 2 === 0 ? startTurn : opponentOf(startTurn);
  }
}
