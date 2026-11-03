import type { MatchController } from './match.ts';
import { Store } from './store.ts';

/** 目前進行中的對局（畫面切換時保留） */
export const currentMatch = new Store<MatchController | null>(null);

export function setCurrentMatch(match: MatchController | null): void {
  const previous = currentMatch.get();
  if (previous && previous !== match) previous.dispose();
  currentMatch.set(match);
}
