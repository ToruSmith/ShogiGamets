import type { Position } from './position.ts';
import type { Color } from './types.ts';
import {
  BISHOP,
  CELLS,
  DRAGON,
  EMPTY,
  HORSE,
  KING,
  ROOK,
  SENTE,
  colorOf,
  rankOf,
  typeOf,
} from './types.ts';

/**
 * 入玉宣言，採 CSA 的 27 點法。條件全部成立才能宣言勝：
 * 輪到宣言方、沒有被將軍、玉在敵陣三段以內、敵陣內玉以外有 10 枚以上的駒，
 * 持駒與敵陣內的駒合計先手 28 點、後手 27 點以上（飛角與其成駒 5 點，其餘 1 點）。
 */
const MIN_PIECES = 10;

const inEnemyCamp = (square: number, color: Color): boolean =>
  color === SENTE ? rankOf(square) <= 2 : rankOf(square) >= 6;

const pieceValue = (type: number): number =>
  type === ROOK || type === BISHOP || type === DRAGON || type === HORSE ? 5 : 1;

export interface DeclarationCount {
  /** 敵陣內玉以外的駒數 */
  pieces: number;
  points: number;
}

export function countDeclaration(position: Position, color: Color): DeclarationCount {
  let pieces = 0;
  let points = 0;
  for (let square = 0; square < CELLS; square++) {
    const piece = position.board[square] as number;
    if (piece === EMPTY || colorOf(piece) !== color || !inEnemyCamp(square, color)) continue;
    const type = typeOf(piece);
    if (type === KING) continue;
    pieces++;
    points += pieceValue(type);
  }
  position.hands[color].forEach((count, type) => {
    points += count * pieceValue(type);
  });
  return { pieces, points };
}

export const requiredPoints = (color: Color): number => (color === SENTE ? 28 : 27);

/** 走子方現在能不能宣言勝 */
export function canDeclare(position: Position): boolean {
  const color = position.turn;
  if (position.inCheck() || !inEnemyCamp(position.kings[color], color)) return false;
  const { pieces, points } = countDeclaration(position, color);
  return pieces >= MIN_PIECES && points >= requiredPoints(color);
}
