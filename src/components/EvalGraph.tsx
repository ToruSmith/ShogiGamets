import { SCORE_CAP, winRate } from '../ai/analysis.ts';
import { useT } from '../i18n/index.ts';

/**
 * 形勢圖：橫軸手數、縱軸先手勝率（由評估值換算）。上半是先手優勢。
 * 點一下圖就跳到那一手。
 */
export function EvalGraph({
  scores,
  current,
  onSelect,
}: {
  scores: number[];
  current: number;
  onSelect: (ply: number) => void;
}) {
  const t = useT();
  const width = 600;
  const height = 150;
  const padX = 8;
  const n = Math.max(1, scores.length - 1);
  const x = (ply: number): number => padX + (ply / n) * (width - padX * 2);
  const y = (score: number): number =>
    height - winRate(Math.max(-SCORE_CAP, Math.min(SCORE_CAP, score))) * height;
  const points = scores.map((score, ply) => `${x(ply)},${y(score)}`).join(' ');
  const area = scores.length
    ? `${x(0)},${height / 2} ${points} ${x(scores.length - 1)},${height / 2}`
    : '';
  const currentScore = scores[current];
  return (
    <figure className="rounded-[4px] border border-border bg-card p-3">
      <figcaption className="mb-2 flex items-baseline justify-between">
        <span className="eyebrow">{t('review.winRate')}</span>
        {currentScore !== undefined && (
          <span className="num text-sm font-medium">
            {Math.round(winRate(currentScore) * 100)}%
            <span className="ml-2 text-xs text-muted-foreground">
              {currentScore > 0 ? '+' : ''}
              {currentScore}
            </span>
          </span>
        )}
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-32 w-full cursor-crosshair"
        preserveAspectRatio="none"
        role="img"
        aria-label={t('review.winRate')}
        onPointerDown={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - box.left) / box.width;
          onSelect(Math.max(0, Math.min(scores.length - 1, Math.round(ratio * n))));
        }}
      >
        <rect x="0" y="0" width={width} height={height / 2} fill="var(--muted)" opacity="0.55" />
        {[0.25, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1="0"
            x2={width}
            y1={height * ratio}
            y2={height * ratio}
            stroke="var(--border)"
            strokeDasharray="3 5"
          />
        ))}
        <line
          x1="0"
          x2={width}
          y1={height / 2}
          y2={height / 2}
          stroke="var(--muted-foreground)"
          strokeWidth="1"
          opacity="0.6"
        />
        {scores.length > 1 && (
          <>
            <polygon points={area} fill="var(--primary)" opacity="0.16" />
            <polyline
              points={points}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2.2"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
        <line
          x1={x(current)}
          x2={x(current)}
          y1="0"
          y2={height}
          stroke="var(--shu)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        {currentScore !== undefined && (
          <circle cx={x(current)} cy={y(currentScore)} r="4" fill="var(--shu)" />
        )}
      </svg>
    </figure>
  );
}
