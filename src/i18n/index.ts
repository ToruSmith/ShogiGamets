import { useCallback } from 'react';
import type { Locale } from '../state/settings.ts';
import { settingsStore } from '../state/settings.ts';
import { useStore } from '../state/store.ts';
import { en } from './en.ts';
import type { MessageKey } from './zh-TW.ts';
import { zhTW } from './zh-TW.ts';

export type { MessageKey };

export const LOCALES: { id: Locale; label: string }[] = [
  { id: 'zh-TW', label: '繁體中文' },
  { id: 'en', label: 'English' },
];

const DICTIONARIES: Record<Locale, Record<MessageKey, string>> = { 'zh-TW': zhTW, en };

export type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

export function translate(
  locale: Locale,
  key: MessageKey,
  values?: Record<string, string | number>,
): string {
  const template = DICTIONARIES[locale][key] ?? key;
  return values
    ? template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ''))
    : template;
}

export function useT(): Translate {
  const { locale } = useStore(settingsStore);
  return useCallback<Translate>((key, values) => translate(locale, key, values), [locale]);
}
