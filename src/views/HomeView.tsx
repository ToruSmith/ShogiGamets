import { useState } from 'react';
import { HANDICAPS } from '../core/handicap.ts';
import { TSUME_PROBLEMS } from '../core/tsume.ts';
import type { MessageKey } from '../i18n/index.ts';
import { useT } from '../i18n/index.ts';
import { cn } from '../lib/utils.ts';
import { navigate } from '../router.ts';
import { setCurrentMatch } from '../state/current.ts';
import { LocalMatch, resumableMatch } from '../state/match.ts';
import { loadRaw } from '../platform/storage.ts';
import { SetupDialog } from './SetupDialog.tsx';

interface Entry {
  kanji: string;
  title: MessageKey;
  desc: MessageKey;
  action: () => void;
  testId: string;
}

/**
 * 大廳。選單是一排直書的短冊：右邊是第一項，像翻開一本直排的書。
 * 毛筆字只當裝飾，真正的說明文字依語言顯示。
 */
const HUB_URL = 'https://torusmith.github.io/QiguanGamets/';

export function HomeView() {
  const t = useT();
  const [setup, setSetup] = useState<'ai' | 'local' | null>(null);
  const resume = resumableMatch();
  const resumeMoves = loadRaw<{ moves: string[] } | null>('shogi-current', null)?.moves.length ?? 0;

  const entries: Entry[] = [
    {
      kanji: '対局',
      title: 'home.ai',
      desc: 'home.ai.desc',
      action: () => setSetup('ai'),
      testId: 'mode-ai',
    },
    {
      kanji: '対面',
      title: 'home.local',
      desc: 'home.local.desc',
      action: () => setSetup('local'),
      testId: 'mode-local',
    },
    {
      kanji: '通信',
      title: 'home.online',
      desc: 'home.online.desc',
      action: () => navigate('online'),
      testId: 'mode-online',
    },
    {
      kanji: '詰将棋',
      title: 'home.tsume',
      desc: 'home.tsume.desc',
      action: () => navigate('tsume'),
      testId: 'mode-tsume',
    },
    {
      kanji: '棋譜',
      title: 'home.records',
      desc: 'home.records.desc',
      action: () => navigate('records'),
      testId: 'mode-records',
    },
    {
      kanji: '設定',
      title: 'home.settings',
      desc: 'settings.about',
      action: () => navigate('settings'),
      testId: 'mode-settings',
    },
  ];

  return (
    <main className="gutter mx-auto flex min-h-dvh max-w-6xl flex-col gap-8 py-8 lg:py-14">
      <section className="flex items-start justify-between gap-6">
        <div className="flex max-w-md flex-col gap-4 pt-2">
          <p className="eyebrow">ShogiGamets · 將棋</p>
          <h1 className="text-3xl leading-tight font-semibold tracking-wide sm:text-4xl">
            {t('app.name')}
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">{t('app.tagline')}</p>
          <a
            href={HUB_URL}
            data-testid="hub-link"
            className="w-fit text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            {t('home.hub')}
          </a>
          {resume && (
            <button
              type="button"
              data-testid="resume"
              onClick={() => {
                setCurrentMatch(new LocalMatch(resume, true));
                navigate('play');
              }}
              className="group flex w-fit items-center gap-3 rounded-[4px] border border-primary/50 bg-card px-4 py-3 text-left transition-colors hover:border-primary"
            >
              <span className="font-display text-2xl text-primary">再開</span>
              <span className="flex flex-col">
                <span className="font-medium">{t('home.continue')}</span>
                <span className="text-sm text-muted-foreground">
                  {t('home.continueHint', {
                    mode: t(resume.mode === 'ai' ? 'home.ai' : 'home.local'),
                    n: resumeMoves,
                  })}
                </span>
              </span>
            </button>
          )}
        </div>
        <p
          aria-hidden="true"
          className="tate hidden font-display text-[5.5rem] leading-none tracking-[0.12em] text-foreground/90 select-none sm:block"
        >
          将棋盤
        </p>
      </section>

      <nav
        aria-label={t('app.name')}
        className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex lg:flex-row-reverse lg:gap-3"
      >
        {entries.map((entry, index) => (
          <button
            key={entry.testId}
            type="button"
            data-testid={entry.testId}
            onClick={entry.action}
            className={cn(
              'tanzaku group relative flex items-center gap-4 overflow-hidden rounded-[3px] border border-border bg-card p-4 text-left transition-[border-color,transform] outline-none',
              'hover:-translate-y-0.5 hover:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring/50',
              'lg:h-[22rem] lg:flex-1 lg:flex-col lg:items-stretch lg:justify-between lg:p-5',
              index === 0 && 'border-primary/60',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'tate shrink-0 font-display text-3xl leading-none tracking-[0.1em] lg:self-end lg:text-5xl',
                index === 0 ? 'text-primary' : 'text-foreground',
              )}
            >
              {entry.kanji}
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="font-semibold">{t(entry.title)}</span>
              <span className="text-sm leading-snug text-muted-foreground">
                {t(entry.desc, { n: TSUME_PROBLEMS.length })}
              </span>
            </span>
          </button>
        ))}
      </nav>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{HANDICAPS.length} 種手合 · KIF / SFEN · PWA</span>
        <span>{t('home.offline')}</span>
      </footer>

      {setup && <SetupDialog mode={setup} onClose={() => setSetup(null)} />}
    </main>
  );
}
