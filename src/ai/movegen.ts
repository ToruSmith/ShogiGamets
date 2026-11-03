import type { Move } from '../core/move.ts';
import { makeMove } from '../core/move.ts';
import type { Position } from '../core/position.ts';
import type { Color } from '../core/types.ts';
import {
  BISHOP,
  CELLS,
  DRAGON,
  EMPTY,
  GOLD,
  GOTE,
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
  rankOf,
  squareOf,
  typeOf,
} from '../core/types.ts';

/**
 * 靜止搜尋只需要「吃子」的候選手。core 的 pseudoMoves 每次都會產生上百個打入，
 * 在這裡太浪費，所以 AI 自己留一份棋子走法表，只產生吃子手。
 * 走法定義和 core/position.ts 相同；tests/engine.test.ts 會比對兩者的結果。
 */
type Delta = readonly [number, number];
const GOLD_STEPS: Delta[] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, 0],
];
const DIAG: Delta[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
const ORTHO: Delta[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const MOTIONS: Record<number, { steps: Delta[]; slides: Delta[] }> = {
  [PAWN]: { steps: [[-1, 0]], slides: [] },
  [LANCE]: { steps: [], slides: [[-1, 0]] },
  [KNIGHT]: {
    steps: [
      [-2, -1],
      [-2, 1],
    ],
    slides: [],
  },
  [SILVER]: {
    steps: [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [1, -1],
      [1, 1],
    ],
    slides: [],
  },
  [GOLD]: { steps: GOLD_STEPS, slides: [] },
  [BISHOP]: { steps: [], slides: DIAG },
  [ROOK]: { steps: [], slides: ORTHO },
  [KING]: { steps: [...DIAG, ...ORTHO], slides: [] },
  [TOKIN]: { steps: GOLD_STEPS, slides: [] },
  [NARIKYO]: { steps: GOLD_STEPS, slides: [] },
  [NARIKEI]: { steps: GOLD_STEPS, slides: [] },
  [NARIGIN]: { steps: GOLD_STEPS, slides: [] },
  [HORSE]: { steps: ORTHO, slides: DIAG },
  [DRAGON]: { steps: DIAG, slides: ORTHO },
};

const index = (type: number, color: Color): number => type + color * 16;
export const STEPS: number[][][] = [];
export const SLIDES: number[][][][] = [];

for (const color of [SENTE, GOTE] as const) {
  const sign = color === SENTE ? 1 : -1;
  for (const [key, motion] of Object.entries(MOTIONS)) {
    const steps: number[][] = [];
    const slides: number[][][] = [];
    for (let square = 0; square < CELLS; square++) {
      const rank = rankOf(square);
      const column = columnOf(square);
      const inside = (r: number, c: number): boolean => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
      steps.push(
        motion.steps
          .map(([dr, dc]) => [rank + dr * sign, column + dc * sign] as const)
          .filter(([r, c]) => inside(r, c))
          .map(([r, c]) => squareOf(r, c)),
      );
      slides.push(
        motion.slides.map(([dr, dc]) => {
          const ray: number[] = [];
          for (
            let r = rank + dr * sign, c = column + dc * sign;
            inside(r, c);
            r += dr * sign, c += dc * sign
          ) {
            ray.push(squareOf(r, c));
          }
          return ray;
        }),
      );
    }
    STEPS[index(Number(key), color)] = steps;
    SLIDES[index(Number(key), color)] = slides;
  }
}

const canPromote = (type: number): boolean => type <= ROOK && type !== GOLD;
const inZone = (square: number, color: Color): boolean =>
  color === SENTE ? rankOf(square) <= 2 : rankOf(square) >= 6;
function mustPromote(type: number, to: number, color: Color): boolean {
  const distance = color === SENTE ? rankOf(to) : SIZE - 1 - rankOf(to);
  if (type === PAWN || type === LANCE) return distance < 1;
  if (type === KNIGHT) return distance < 2;
  return false;
}

/** 吃子的候選手（未檢查自殺）。升變只產生升變版本（吃子時不升變幾乎不會更好）。 */
export function captureMoves(position: Position, out: Move[]): Move[] {
  const board = position.board;
  const color = position.turn;
  for (let from = 0; from < CELLS; from++) {
    const piece = board[from] as number;
    if (piece === EMPTY || colorOf(piece) !== color) continue;
    const type = typeOf(piece);
    const i = index(type, color);
    const add = (to: number): void => {
      const promote = canPromote(type) && (inZone(from, color) || inZone(to, color)) ? true : false;
      if (!promote && mustPromote(type, to, color)) return;
      out.push(makeMove(from, to, promote));
    };
    const steps = (STEPS[i] as number[][])[from] as number[];
    for (let k = 0; k < steps.length; k++) {
      const to = steps[k] as number;
      const target = board[to] as number;
      if (target !== EMPTY && colorOf(target) !== color) add(to);
    }
    const rays = (SLIDES[i] as number[][][])[from] as number[][];
    for (const ray of rays) {
      for (let k = 0; k < ray.length; k++) {
        const to = ray[k] as number;
        const target = board[to] as number;
        if (target === EMPTY) continue;
        if (colorOf(target) !== color) add(to);
        break;
      }
    }
  }
  return out;
}
