import type { Move } from './move.ts';
import {
  isDrop,
  makeDrop,
  makeMove,
  moveDropType,
  moveFrom,
  movePromotes,
  moveTo,
} from './move.ts';
import type { Color } from './types.ts';
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
  PROMOTED,
  ROOK,
  SENTE,
  SILVER,
  SIZE,
  TOKIN,
  baseType,
  colorOf,
  columnOf,
  makePiece,
  opponentOf,
  rankOf,
  squareOf,
  typeOf,
} from './types.ts';

export const START_SFEN = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';

/** 先手視角的步進方向 [段差, 欄差] */
type Delta = readonly [number, number];
const FORWARD: Delta = [-1, 0];
const DIAGONALS: readonly Delta[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
const ORTHOGONALS: readonly Delta[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const GOLD_STEPS: readonly Delta[] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, 0],
];

interface Motion {
  steps: readonly Delta[];
  slides: readonly Delta[];
}

const MOTIONS: Record<number, Motion> = {
  [PAWN]: { steps: [FORWARD], slides: [] },
  [LANCE]: { steps: [], slides: [FORWARD] },
  [KNIGHT]: {
    steps: [
      [-2, -1],
      [-2, 1],
    ],
    slides: [],
  },
  [SILVER]: { steps: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 1]], slides: [] },
  [GOLD]: { steps: GOLD_STEPS, slides: [] },
  [BISHOP]: { steps: [], slides: DIAGONALS },
  [ROOK]: { steps: [], slides: ORTHOGONALS },
  [KING]: { steps: [...DIAGONALS, ...ORTHOGONALS], slides: [] },
  [TOKIN]: { steps: GOLD_STEPS, slides: [] },
  [NARIKYO]: { steps: GOLD_STEPS, slides: [] },
  [NARIKEI]: { steps: GOLD_STEPS, slides: [] },
  [NARIGIN]: { steps: GOLD_STEPS, slides: [] },
  [HORSE]: { steps: ORTHOGONALS, slides: DIAGONALS },
  [DRAGON]: { steps: DIAGONALS, slides: ORTHOGONALS },
};

const motionOf = (type: number): Motion => MOTIONS[type] as Motion;

/** 預先算好每種棋、每個顏色在每一格的走法，生成棋步時不用反覆判斷邊界 */
const pieceIndex = (type: number, color: Color): number => type + color * 16;
const STEP_TABLE: number[][][] = [];
const SLIDE_TABLE: number[][][][] = [];

function buildTables(): void {
  for (const color of [SENTE, GOTE] as const) {
    for (const key of Object.keys(MOTIONS)) {
      const type = Number(key);
      const sign = color === SENTE ? 1 : -1;
      const { steps, slides } = motionOf(type);
      const stepRows: number[][] = [];
      const slideRows: number[][][] = [];
      for (let square = 0; square < CELLS; square++) {
        const rank = rankOf(square);
        const column = columnOf(square);
        const onBoard = (r: number, c: number): boolean =>
          r >= 0 && r < SIZE && c >= 0 && c < SIZE;
        stepRows.push(
          steps
            .map(([dr, dc]) => [rank + dr * sign, column + dc * sign] as const)
            .filter(([r, c]) => onBoard(r, c))
            .map(([r, c]) => squareOf(r, c)),
        );
        slideRows.push(
          slides.map(([dr, dc]) => {
            const ray: number[] = [];
            let r = rank + dr * sign;
            let c = column + dc * sign;
            while (onBoard(r, c)) {
              ray.push(squareOf(r, c));
              r += dr * sign;
              c += dc * sign;
            }
            return ray;
          }),
        );
      }
      STEP_TABLE[pieceIndex(type, color)] = stepRows;
      SLIDE_TABLE[pieceIndex(type, color)] = slideRows;
    }
  }
}
buildTables();

const inPromotionZone = (square: number, color: Color): boolean =>
  color === SENTE ? rankOf(square) <= 2 : rankOf(square) >= 6;

/** 這個棋種走到 square 後還動得了嗎（步、香不能停在最後一段，桂不能停在最後兩段） */
function canStayAt(type: number, square: number, color: Color): boolean {
  const distance = color === SENTE ? rankOf(square) : SIZE - 1 - rankOf(square);
  if (type === PAWN || type === LANCE) return distance >= 1;
  if (type === KNIGHT) return distance >= 2;
  return true;
}

const canPromote = (type: number): boolean => type <= ROOK && type !== GOLD;

/* Zobrist：固定種子，讓千日手判定每次都一致 */
const ZOBRIST_COUNT = CELLS * 32 + 2 * 8 * 20 + 1;
const zobristLo = new Int32Array(ZOBRIST_COUNT);
const zobristHi = new Int32Array(ZOBRIST_COUNT);
{
  let state = 0x9e3779b9 | 0;
  const next = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state;
  };
  for (let i = 0; i < ZOBRIST_COUNT; i++) {
    zobristLo[i] = next();
    zobristHi[i] = next();
  }
}
const boardKey = (square: number, piece: number): number => square * 32 + piece;
const handKey = (color: Color, type: number, count: number): number =>
  CELLS * 32 + color * 8 * 20 + (type - 1) * 20 + count;
const TURN_KEY = ZOBRIST_COUNT - 1;

interface Undo {
  move: Move;
  captured: number;
}

/** 一個局面，以及在其上走子、悔棋與產生合法手的能力。 */
export class Position {
  readonly board = new Int8Array(CELLS);
  /** hands[顏色][棋種] = 持有數量 */
  readonly hands: [Int8Array, Int8Array] = [new Int8Array(9), new Int8Array(9)];
  readonly kings: [number, number] = [-1, -1];
  turn: Color = SENTE;
  hashLo = 0;
  hashHi = 0;
  private readonly undoStack: Undo[] = [];

  static fromSfen(sfen: string = START_SFEN): Position {
    const position = new Position();
    const [boardPart, turnPart, handPart] = sfen.trim().split(/\s+/);
    if (!boardPart || !turnPart || !handPart) throw new Error(`SFEN 格式錯誤：${sfen}`);
    const ranks = boardPart.split('/');
    if (ranks.length !== SIZE) throw new Error(`SFEN 段數錯誤：${sfen}`);
    ranks.forEach((text, rank) => {
      let column = 0;
      let promoted = false;
      for (const char of text) {
        if (char === '+') {
          promoted = true;
          continue;
        }
        if (/[1-9]/.test(char)) {
          column += Number(char);
          continue;
        }
        const type = letterToType(char);
        if (column >= SIZE) throw new Error(`SFEN 欄數錯誤：${sfen}`);
        const color = char === char.toUpperCase() ? SENTE : GOTE;
        position.put(squareOf(rank, column), makePiece(promoted ? type + PROMOTED : type, color));
        promoted = false;
        column++;
      }
      if (column !== SIZE) throw new Error(`SFEN 欄數錯誤：${sfen}`);
    });
    position.turn = turnPart === 'w' ? GOTE : SENTE;
    if (position.turn === GOTE) position.toggleTurnHash();
    if (handPart !== '-') {
      for (const match of handPart.matchAll(/(\d*)([A-Za-z])/g)) {
        const count = Number(match[1] || 1);
        const letter = match[2] as string;
        const color = letter === letter.toUpperCase() ? SENTE : GOTE;
        const type = letterToType(letter);
        for (let i = 0; i < count; i++) position.addToHand(color, type);
      }
    }
    return position;
  }

  toSfen(moveNumber = 1): string {
    const ranks: string[] = [];
    for (let rank = 0; rank < SIZE; rank++) {
      let text = '';
      let gap = 0;
      for (let column = 0; column < SIZE; column++) {
        const piece = this.board[squareOf(rank, column)] as number;
        if (piece === EMPTY) {
          gap++;
          continue;
        }
        if (gap) text += gap;
        gap = 0;
        text += pieceLetter(piece);
      }
      if (gap) text += gap;
      ranks.push(text);
    }
    let hand = '';
    for (const color of [SENTE, GOTE] as const) {
      for (const type of HAND_TYPES) {
        const count = this.hands[color][type] as number;
        if (!count) continue;
        hand += (count > 1 ? count : '') + pieceLetter(makePiece(type, color));
      }
    }
    return `${ranks.join('/')} ${this.turn === SENTE ? 'b' : 'w'} ${hand || '-'} ${moveNumber}`;
  }

  private put(square: number, piece: number): void {
    this.board[square] = piece;
    if (typeOf(piece) === KING) this.kings[colorOf(piece)] = square;
    this.toggleHash(boardKey(square, piece));
  }

  private lift(square: number): void {
    const piece = this.board[square] as number;
    this.board[square] = EMPTY;
    this.toggleHash(boardKey(square, piece));
  }

  private addToHand(color: Color, type: number): void {
    const hand = this.hands[color];
    const count = (hand[type] as number) + 1;
    hand[type] = count;
    this.toggleHash(handKey(color, type, count));
  }

  private takeFromHand(color: Color, type: number): void {
    const hand = this.hands[color];
    const count = hand[type] as number;
    hand[type] = count - 1;
    this.toggleHash(handKey(color, type, count));
  }

  private toggleHash(key: number): void {
    this.hashLo ^= zobristLo[key] as number;
    this.hashHi ^= zobristHi[key] as number;
  }

  private toggleTurnHash(): void {
    this.toggleHash(TURN_KEY);
  }

  get repetitionKey(): string {
    return `${this.hashLo}:${this.hashHi}`;
  }

  /** 走一步。不檢查合法性，呼叫端應使用 legalMoves 的結果。 */
  make(move: Move): void {
    const to = moveTo(move);
    const color = this.turn;
    let captured: number = EMPTY;
    if (isDrop(move)) {
      const type = moveDropType(move);
      this.takeFromHand(color, type);
      this.put(to, makePiece(type, color));
    } else {
      const from = moveFrom(move);
      const piece = this.board[from] as number;
      captured = this.board[to] as number;
      if (captured !== EMPTY) {
        this.lift(to);
        this.addToHand(color, baseType(typeOf(captured)));
      }
      this.lift(from);
      this.put(to, movePromotes(move) ? piece + PROMOTED : piece);
    }
    this.undoStack.push({ move, captured });
    this.turn = opponentOf(color);
    this.toggleTurnHash();
  }

  unmake(): void {
    const undo = this.undoStack.pop();
    if (!undo) throw new Error('沒有可以收回的棋步');
    const { move, captured } = undo;
    const to = moveTo(move);
    const color = opponentOf(this.turn);
    this.turn = color;
    this.toggleTurnHash();
    if (isDrop(move)) {
      this.lift(to);
      this.addToHand(color, moveDropType(move));
    } else {
      const from = moveFrom(move);
      const piece = this.board[to] as number;
      this.lift(to);
      this.put(from, movePromotes(move) ? piece - PROMOTED : piece);
      if (captured !== EMPTY) {
        this.takeFromHand(color, baseType(typeOf(captured)));
        this.put(to, captured);
      }
    }
  }

  /** square 是否被 attacker 的棋子攻擊。 */
  isAttacked(square: number, attacker: Color): boolean {
    const board = this.board;
    const defender = opponentOf(attacker);
    // 從被攻擊的格子反向看：以守方視角走某棋種能碰到攻方同棋種，就代表被攻擊
    for (const type of ATTACK_STEP_TYPES) {
      const reach = (STEP_TABLE[pieceIndex(type, defender)] as number[][])[square] as number[];
      const target = makePiece(type, attacker);
      for (let i = 0; i < reach.length; i++) {
        if (board[reach[i] as number] === target) return true;
      }
    }
    for (const type of ATTACK_SLIDE_TYPES) {
      const rays = (SLIDE_TABLE[pieceIndex(type, defender)] as number[][][])[square] as number[][];
      const target = makePiece(type, attacker);
      for (const ray of rays) {
        for (let i = 0; i < ray.length; i++) {
          const piece = board[ray[i] as number] as number;
          if (piece === EMPTY) continue;
          if (piece === target) return true;
          if (type === ROOK && piece === makePiece(DRAGON, attacker)) return true;
          if (type === BISHOP && piece === makePiece(HORSE, attacker)) return true;
          break;
        }
      }
    }
    return false;
  }

  inCheck(color: Color = this.turn): boolean {
    const king = this.kings[color];
    return king >= 0 && this.isAttacked(king, opponentOf(color));
  }

  /** 產生尚未檢查自殺與打步詰的候選手。 */
  pseudoMoves(out: Move[] = []): Move[] {
    const color = this.turn;
    const board = this.board;
    for (let from = 0; from < CELLS; from++) {
      const piece = board[from] as number;
      if (piece === EMPTY || colorOf(piece) !== color) continue;
      const type = typeOf(piece);
      const index = pieceIndex(type, color);
      const steps = (STEP_TABLE[index] as number[][])[from] as number[];
      for (let i = 0; i < steps.length; i++) {
        const to = steps[i] as number;
        const target = board[to] as number;
        if (target === EMPTY || colorOf(target) !== color) this.addMoves(out, from, to, type, color);
      }
      const rays = (SLIDE_TABLE[index] as number[][][])[from] as number[][];
      for (const ray of rays) {
        for (let i = 0; i < ray.length; i++) {
          const to = ray[i] as number;
          const target = board[to] as number;
          if (target !== EMPTY && colorOf(target) === color) break;
          this.addMoves(out, from, to, type, color);
          if (target !== EMPTY) break;
        }
      }
    }
    this.addDrops(out, color);
    return out;
  }

  private addMoves(out: Move[], from: number, to: number, type: number, color: Color): void {
    if (canPromote(type) && (inPromotionZone(from, color) || inPromotionZone(to, color))) {
      out.push(makeMove(from, to, true));
    }
    if (canStayAt(type, to, color)) out.push(makeMove(from, to, false));
  }

  private addDrops(out: Move[], color: Color): void {
    const hand = this.hands[color];
    let pawnFiles = 0;
    if ((hand[PAWN] as number) > 0) {
      const ownPawn = makePiece(PAWN, color);
      for (let square = 0; square < CELLS; square++) {
        if (this.board[square] === ownPawn) pawnFiles |= 1 << columnOf(square);
      }
    }
    for (const type of HAND_TYPES) {
      if ((hand[type] as number) === 0) continue;
      for (let to = 0; to < CELLS; to++) {
        if (this.board[to] !== EMPTY || !canStayAt(type, to, color)) continue;
        if (type === PAWN && pawnFiles & (1 << columnOf(to))) continue;
        out.push(makeDrop(type, to));
      }
    }
  }

  /** 這一手走完後自己的王不會被吃。 */
  private leavesKingSafe(move: Move): boolean {
    const color = this.turn;
    this.make(move);
    const safe = !this.inCheck(color);
    this.unmake();
    return safe;
  }

  /** 打步詰：用打步將軍，且對手無處可逃。 */
  private isPawnDropMate(move: Move): boolean {
    if (!isDrop(move) || moveDropType(move) !== PAWN) return false;
    const to = moveTo(move);
    const enemyKing = this.kings[opponentOf(this.turn)];
    // 步只能正前方將軍
    const target = this.turn === SENTE ? to - SIZE : to + SIZE;
    if (target !== enemyKing) return false;
    this.make(move);
    const mated = !this.hasLegalMove();
    this.unmake();
    return mated;
  }

  /** 是否還有任何合法手（打步詰不影響結論，所以不檢查，避免遞迴）。 */
  hasLegalMove(): boolean {
    for (const move of this.pseudoMoves()) {
      if (this.leavesKingSafe(move)) return true;
    }
    return false;
  }

  legalMoves(): Move[] {
    return this.pseudoMoves().filter(
      (move) => this.leavesKingSafe(move) && !this.isPawnDropMate(move),
    );
  }

  isLegal(move: Move): boolean {
    return this.legalMoves().includes(move);
  }

  /** 走子數量基準測試：標準的規則驗證方法 */
  perft(depth: number): number {
    const moves = this.legalMoves();
    if (depth <= 1) return moves.length;
    let nodes = 0;
    for (const move of moves) {
      this.make(move);
      nodes += this.perft(depth - 1);
      this.unmake();
    }
    return nodes;
  }
}

/** 由步進攻擊的棋種（馬的直走、龍的斜走也算在內） */
const ATTACK_STEP_TYPES = [
  PAWN,
  KNIGHT,
  SILVER,
  GOLD,
  KING,
  TOKIN,
  NARIKYO,
  NARIKEI,
  NARIGIN,
  HORSE,
  DRAGON,
] as const;
const ATTACK_SLIDE_TYPES = [LANCE, BISHOP, ROOK] as const;

const LETTERS = ' PLNSGBRK';

function letterToType(letter: string): number {
  const type = LETTERS.indexOf(letter.toUpperCase());
  if (type < 1) throw new Error(`未知的棋子：${letter}`);
  return type;
}

function pieceLetter(piece: number): string {
  const type = typeOf(piece);
  const promoted = type > KING;
  const letter = LETTERS[promoted ? type - PROMOTED : type] as string;
  const text = colorOf(piece) === SENTE ? letter : letter.toLowerCase();
  return promoted ? `+${text}` : text;
}
