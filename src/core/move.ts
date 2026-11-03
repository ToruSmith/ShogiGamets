import { CELLS } from './types.ts';

/**
 * 棋步壓成一個整數，方便 AI 大量處理：
 *   位元 0-6  起點（打入時為 81）
 *   位元 7-13 終點
 *   位元 14   是否升變
 *   位元 15-18 打入的棋種
 */
export type Move = number;

export const DROP = CELLS;

export const makeMove = (from: number, to: number, promote: boolean): Move =>
  from | (to << 7) | (promote ? 1 << 14 : 0);
export const makeDrop = (type: number, to: number): Move => DROP | (to << 7) | (type << 15);

export const moveFrom = (move: Move): number => move & 127;
export const moveTo = (move: Move): number => (move >> 7) & 127;
export const movePromotes = (move: Move): boolean => ((move >> 14) & 1) === 1;
export const moveDropType = (move: Move): number => (move >> 15) & 15;
export const isDrop = (move: Move): boolean => moveFrom(move) === DROP;
