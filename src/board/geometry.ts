import type { Color } from '../core/types.ts';
import { SENTE, columnOf, rankOf, squareOf } from '../core/types.ts';

/** 將棋的格子是直的長方形（約 33 × 36 mm） */
export const CELL_W = 100;
export const CELL_H = 109;
export const MARGIN_TOP = 46;
export const MARGIN_RIGHT = 46;
export const MARGIN_LEFT = 18;
export const MARGIN_BOTTOM = 18;
export const BOARD_W = MARGIN_LEFT + CELL_W * 9 + MARGIN_RIGHT;
export const BOARD_H = MARGIN_TOP + CELL_H * 9 + MARGIN_BOTTOM;
/** 盤的側面厚度 */
export const BOARD_SIDE = 26;

/** 格子在畫面上的欄、段（考慮翻轉） */
export function displayOf(square: number, bottom: Color): { column: number; row: number } {
  const column = columnOf(square);
  const row = rankOf(square);
  return bottom === SENTE ? { column, row } : { column: 8 - column, row: 8 - row };
}

export function squareAtDisplay(column: number, row: number, bottom: Color): number {
  return bottom === SENTE ? squareOf(row, column) : squareOf(8 - row, 8 - column);
}

/** 格子中心的 SVG 座標 */
export function centerOf(square: number, bottom: Color): { x: number; y: number } {
  const { column, row } = displayOf(square, bottom);
  return { x: MARGIN_LEFT + (column + 0.5) * CELL_W, y: MARGIN_TOP + (row + 0.5) * CELL_H };
}

/** SVG 座標落在哪一格；盤外為 null */
export function squareAtPoint(x: number, y: number, bottom: Color): number | null {
  const column = Math.floor((x - MARGIN_LEFT) / CELL_W);
  const row = Math.floor((y - MARGIN_TOP) / CELL_H);
  if (column < 0 || column > 8 || row < 0 || row > 8) return null;
  return squareAtDisplay(column, row, bottom);
}
