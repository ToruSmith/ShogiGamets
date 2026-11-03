/** 先手（下方）為 0，後手（上方）為 1。 */
export const SENTE = 0;
export const GOTE = 1;
export type Color = typeof SENTE | typeof GOTE;

export const opponentOf = (color: Color): Color => (color === SENTE ? GOTE : SENTE);

/** 棋種編號。升變後的棋子是原編號加 PROMOTED。 */
export const PAWN = 1;
export const LANCE = 2;
export const KNIGHT = 3;
export const SILVER = 4;
export const GOLD = 5;
export const BISHOP = 6;
export const ROOK = 7;
export const KING = 8;
export const PROMOTED = 8;
export const TOKIN = PAWN + PROMOTED;
export const NARIKYO = LANCE + PROMOTED;
export const NARIKEI = KNIGHT + PROMOTED;
export const NARIGIN = SILVER + PROMOTED;
export const HORSE = BISHOP + PROMOTED;
export const DRAGON = ROOK + PROMOTED;

/** 棋盤格內容：0 空，否則為 棋種 | (顏色 << 4) */
export const EMPTY = 0;
const COLOR_SHIFT = 4;
export const TYPE_MASK = 15;

export const makePiece = (type: number, color: Color): number => type | (color << COLOR_SHIFT);
export const typeOf = (piece: number): number => piece & TYPE_MASK;
export const colorOf = (piece: number): Color => (piece >> COLOR_SHIFT) as Color;
export const baseType = (type: number): number => (type > KING ? type - PROMOTED : type);

export const SIZE = 9;
export const CELLS = 81;

/**
 * 格子編號 = 段 * 9 + 欄。段 0 是最上面的「一段」，欄 0 是最左邊的「9 筋」，
 * 和 SFEN 字串的排列順序相同。
 */
export const squareOf = (rank: number, column: number): number => rank * SIZE + column;
export const rankOf = (square: number): number => Math.floor(square / SIZE);
export const columnOf = (square: number): number => square % SIZE;
/** 棋譜上的筋（1 到 9） */
export const fileOf = (square: number): number => SIZE - columnOf(square);

/** 打入可用的棋種，依棋譜慣用順序 */
export const HAND_TYPES = [ROOK, BISHOP, GOLD, SILVER, KNIGHT, LANCE, PAWN] as const;

export type GameEnd =
  | 'checkmate'
  | 'repetition'
  | 'perpetual-check'
  | 'resign'
  | 'timeout'
  | 'declaration';

export interface GameResult {
  /** null 代表和局（千日手） */
  winner: Color | null;
  reason: GameEnd;
}
