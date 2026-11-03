/**
 * 難度。skill 對應 USI 的 SkillLevel（0～20）：內建引擎與 YaneuraOu 都認得。
 * 低難度在內建引擎裡是「淺讀＋分數加雜訊」，所以會犯人類式的錯而不是亂走。
 */
export interface AiLevel {
  id: number;
  skill: number;
  movetimeMs: number;
}

export const AI_LEVELS: readonly AiLevel[] = [
  { id: 1, skill: 0, movetimeMs: 400 },
  { id: 2, skill: 4, movetimeMs: 600 },
  { id: 3, skill: 8, movetimeMs: 800 },
  { id: 4, skill: 12, movetimeMs: 1200 },
  { id: 5, skill: 16, movetimeMs: 1500 },
  { id: 6, skill: 20, movetimeMs: 1000 },
  { id: 7, skill: 20, movetimeMs: 2500 },
  { id: 8, skill: 20, movetimeMs: 6000 },
];

export const levelById = (id: number): AiLevel =>
  AI_LEVELS.find((level) => level.id === id) ?? (AI_LEVELS[0] as AiLevel);

/** 有持時間時，思考時間不能超過剩餘時間的一小部分 */
export function thinkingTime(level: AiLevel, remainingMs: number | null, byoyomiMs: number): number {
  if (remainingMs === null) return level.movetimeMs;
  const budget = remainingMs / 30 + byoyomiMs * 0.7;
  return Math.max(150, Math.min(level.movetimeMs, budget));
}
