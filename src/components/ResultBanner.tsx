import type { GameResult } from '../core/types.ts';
import { SENTE } from '../core/types.ts';
import { useT } from '../i18n/index.ts';
import { sideName } from './sides.ts';

/** 終局時疊在盤上的直書橫幅，點一下收起來看最後局面 */
export function ResultBanner({
  result,
  handicapped,
  youAre,
  onDismiss,
}: {
  result: GameResult;
  handicapped: boolean;
  /** 對電腦或線上時，玩家是哪一方 */
  youAre: 0 | 1 | null;
  onDismiss: () => void;
}) {
  const t = useT();
  const winnerKanji =
    result.winner === null
      ? '千日手'
      : `${handicapped ? (result.winner === SENTE ? '下手' : '上手') : result.winner === SENTE ? '先手' : '後手'}の勝ち`;
  const loser =
    result.winner === null ? '' : sideName(t, (1 - result.winner) as 0 | 1, handicapped);
  const headline =
    result.winner === null
      ? t('result.draw')
      : youAre === null
        ? t('result.win', { side: sideName(t, result.winner, handicapped) })
        : result.winner === youAre
          ? t('result.youWin')
          : t('result.youLose');
  return (
    <button
      type="button"
      onClick={onDismiss}
      className="absolute inset-0 z-10 flex items-center justify-center bg-[rgb(20_14_6/0.28)] outline-none"
      data-result={result.reason}
    >
      <div className="ink-in flex items-stretch gap-4 rounded-[4px] border border-[#5e3a1d] bg-[#f7ecd6] px-6 py-5 text-[#1d140b] shadow-2xl">
        <p className="tate font-display text-5xl leading-none tracking-[0.15em] text-[#1d140b]">
          {winnerKanji}
        </p>
        <div className="flex max-w-[12rem] flex-col justify-end gap-1 text-left">
          <span className="text-xs tracking-[0.2em] text-[#b4231a]">
            {t(`result.${result.reason}`)}
          </span>
          <span className="text-xl font-semibold">{headline}</span>
          <span className="text-sm text-[#5b4a36]">
            {t(`result.detail.${result.reason}`, { loser })}
          </span>
        </div>
      </div>
    </button>
  );
}
