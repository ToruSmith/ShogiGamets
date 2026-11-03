/**
 * 產生詰將棋題庫：node --import tsx scripts/generate-tsume.ts > src/core/tsume-data.ts
 *
 * 隨機在角落或邊緣擺出後手玉與攻防棋子，交給 MateSolver 篩選：
 *   - 最短詰手數正好是目標手數（沒有更短的解）
 *   - 第一手只有一種正解
 *   - 開局時後手沒有被將軍
 * 守方持有其餘全部棋子（詰將棋的慣例），合駒照實計算。
 * 種子固定，同樣的程式會產生同樣的題庫。tests/tsume.test.ts 會再驗證一次。
 */
import { MateSearchAborted, MateSolver } from '../src/core/mate.ts';
import { moveToUsi } from '../src/core/notation.ts';
import { Position } from '../src/core/position.ts';
import {
  BISHOP,
  DRAGON,
  GOLD,
  GOTE,
  HORSE,
  KING,
  KNIGHT,
  LANCE,
  PAWN,
  ROOK,
  SENTE,
  SILVER,
  TOKIN,
  baseType,
  columnOf,
  rankOf,
  squareOf,
} from '../src/core/types.ts';

let seed = 0x5eed1234;
const random = (): number => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 0x100000000;
};
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
const int = (min: number, max: number): number => min + Math.floor(random() * (max - min + 1));

const TOTALS: Record<number, number> = {
  [PAWN]: 18,
  [LANCE]: 4,
  [KNIGHT]: 4,
  [SILVER]: 4,
  [GOLD]: 4,
  [BISHOP]: 2,
  [ROOK]: 2,
};
const LETTER: Record<number, string> = {
  [PAWN]: 'P',
  [LANCE]: 'L',
  [KNIGHT]: 'N',
  [SILVER]: 'S',
  [GOLD]: 'G',
  [BISHOP]: 'B',
  [ROOK]: 'R',
  [KING]: 'K',
};

interface Placed {
  square: number;
  type: number;
  color: 0 | 1;
}

function pieceText({ type, color }: Placed): string {
  const promoted = type > KING;
  const letter = LETTER[promoted ? type - 8 : type] as string;
  const cased = color === SENTE ? letter : letter.toLowerCase();
  return promoted ? `+${cased}` : cased;
}

function canStay(type: number, square: number, color: 0 | 1): boolean {
  const distance = color === SENTE ? rankOf(square) : 8 - rankOf(square);
  if (type === PAWN || type === LANCE) return distance >= 1;
  if (type === KNIGHT) return distance >= 2;
  return true;
}

function randomPosition(attackers: number, handCount: number): string | null {
  const kingSquare = squareOf(int(0, 2), random() < 0.5 ? int(0, 1) : int(0, 8));
  const placed: Placed[] = [{ square: kingSquare, type: KING, color: GOTE }];
  const occupied = new Set([kingSquare]);
  const near = (radius: number): number | null => {
    for (let tries = 0; tries < 30; tries++) {
      const rank = rankOf(kingSquare) + int(-radius, radius);
      const column = columnOf(kingSquare) + int(-radius, radius);
      if (rank < 0 || rank > 8 || column < 0 || column > 8) continue;
      const square = squareOf(rank, column);
      if (!occupied.has(square)) return square;
    }
    return null;
  };
  const place = (type: number, color: 0 | 1, radius: number): boolean => {
    const square = near(radius);
    if (square === null || !canStay(type, square, color)) return false;
    if (type === PAWN) {
      const clash = placed.some(
        (p) => p.type === PAWN && p.color === color && columnOf(p.square) === columnOf(square),
      );
      if (clash) return false;
    }
    placed.push({ square, type, color });
    occupied.add(square);
    return true;
  };

  for (let i = int(0, 3); i > 0; i--) {
    place(pick([GOLD, SILVER, PAWN, LANCE, KNIGHT, GOLD, SILVER]), GOTE, 2);
  }
  let placedAttackers = 0;
  for (let tries = 0; tries < 10 && placedAttackers < attackers; tries++) {
    const type = pick([GOLD, SILVER, ROOK, BISHOP, KNIGHT, LANCE, PAWN, DRAGON, HORSE, TOKIN]);
    if (place(type, SENTE, type === ROOK || type === BISHOP || type === LANCE ? 4 : 2)) {
      placedAttackers++;
    }
  }
  if (placedAttackers === 0) return null;

  const hand: number[] = [];
  for (let i = 0; i < handCount; i++) hand.push(pick([GOLD, SILVER, ROOK, BISHOP, KNIGHT, LANCE, PAWN, GOLD]));

  // 數量不能超過一副棋的總數
  const used: Record<number, number> = {};
  for (const p of placed) if (p.type !== KING) used[baseType(p.type)] = (used[baseType(p.type)] ?? 0) + 1;
  for (const type of hand) used[type] = (used[type] ?? 0) + 1;
  for (const [type, count] of Object.entries(used)) {
    if (count > (TOTALS[Number(type)] as number)) return null;
  }

  const ranks: string[] = [];
  for (let rank = 0; rank < 9; rank++) {
    let text = '';
    let gap = 0;
    for (let column = 0; column < 9; column++) {
      const piece = placed.find((p) => p.square === squareOf(rank, column));
      if (!piece) {
        gap++;
        continue;
      }
      if (gap) text += gap;
      gap = 0;
      text += pieceText(piece);
    }
    if (gap) text += gap;
    ranks.push(text);
  }
  const handText = (counts: Record<number, number>, color: 0 | 1): string =>
    [ROOK, BISHOP, GOLD, SILVER, KNIGHT, LANCE, PAWN]
      .filter((type) => (counts[type] ?? 0) > 0)
      .map((type) => {
        const count = counts[type] as number;
        const letter = LETTER[type] as string;
        return (count > 1 ? count : '') + (color === SENTE ? letter : letter.toLowerCase());
      })
      .join('');
  const senteHand: Record<number, number> = {};
  for (const type of hand) senteHand[type] = (senteHand[type] ?? 0) + 1;
  const goteHand: Record<number, number> = {};
  for (const [type, total] of Object.entries(TOTALS)) {
    goteHand[Number(type)] = total - (used[Number(type)] ?? 0);
  }
  const hands = handText(senteHand, SENTE) + handText(goteHand, GOTE);
  return `${ranks.join('/')} b ${hands || '-'} 1`;
}

interface Found {
  sfen: string;
  length: number;
  solution: string[];
}

function evaluate(sfen: string, target: number): Found | null {
  const position = Position.fromSfen(sfen);
  if (position.inCheck(GOTE)) return null;
  const solver = new MateSolver(position, 400_000);
  try {
    if (solver.shortestMate(target) !== target) return null;
    if (solver.winningAttacks(target).length !== 1) return null;
    const line = solver.mainLine(target);
    if (!line || line.length !== target) return null;
    return { sfen, length: target, solution: line.map(moveToUsi) };
  } catch (error) {
    if (error instanceof MateSearchAborted) return null;
    throw error;
  }
}

const PLAN: [number, number][] = [
  [1, 12],
  [3, 12],
  [5, 8],
  [7, 4],
];

const results: Found[] = [];
const seen = new Set<string>();
for (const [target, wanted] of PLAN) {
  let found = 0;
  for (let attempt = 0; found < wanted && attempt < 400_000; attempt++) {
    const sfen = randomPosition(int(1, target >= 5 ? 3 : 2), int(target === 1 ? 0 : 1, 2));
    if (!sfen || seen.has(sfen)) continue;
    seen.add(sfen);
    let position: Position;
    try {
      position = Position.fromSfen(sfen);
    } catch {
      continue;
    }
    // 先快速排除：完全沒有將軍手的局面
    if (new MateSolver(position).checks().length === 0) continue;
    const result = evaluate(sfen, target);
    if (result) {
      results.push(result);
      found++;
      process.stderr.write(`${target} 手詰 ${found}/${wanted}（第 ${attempt} 次嘗試）\n`);
    }
  }
}

const body = results
  .map(
    (p, index) =>
      `  { id: ${index + 1}, length: ${p.length}, sfen: '${p.sfen}', solution: ${JSON.stringify(p.solution).replace(/"/g, "'").replace(/,/g, ', ')} },`,
  )
  .join('\n');

process.stdout.write(`// 由 scripts/generate-tsume.ts 產生，請勿手動修改。
import type { TsumeProblem } from './tsume.ts';

export const TSUME_PROBLEMS: readonly TsumeProblem[] = [
${body}
];
`);
