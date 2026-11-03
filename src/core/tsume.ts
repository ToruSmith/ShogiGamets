import { MateSolver } from './mate.ts';
import type { Move } from './move.ts';
import { Position } from './position.ts';
import { TSUME_PROBLEMS } from './tsume-data.ts';

export interface TsumeProblem {
  id: number;
  /** 幾手詰 */
  length: number;
  sfen: string;
  /** 主變化，USI 寫法 */
  solution: string[];
}

export { TSUME_PROBLEMS };

export type TsumeVerdict =
  | { kind: 'wrong' }
  /** 正確，守方應了 reply，還要繼續 */
  | { kind: 'continue'; reply: Move; remaining: number }
  | { kind: 'solved' };

/**
 * 判斷玩家在詰將棋中的一手。moves 是到目前為止（含這一手）的所有棋步。
 * 允許主變化以外的正解，只要仍能在剩餘手數內詰。
 */
export function judgeTsumeMove(problem: TsumeProblem, moves: readonly Move[]): TsumeVerdict {
  const position = Position.fromSfen(problem.sfen);
  for (const move of moves) position.make(move);
  const remaining = problem.length - moves.length;
  if (!position.inCheck()) return { kind: 'wrong' };
  const solver = new MateSolver(position);
  if (!solver.defend(remaining)) return { kind: 'wrong' };
  if (position.legalMoves().length === 0) return { kind: 'solved' };
  const reply = solver.bestDefence(remaining);
  if (reply === null) return { kind: 'solved' };
  position.make(reply);
  const left = solver.remainingAfterDefence(remaining) ?? remaining - 1;
  return { kind: 'continue', reply, remaining: left };
}
