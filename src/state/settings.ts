import type { EngineKind } from '../ai/engines.ts';
import { load, save } from '../platform/storage.ts';
import { Store } from './store.ts';

export type Locale = 'zh-TW' | 'en';
export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  locale: Locale;
  theme: Theme;
  sound: boolean;
  showLegalMoves: boolean;
  showCoordinates: boolean;
  /** 能升變時直接升變，不問 */
  autoPromote: boolean;
  engine: EngineKind;
  playerName: string;
}

function defaultLocale(): Locale {
  const language = typeof navigator === 'undefined' ? 'zh-TW' : navigator.language;
  return /^zh/i.test(language) ? 'zh-TW' : 'en';
}

const DEFAULTS: Settings = {
  locale: defaultLocale(),
  theme: 'system',
  sound: true,
  showLegalMoves: true,
  showCoordinates: true,
  autoPromote: false,
  engine: 'builtin',
  playerName: '',
};

export const settingsStore = new Store<Settings>(load('shogi-settings', DEFAULTS));

export function updateSettings(patch: Partial<Settings>): void {
  settingsStore.set((current) => ({ ...current, ...patch }));
  save('shogi-settings', settingsStore.get());
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}
