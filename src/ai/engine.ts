import type { Move } from '../core/move.ts';
import { isDrop, moveDropType, moveFrom, movePromotes, moveTo } from '../core/move.ts';
import { Position } from '../core/position.ts';
import type { Color } from '../core/types.ts';
import {
  BISHOP,
  CELLS,
  DRAGON,
  EMPTY,
  GOLD,
  GOTE,
  HAND_TYPES,
  HORSE,
  KING,
  KNIGHT,
  LANCE,
  NARIGIN,
  NARIKEI,
  NARIKYO,
  PAWN,
  ROOK,
  SENTE,
  SILVER,
  SIZE,
  TOKIN,
  colorOf,
  columnOf,
  opponentOf,
  rankOf,
  typeOf,
} from '../core/types.ts';
import { captureMoves } from './movegen.ts';

/**
 * 內建的將棋 AI：反覆加深的 alpha-beta（PVS），加上
 *   置換表、空著剪枝、遲著減深、殺手手與歷史表排序、將軍延伸、只看吃子的靜止搜尋。
 * 評估函數是子力加上簡單的王將安全度。目標是「業餘初段上下、手機上也跑得動」，
 * 想要職業級棋力時改接 YaneuraOu（見 ai/engines.ts）。
 */

export const MATE = 30000;
const MATE_BOUND = MATE - 1000;
const INF = 32000;

/** 盤上棋子的價值（升變後的價值另列） */
export const PIECE_VALUE: Record<number, number> = {
  [PAWN]: 90,
  [LANCE]: 315,
  [KNIGHT]: 405,
  [SILVER]: 495,
  [GOLD]: 540,
  [BISHOP]: 855,
  [ROOK]: 990,
  [KING]: 0,
  [TOKIN]: 540,
  [NARIKYO]: 540,
  [NARIKEI]: 540,
  [NARIGIN]: 540,
  [HORSE]: 945,
  [DRAGON]: 1395,
};
/** 持駒比盤上略高：可以打在任何地方 */
const HAND_VALUE: Record<number, number> = {
  [PAWN]: 105,
  [LANCE]: 350,
  [KNIGHT]: 450,
  [SILVER]: 560,
  [GOLD]: 610,
  [BISHOP]: 950,
  [ROOK]: 1100,
};
/** 被吃時對手得到的價值（MVV-LVA 用） */
const captureValue = (piece: number): number => {
  const type = typeOf(piece);
  return (PIECE_VALUE[type] as number) + (HAND_VALUE[type > KING ? type - 8 : type] ?? 0);
};

const isGoldLike = (type: number): boolean =>
  type === GOLD || type === SILVER || (type >= TOKIN && type <= NARIGIN);

/** 從 color 的角度看的段（0 = 敵陣最深處，8 = 自陣最底） */
const relativeRank = (square: number, color: Color): number =>
  color === SENTE ? rankOf(square) : SIZE - 1 - rankOf(square);

function positional(type: number, square: number, color: Color): number {
  const r = relativeRank(square, color);
  const column = columnOf(square);
  switch (type) {
    case PAWN:
      return r <= 5 ? (6 - r) * 4 : 0;
    case SILVER:
    case GOLD:
      // 太早衝出去的金銀容易被打
      return r <= 2 ? -10 : 0;
    case KNIGHT:
      return r <= 3 ? 10 : 0;
    case ROOK:
      return r <= 2 ? 50 : 0;
    case BISHOP:
      return r <= 2 ? 30 : 0;
    case KING: {
      const back = r >= 6 ? (r - 5) * 18 : -40 * (6 - r);
      const side = r >= 6 ? Math.abs(column - 4) * 9 : 0;
      return back + side;
    }
    default:
      return 0;
  }
}

/** 王將附近的攻防：守方的金銀加分，敵方的棋子減分，敵方持駒越多越危險 */
function kingSafety(position: Position, color: Color): number {
  const king = position.kings[color];
  if (king < 0) return 0;
  const kr = rankOf(king);
  const kc = columnOf(king);
  const enemy = opponentOf(color);
  let defenders = 0;
  let pressure = 0;
  for (let dr = -3; dr <= 3; dr++) {
    const r = kr + dr;
    if (r < 0 || r >= SIZE) continue;
    for (let dc = -3; dc <= 3; dc++) {
      const c = kc + dc;
      if (c < 0 || c >= SIZE || (dr === 0 && dc === 0)) continue;
      const piece = position.board[r * SIZE + c] as number;
      if (piece === EMPTY) continue;
      const distance = Math.max(Math.abs(dr), Math.abs(dc));
      const type = typeOf(piece);
      if (colorOf(piece) === color) {
        if (distance <= 2 && isGoldLike(type)) defenders += distance === 1 ? 2 : 1;
      } else {
        const weight =
          type === DRAGON || type === HORSE || type === ROOK ? 3 : type === PAWN ? 1 : 2;
        pressure += distance === 1 ? weight * 3 : distance === 2 ? weight * 2 : weight;
      }
    }
  }
  let handDanger = 0;
  const hand = position.hands[enemy];
  for (const type of HAND_TYPES) handDanger += (hand[type] as number) * (type === PAWN ? 1 : 3);
  return Math.min(defenders, 8) * 14 - pressure * (6 + handDanger);
}

/** 靜態評估，從走子方的角度 */
export function evaluate(position: Position): number {
  let score = 0;
  const board = position.board;
  for (let square = 0; square < CELLS; square++) {
    const piece = board[square] as number;
    if (piece === EMPTY) continue;
    const type = typeOf(piece);
    const color = colorOf(piece);
    const value = (PIECE_VALUE[type] as number) + positional(type, square, color);
    score += color === SENTE ? value : -value;
  }
  for (const type of HAND_TYPES) {
    const value = HAND_VALUE[type] as number;
    score +=
      ((position.hands[SENTE][type] as number) - (position.hands[GOTE][type] as number)) * value;
  }
  score += kingSafety(position, SENTE) - kingSafety(position, GOTE);
  return position.turn === SENTE ? score : -score;
}

/* 換手的雜湊值：同一盤面先後手不同時，兩個 SFEN 雜湊的差就是它 */
const TURN_KEY = (() => {
  const a = Position.fromSfen('4k4/9/9/9/9/9/9/9/4K4 b - 1');
  const b = Position.fromSfen('4k4/9/9/9/9/9/9/9/4K4 w - 1');
  return [a.hashLo ^ b.hashLo, a.hashHi ^ b.hashHi] as const;
})();

export interface SearchLimits {
  timeMs?: number;
  depth?: number;
  nodes?: number;
  /** 0～20，20 為全力。越低越常故意走次佳手 */
  skill?: number;
}

export interface SearchInfo {
  depth: number;
  /** 走子方角度的分數（centipawn） */
  score: number;
  /** 幾手詰（正：自己詰對手；負：被詰），沒有則為 null */
  mate: number | null;
  nodes: number;
  timeMs: number;
  pv: Move[];
}

export interface SearchOutcome {
  best: Move | null;
  info: SearchInfo;
}

class TimeUp extends Error {}

const TT_BITS = 18;
const TT_SIZE = 1 << TT_BITS;
const EXACT = 0;
const LOWER = 1;
const UPPER = 2;
const MAX_PLY = 64;

export class Engine {
  private position = Position.fromSfen();
  /** 遊戲中已出現過的局面雜湊（千日手偵測用），與搜尋路徑共用 */
  private keyLo: number[] = [];
  private keyHi: number[] = [];
  /** 搜尋中走過的手（空著記為 -1），時間到時用來把局面還原 */
  private line: number[] = [];

  private readonly ttCheck = new Int32Array(TT_SIZE);
  private readonly ttMove = new Int32Array(TT_SIZE);
  private readonly ttScore = new Int16Array(TT_SIZE);
  private readonly ttDepth = new Int8Array(TT_SIZE);
  private readonly ttFlag = new Int8Array(TT_SIZE);

  private readonly killers = new Int32Array(MAX_PLY * 2);
  private history = new Int32Array(2 * 128 * 128);

  private nodes = 0;
  private deadline = Infinity;
  private nodeLimit = Infinity;
  private random: () => number = Math.random;

  setPosition(sfen: string, moves: readonly Move[]): void {
    this.position = Position.fromSfen(sfen);
    this.keyLo = [this.position.hashLo];
    this.keyHi = [this.position.hashHi];
    for (const move of moves) {
      this.position.make(move);
      this.keyLo.push(this.position.hashLo);
      this.keyHi.push(this.position.hashHi);
    }
  }

  /** 測試用：固定亂數，讓低難度的選擇可重現 */
  setRandom(random: () => number): void {
    this.random = random;
  }

  get currentPosition(): Position {
    return this.position;
  }

  newGame(): void {
    this.ttCheck.fill(0);
    this.ttDepth.fill(0);
    this.history.fill(0);
  }

  search(limits: SearchLimits, onInfo?: (info: SearchInfo) => void): SearchOutcome {
    const started = Date.now();
    this.nodes = 0;
    this.deadline = limits.timeMs ? started + limits.timeMs : Infinity;
    this.nodeLimit = limits.nodes ?? Infinity;
    this.killers.fill(0);
    this.history = this.history.map((value) => value >> 2);
    const maxDepth = Math.min(limits.depth ?? 40, 40);
    const skill = limits.skill ?? 20;

    const legal = this.legalMoves();
    let best: Move | null = legal[0] ?? null;
    let info: SearchInfo = { depth: 0, score: 0, mate: null, nodes: 0, timeMs: 0, pv: [] };
    if (legal.length === 0) {
      info = { ...info, score: -MATE, mate: 0 };
      return { best: null, info };
    }
    if (skill < 20) return this.weakSearch(legal, skill, maxDepth, started, onInfo);

    for (let depth = 1; depth <= maxDepth; depth++) {
      try {
        const score = this.negamax(depth, -INF, INF, 0, true);
        const pv = this.principalVariation(depth);
        if (pv[0] !== undefined) best = pv[0];
        info = {
          depth,
          score,
          mate: mateDistance(score),
          nodes: this.nodes,
          timeMs: Date.now() - started,
          pv,
        };
        onInfo?.(info);
        if (Math.abs(score) > MATE_BOUND) break; // 找到詰就不必再加深
        // 下一層大概要花這一層的數倍時間，來不及就別開始
        if (limits.timeMs && Date.now() - started > limits.timeMs * 0.45) break;
      } catch (error) {
        this.restore();
        if (!(error instanceof TimeUp)) throw error;
        break;
      }
    }
    return { best, info };
  }

  /**
   * 降低棋力：每個根節點著手都用完整窗口算出分數，再加上雜訊挑選。
   * 雜訊大小隨 skill 遞減；深度也受 skill 限制。
   */
  private weakSearch(
    legal: Move[],
    skill: number,
    maxDepth: number,
    started: number,
    onInfo?: (info: SearchInfo) => void,
  ): SearchOutcome {
    const depth = Math.max(1, Math.min(maxDepth, 1 + Math.floor(skill / 5)));
    const noise = Math.round(600 * Math.pow(0.8, skill));
    const scored: { move: Move; score: number }[] = [];
    for (const move of legal) {
      this.makeMove(move);
      let score: number;
      try {
        score = -this.negamax(depth - 1, -INF, INF, 1, true);
      } catch (error) {
        this.restore();
        if (error instanceof TimeUp) break;
        throw error;
      }
      this.unmakeMove();
      scored.push({ move, score });
    }
    if (scored.length === 0) {
      return {
        best: legal[0] as Move,
        info: { depth: 0, score: 0, mate: null, nodes: this.nodes, timeMs: 0, pv: [] },
      };
    }
    // 詰み（以及避開被詰）一定看得到，否則低難度會顯得太不自然
    const mating = scored.find((entry) => entry.score > MATE_BOUND);
    const pick =
      mating ??
      scored
        .map((entry) => ({
          ...entry,
          noisy:
            entry.score > -MATE_BOUND
              ? entry.score + (this.random() - 0.5) * 2 * noise
              : entry.score,
        }))
        .sort((a, b) => b.noisy - a.noisy)[0];
    const chosen = pick as { move: Move; score: number };
    const info: SearchInfo = {
      depth,
      score: chosen.score,
      mate: mateDistance(chosen.score),
      nodes: this.nodes,
      timeMs: Date.now() - started,
      pv: [chosen.move],
    };
    onInfo?.(info);
    return { best: chosen.move, info };
  }

  /** 根節點的合法手 */
  legalMoves(): Move[] {
    const moves: Move[] = [];
    for (const move of this.position.pseudoMoves()) {
      if (this.isLegalAfterMake(move)) {
        this.position.unmake();
        moves.push(move);
      }
    }
    return moves;
  }

  /** 走 move；如果不合法就收回並回傳 false */
  private isLegalAfterMake(move: Move): boolean {
    const position = this.position;
    const mover = position.turn;
    position.make(move);
    if (position.inCheck(mover)) {
      position.unmake();
      return false;
    }
    if (isDrop(move) && moveDropType(move) === PAWN) {
      // 打步詰：只有打在對方玉正前方才可能
      const enemyKing = position.kings[position.turn];
      const front = mover === SENTE ? moveTo(move) - SIZE : moveTo(move) + SIZE;
      if (front === enemyKing && !position.hasLegalMove()) {
        position.unmake();
        return false;
      }
    }
    return true;
  }

  private makeMove(move: Move): void {
    this.position.make(move);
    this.track(move);
  }

  /** 已經 make 過的手記錄到路徑上 */
  private track(move: number): void {
    this.keyLo.push(this.position.hashLo);
    this.keyHi.push(this.position.hashHi);
    this.line.push(move);
  }

  private unmakeMove(): void {
    const move = this.line.pop();
    this.keyLo.pop();
    this.keyHi.pop();
    if (move === -1) this.toggleTurn();
    else this.position.unmake();
  }

  /** 中途停止搜尋時，把路徑上的每一手都收回 */
  private restore(): void {
    while (this.line.length > 0) this.unmakeMove();
  }

  private isRepetition(): boolean {
    const n = this.keyLo.length - 1;
    const lo = this.keyLo[n];
    const hi = this.keyHi[n];
    for (let i = n - 4; i >= 0 && i >= n - 24; i -= 2) {
      if (this.keyLo[i] === lo && this.keyHi[i] === hi) return true;
    }
    return false;
  }

  private checkTime(): void {
    if ((++this.nodes & 1023) === 0 && Date.now() > this.deadline) throw new TimeUp();
    if (this.nodes > this.nodeLimit) throw new TimeUp();
  }

  private negamax(
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
    allowNull: boolean,
  ): number {
    this.checkTime();
    const position = this.position;
    if (ply > 0 && this.isRepetition()) return 0;
    const inCheck = position.inCheck();
    if (inCheck) depth++;
    if (depth <= 0) return this.quiesce(alpha, beta, ply, 0);
    if (ply >= MAX_PLY - 2) return evaluate(position);

    // 置換表
    const slot = position.hashLo & (TT_SIZE - 1);
    let ttMove = 0;
    if (this.ttCheck[slot] === position.hashHi && this.ttDepth[slot] !== 0) {
      ttMove = this.ttMove[slot] as number;
      if (ply > 0 && (this.ttDepth[slot] as number) >= depth) {
        const stored = fromTt(this.ttScore[slot] as number, ply);
        const flag = this.ttFlag[slot];
        if (flag === EXACT) return stored;
        if (flag === LOWER && stored >= beta) return stored;
        if (flag === UPPER && stored <= alpha) return stored;
      }
    }

    const pvNode = beta - alpha > 1;
    // 空著剪枝：連讓一手都還是 ≥ beta，代表這裡夠好了
    if (allowNull && !pvNode && !inCheck && depth >= 3 && evaluate(position) >= beta) {
      this.toggleTurn();
      this.track(-1);
      const score = -this.negamax(depth - 3, -beta, -beta + 1, ply + 1, false);
      this.unmakeMove();
      if (score >= beta && score < MATE_BOUND) return beta;
    }

    const moves = this.orderMoves(position.pseudoMoves(), ttMove, ply);
    let bestScore = -INF;
    let bestMove = 0;
    let legalCount = 0;
    const originalAlpha = alpha;
    for (let i = 0; i < moves.length; i++) {
      const move = moves[i] as Move;
      const capture = !isDrop(move) && position.board[moveTo(move)] !== EMPTY;
      if (!this.isLegalAfterMake(move)) continue;
      this.track(move);
      legalCount++;
      let score: number;
      if (legalCount === 1) {
        score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
      } else {
        // 遲著減深：排序靠後的安靜手先淺看
        let reduction = 0;
        if (depth >= 3 && legalCount > 4 && !capture && !inCheck && !movePromotes(move)) {
          reduction = legalCount > 12 ? 2 : 1;
        }
        score = -this.negamax(depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && (reduction > 0 || score < beta)) {
          score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
        }
      }
      this.unmakeMove();
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        if (!capture) {
          if (this.killers[ply * 2] !== move) {
            this.killers[ply * 2 + 1] = this.killers[ply * 2] as number;
            this.killers[ply * 2] = move;
          }
          const h = this.historyIndex(move);
          this.history[h] = (this.history[h] as number) + depth * depth;
        }
        break;
      }
    }
    if (legalCount === 0) return -MATE + ply; // 將棋沒有逼和：無路可走就是輸

    const flag = bestScore <= originalAlpha ? UPPER : bestScore >= beta ? LOWER : EXACT;
    if (depth >= (this.ttDepth[slot] as number) || this.ttCheck[slot] !== position.hashHi) {
      this.ttCheck[slot] = position.hashHi;
      this.ttMove[slot] = bestMove;
      this.ttScore[slot] = toTt(bestScore, ply);
      this.ttDepth[slot] = Math.min(depth, 127);
      this.ttFlag[slot] = flag;
    }
    return bestScore;
  }

  private quiesce(alpha: number, beta: number, ply: number, qdepth: number): number {
    this.checkTime();
    const position = this.position;
    if (position.inCheck()) {
      // 被將軍時所有應將都要看，否則會誤以為安全
      let best = -MATE + ply;
      if (qdepth > 6) return evaluate(position);
      for (const move of position.pseudoMoves()) {
        if (!this.isLegalAfterMake(move)) continue;
        this.track(move);
        const score = -this.quiesce(-beta, -alpha, ply + 1, qdepth + 1);
        this.unmakeMove();
        if (score > best) best = score;
        if (score > alpha) alpha = score;
        if (alpha >= beta) break;
      }
      return best;
    }
    const standPat = evaluate(position);
    if (standPat >= beta || qdepth > 8) return standPat;
    if (standPat > alpha) alpha = standPat;
    const captures = captureMoves(position, []);
    const scored = captures.map((move) => ({
      move,
      score:
        captureValue(position.board[moveTo(move)] as number) * 16 -
        (PIECE_VALUE[typeOf(position.board[moveFrom(move)] as number)] as number),
    }));
    scored.sort((a, b) => b.score - a.score);
    for (const { move } of scored) {
      const gain = captureValue(position.board[moveTo(move)] as number);
      if (standPat + gain + 200 < alpha) continue; // 吃了也追不上
      if (!this.isLegalAfterMake(move)) continue;
      this.track(move);
      const score = -this.quiesce(-beta, -alpha, ply + 1, qdepth + 1);
      this.unmakeMove();
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return alpha;
  }

  private toggleTurn(): void {
    const position = this.position;
    position.turn = opponentOf(position.turn);
    position.hashLo ^= TURN_KEY[0];
    position.hashHi ^= TURN_KEY[1];
  }

  private historyIndex(move: Move): number {
    return this.position.turn * 128 * 128 + moveFrom(move) * 128 + moveTo(move);
  }

  private orderMoves(moves: Move[], ttMove: number, ply: number): Move[] {
    const board = this.position.board;
    const killer1 = this.killers[ply * 2];
    const killer2 = this.killers[ply * 2 + 1];
    const scores = new Float64Array(moves.length);
    for (let i = 0; i < moves.length; i++) {
      const move = moves[i] as Move;
      let score: number;
      if (move === ttMove) score = 1e9;
      else if (isDrop(move)) score = (this.history[this.historyIndex(move)] as number) - 2000;
      else {
        const target = board[moveTo(move)] as number;
        if (target !== EMPTY) {
          score =
            1e7 +
            captureValue(target) * 16 -
            (PIECE_VALUE[typeOf(board[moveFrom(move)] as number)] as number);
        } else if (move === killer1) score = 9e6;
        else if (move === killer2) score = 8e6;
        else score = this.history[this.historyIndex(move)] as number;
        if (movePromotes(move)) score += 5e5;
      }
      scores[i] = score;
    }
    const order = moves
      .map((_, i) => i)
      .sort((a, b) => (scores[b] as number) - (scores[a] as number));
    return order.map((i) => moves[i] as Move);
  }

  /** 從置換表沿最佳著手取出預想手順 */
  private principalVariation(depth: number): Move[] {
    const pv: Move[] = [];
    const legalAt = (move: Move): boolean => this.legalMoves().includes(move);
    for (let i = 0; i < depth + 4; i++) {
      const slot = this.position.hashLo & (TT_SIZE - 1);
      if (this.ttCheck[slot] !== this.position.hashHi) break;
      const move = this.ttMove[slot] as number;
      if (!move || !legalAt(move)) break;
      pv.push(move);
      this.makeMove(move);
      if (this.isRepetition()) break;
    }
    for (let i = 0; i < pv.length; i++) this.unmakeMove();
    return pv;
  }
}

const toTt = (score: number, ply: number): number =>
  score > MATE_BOUND ? score + ply : score < -MATE_BOUND ? score - ply : score;
const fromTt = (score: number, ply: number): number =>
  score > MATE_BOUND ? score - ply : score < -MATE_BOUND ? score + ply : score;

/** 分數換算成「幾手詰」 */
export function mateDistance(score: number): number | null {
  if (score > MATE_BOUND) return MATE - score;
  if (score < -MATE_BOUND) return -(MATE + score);
  return null;
}
