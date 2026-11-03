import type { GameRecord } from '../core/record.ts';
import type { GameResult } from '../core/types.ts';
import { loadRaw, save } from '../platform/storage.ts';
import { Store } from './store.ts';

/** 存在本機的一盤棋。棋步以 USI 字串保存，日後格式變動也讀得回來。 */
export interface SavedGame {
  id: string;
  savedAt: number;
  startSfen: string;
  moves: number[];
  result: GameResult | null;
  sente: string;
  gote: string;
  times?: number[];
  mode: 'ai' | 'local' | 'online' | 'import';
  /** 賽後分析的結果（先手角度的分數），有分析過才有 */
  scores?: number[];
}

const KEY = 'shogi-records';
const LIMIT = 200;

export const recordsStore = new Store<SavedGame[]>(loadRaw<SavedGame[]>(KEY, []));

function persist(): void {
  save(KEY, recordsStore.get());
}

export function saveGame(game: Omit<SavedGame, 'id' | 'savedAt'> & { id?: string }): SavedGame {
  const entry: SavedGame = {
    ...game,
    id: game.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    savedAt: Date.now(),
  };
  recordsStore.set((list) =>
    [entry, ...list.filter((item) => item.id !== entry.id)].slice(0, LIMIT),
  );
  persist();
  return entry;
}

export function updateGame(id: string, patch: Partial<SavedGame>): void {
  recordsStore.set((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  persist();
}

export function deleteGame(id: string): void {
  recordsStore.set((list) => list.filter((item) => item.id !== id));
  persist();
}

export const findGame = (id: string): SavedGame | undefined =>
  recordsStore.get().find((item) => item.id === id);

export function toRecord(game: SavedGame): GameRecord {
  return {
    startSfen: game.startSfen,
    moves: game.moves,
    result: game.result,
    sente: game.sente,
    gote: game.gote,
    startedAt: game.savedAt,
    ...(game.times ? { times: game.times } : {}),
  };
}

/** 詰將棋的解題紀錄 */
export const solvedStore = new Store<number[]>(loadRaw<number[]>('shogi-tsume-solved', []));
export function markSolved(id: number): void {
  if (solvedStore.get().includes(id)) return;
  solvedStore.set((list) => [...list, id]);
  save('shogi-tsume-solved', solvedStore.get());
}
