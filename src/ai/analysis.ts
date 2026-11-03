import type { Move } from '../core/move.ts';
import { moveToUsi } from '../core/notation.ts';
import { Position } from '../core/position.ts';
import { SENTE } from '../core/types.ts';
import type { EngineInfo, ShogiEngine } from './types.ts';

/** 分數上限：詰み換算成這個值，避免圖表被極端值壓扁 */
export const SCORE_CAP = 3000;

export type MoveQuality = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export interface PlyAnalysis {
  /** 這一手之前的局面，先手角度的評估值 */
  scoreBefore: number;
  scoreAfter: number;
  /** 引擎認為的最佳著手（USI） */
  bestMove: string | null;
  played: string;
  /** 走子方因這一手損失的分數（≥ 0） */
  loss: number;
  quality: MoveQuality;
  mateBefore: number | null;
}

export interface GameAnalysis {
  /** 每個局面（0 = 開局）先手角度的評估值，長度為手數 + 1 */
  scores: number[];
  plies: PlyAnalysis[];
}

/** 引擎回報轉為先手角度的分數 */
export function senteScore(info: EngineInfo | null, sideToMoveIsSente: boolean): number {
  if (!info) return 0;
  let score: number;
  if (info.mate !== null) score = info.mate >= 0 ? SCORE_CAP : -SCORE_CAP;
  else score = Math.max(-SCORE_CAP, Math.min(SCORE_CAP, info.scoreCp ?? 0));
  return sideToMoveIsSente ? score : -score;
}

/** 評估值換成勝率（顯示用） */
export const winRate = (score: number): number => 1 / (1 + Math.exp(-score / 600));

export function classify(loss: number, isBest: boolean): MoveQuality {
  if (isBest) return 'best';
  if (loss >= 500) return 'blunder';
  if (loss >= 250) return 'mistake';
  if (loss >= 100) return 'inaccuracy';
  return 'good';
}

/**
 * 逐一分析每個局面。onProgress 用來更新進度條；可以透過 engine.cancel() 中止。
 * 損失以勝率差換算，避免大優勢時的分數波動被當成惡手。
 */
export async function analyzeGame(
  engine: ShogiEngine,
  startSfen: string,
  moves: readonly Move[],
  movetimeMs: number,
  onProgress?: (done: number, total: number) => void,
): Promise<GameAnalysis> {
  const position = Position.fromSfen(startSfen);
  const usiMoves = moves.map(moveToUsi);
  const scores: number[] = [];
  const best: (string | null)[] = [];
  const mates: (number | null)[] = [];
  for (let ply = 0; ply <= moves.length; ply++) {
    const senteToMove = position.turn === SENTE;
    if (position.legalMoves().length === 0) {
      // 被詰的局面不必問引擎
      scores.push(senteToMove ? -SCORE_CAP : SCORE_CAP);
      best.push(null);
      mates.push(0);
    } else {
      const result = await engine.search({ sfen: startSfen, moves: usiMoves.slice(0, ply), movetimeMs });
      scores.push(senteScore(result.info, senteToMove));
      best.push(result.bestMove === 'resign' ? null : result.bestMove);
      mates.push(result.info?.mate ?? null);
    }
    onProgress?.(ply + 1, moves.length + 1);
    if (ply < moves.length) position.make(moves[ply] as Move);
  }

  const replay = Position.fromSfen(startSfen);
  const plies: PlyAnalysis[] = moves.map((move, ply) => {
    const sign = replay.turn === SENTE ? 1 : -1;
    replay.make(move);
    const before = scores[ply] as number;
    const after = scores[ply + 1] as number;
    const rateLoss = (winRate(before * sign) - winRate(after * sign)) * 2000;
    const loss = Math.max(0, Math.round(Math.max(rateLoss, 0)));
    const played = usiMoves[ply] as string;
    return {
      scoreBefore: before,
      scoreAfter: after,
      bestMove: best[ply] ?? null,
      played,
      loss,
      quality: classify(loss, best[ply] === played),
      mateBefore: mates[ply] ?? null,
    };
  });
  return { scores, plies };
}
