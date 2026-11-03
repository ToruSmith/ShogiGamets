import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useT } from '../i18n/index.ts';
import { navigate } from '../router.ts';
import { Button } from './ui/button.tsx';

/** 每頁的頁首：返回、標題（毛筆字的裝飾直書放在右側）、動作按鈕 */
export function PageHeader({
  title,
  kanji,
  back = '',
  actions,
}: {
  title: ReactNode;
  /** 裝飾用的日文漢字（字型只含常用的幾個字） */
  kanji?: string;
  back?: string;
  actions?: ReactNode;
}) {
  const t = useT();
  return (
    <header className="gutter sticky top-[env(safe-area-inset-top,0px)] z-30 border-b border-border/70 bg-background/92 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('common.back')}
          onClick={() => navigate(back)}
        >
          <ArrowLeft />
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-wide">
          {kanji && (
            <span className="mr-2 font-display text-xl font-normal text-primary">{kanji}</span>
          )}
          {title}
        </h1>
        <div className="flex items-center gap-1">{actions}</div>
      </div>
    </header>
  );
}
