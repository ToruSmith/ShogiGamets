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
import type { Position } from './position.ts';
import {
  BISHOP,
  DRAGON,
  GOLD,
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
  TOKIN,
  fileOf,
  rankOf,
  squareOf,
  typeOf,
} from './types.ts';

const RANK_LETTERS = 'abcdefghi';
const DROP_LETTERS: Record<number, string> = {
  [PAWN]: 'P',
  [LANCE]: 'L',
  [KNIGHT]: 'N',
  [SILVER]: 'S',
  [GOLD]: 'G',
  [BISHOP]: 'B',
  [ROOK]: 'R',
};

const squareToUsi = (square: number): string =>
  `${fileOf(square)}${RANK_LETTERS[rankOf(square)] as string}`;

function usiToSquare(text: string): number | null {
  const file = Number(text[0]);
  const rank = RANK_LETTERS.indexOf(text[1] ?? '');
  if (!(file >= 1 && file <= 9) || rank < 0) return null;
  return squareOf(rank, 9 - file);
}

/** USI 棋譜：7g7f、8h2b+、P*5e */
export function moveToUsi(move: Move): string {
  const to = squareToUsi(moveTo(move));
  if (isDrop(move)) return `${DROP_LETTERS[moveDropType(move)] as string}*${to}`;
  return `${squareToUsi(moveFrom(move))}${to}${movePromotes(move) ? '+' : ''}`;
}

export function usiToMove(text: string): Move | null {
  const drop = /^([PLNSGBR])\*([1-9][a-i])$/.exec(text);
  if (drop) {
    const type = Object.entries(DROP_LETTERS).find(([, letter]) => letter === drop[1])?.[0];
    const to = usiToSquare(drop[2] as string);
    return type && to !== null ? makeDrop(Number(type), to) : null;
  }
  const normal = /^([1-9][a-i])([1-9][a-i])(\+?)$/.exec(text);
  if (!normal) return null;
  const from = usiToSquare(normal[1] as string);
  const to = usiToSquare(normal[2] as string);
  if (from === null || to === null) return null;
  return makeMove(from, to, normal[3] === '+');
}

const KANJI_RANKS = '一二三四五六七八九';
const WIDE_FILES = '１２３４５６７８９';

export const PIECE_NAMES: Record<number, string> = {
  [PAWN]: '歩',
  [LANCE]: '香',
  [KNIGHT]: '桂',
  [SILVER]: '銀',
  [GOLD]: '金',
  [BISHOP]: '角',
  [ROOK]: '飛',
  [KING]: '玉',
  [TOKIN]: 'と',
  [NARIKYO]: '成香',
  [NARIKEI]: '成桂',
  [NARIGIN]: '成銀',
  [HORSE]: '馬',
  [DRAGON]: '龍',
};

/** 日文棋譜，例如 ▲７六歩(77)。position 必須是這手走之前的局面。 */
export function moveToKifu(move: Move, position: Position, previousTo: number | null): string {
  const mark = position.turn === SENTE ? '▲' : '△';
  const to = moveTo(move);
  const target =
    to === previousTo
      ? '同　'
      : `${WIDE_FILES[fileOf(to) - 1] as string}${KANJI_RANKS[rankOf(to)] as string}`;
  if (isDrop(move)) return `${mark}${target}${PIECE_NAMES[moveDropType(move)] as string}打`;
  const from = moveFrom(move);
  const type = typeOf(position.board[from] as number);
  const origin = `(${fileOf(from)}${rankOf(from) + 1})`;
  return `${mark}${target}${PIECE_NAMES[type] as string}${movePromotes(move) ? '成' : ''}${origin}`;
}

