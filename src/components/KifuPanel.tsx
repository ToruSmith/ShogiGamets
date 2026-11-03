import { useEffect, useRef } from 'react';
import type { MoveQuality } from '../ai/analysis.ts';
import { useT } from '../i18n/index.ts';
import { cn } from '../lib/utils.ts';

const QUALITY_COLOR: Record<MoveQuality, string> = {
  best: 'bg-[#3c7a4a]',
  good: 'bg-transparent',
  inaccuracy: 'bg-[#c9a227]',
  mistake: 'bg-[#d0782a]',
  blunder: 'bg-shu',
};

/**
 * 直書棋譜：一手一行，由右往左排，手數以縱中橫顯示。
 * 寬度不夠時橫向捲動，並自動捲到目前這一手。
 */
export function KifuPanel({
  labels,
  current,
  onSelect,
  qualities,
  className,
}: {
  labels: string[];
  /** 目前顯示到第幾手（0 = 開始局面） */
  current: number;
  onSelect?: (ply: number) => void;
  qualities?: (MoveQuality | null)[];
  className?: string;
}) {
  const t = useT();
  const container = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const element = container.current?.querySelector<HTMLElement>(`[data-ply="${current}"]`);
    element?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [current, labels.length]);

  return (
    <div className={cn('rounded-[4px] border border-border bg-card', className)}>
      <div className="flex items-baseline justify-between border-b border-border px-3 py-2">
        <span className="eyebrow">{t('play.kifu')}</span>
        <span className="num text-xs text-muted-foreground">
          {t('common.moves', { n: labels.length })}
        </span>
      </div>
      <ol
        ref={container}
        className="tate flex h-[9.5rem] flex-col flex-nowrap gap-0 overflow-x-auto overflow-y-hidden px-1 py-2 font-koma text-[15px] leading-none"
        aria-label={t('play.kifu')}
      >
        <li data-ply={0}>
          <button
            type="button"
            onClick={() => onSelect?.(0)}
            disabled={!onSelect}
            className={cn(
              'h-full rounded-[2px] px-1.5 py-1 text-muted-foreground',
              current === 0 && 'bg-primary text-primary-foreground',
            )}
          >
            {t('play.start')}
          </button>
        </li>
        {labels.length === 0 && (
          <li className="px-2 py-1 text-sm text-muted-foreground">{t('play.empty')}</li>
        )}
        {labels.map((label, index) => {
          const ply = index + 1;
          const quality = qualities?.[index] ?? null;
          return (
            <li key={ply} data-ply={ply}>
              <button
                type="button"
                onClick={() => onSelect?.(ply)}
                disabled={!onSelect}
                className={cn(
                  'relative h-full rounded-[2px] px-1.5 py-1 text-left whitespace-nowrap transition-colors disabled:cursor-default',
                  onSelect && 'hover:bg-accent',
                  current === ply && 'bg-primary text-primary-foreground hover:bg-primary',
                )}
              >
                <span className="tcy num mb-1 inline-block text-[11px] opacity-60">{ply}</span>
                {label}
                {quality && quality !== 'good' && (
                  <span
                    className={cn(
                      'absolute bottom-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full',
                      QUALITY_COLOR[quality],
                    )}
                    aria-label={t(`review.quality.${quality}`)}
                  />
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export { QUALITY_COLOR };
