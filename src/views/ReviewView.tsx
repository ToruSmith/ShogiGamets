import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameAnalysis, MoveQuality } from '../ai/analysis.ts';
import { analyzeGame } from '../ai/analysis.ts';
import { createEngine } from '../ai/engines.ts';
import type { ShogiEngine } from '../ai/types.ts';
import { CancelledError } from '../ai/types.ts';
import { ShogiBoard } from '../board/ShogiBoard.tsx';
import type { BoardArrow } from '../board/ShogiBoard.tsx';
import { EvalGraph } from '../components/EvalGraph.tsx';
import { ExportDialog } from '../components/ExportDialog.tsx';
import { KifuPanel, QUALITY_COLOR } from '../components/KifuPanel.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import { sideMark, sideName } from '../components/sides.ts';
import { Button } from '../components/ui/button.tsx';
import { formatClock } from '../core/clock.ts';
import { handicapOfSfen } from '../core/handicap.ts';
import type { Move } from '../core/move.ts';
import { moveToKifu, usiToMove } from '../core/notation.ts';
import { Position } from '../core/position.ts';
import { kifuLabels, replayRecord } from '../core/record.ts';
import type { Color } from '../core/types.ts';
import { GOTE, SENTE } from '../core/types.ts';
import type { MessageKey } from '../i18n/index.ts';
import { useT } from '../i18n/index.ts';
import { cn } from '../lib/utils.ts';
import { findGame, recordsStore, toRecord, updateGame } from '../state/records.ts';
import { settingsStore } from '../state/settings.ts';
import { useStore } from '../state/store.ts';

const ANALYSIS_MS = 400;

export function ReviewView({ id }: { id: string }) {
  const t = useT();
  useStore(recordsStore);
  const saved = findGame(id);
  if (!saved) {
    return (
      <div>
        <PageHeader title={t('review.title')} kanji="検討" back="records" />
        <p className="gutter mx-auto max-w-6xl py-10 text-muted-foreground">
          {t('review.notFound')}
        </p>
      </div>
    );
  }
  return <Review key={id} id={id} />;
}

function Review({ id }: { id: string }) {
  const t = useT();
  const settings = useStore(settingsStore);
  const saved = findGame(id);
  const record = useMemo(() => toRecord(saved as NonNullable<typeof saved>), [saved]);
  const total = record.moves.length;
  const [ply, setPly] = useState(total);
  const [flipped, setFlipped] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const engineRef = useRef<ShogiEngine | null>(null);
  const handicapped = (handicapOfSfen(record.startSfen)?.id ?? 'even') !== 'even';

  const position = useMemo(() => {
    const p = Position.fromSfen(record.startSfen);
    for (const move of record.moves.slice(0, ply)) p.make(move);
    return p;
  }, [record, ply]);
  const labels = useMemo(() => kifuLabels(record.startSfen, record.moves), [record]);
  const final = useMemo(() => replayRecord(record), [record]);

  // 已存的分析分數直接顯示（不含推薦手，重新分析才有）
  const scores = analysis?.scores ?? saved?.scores ?? null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;
      if (event.key === 'ArrowLeft') setPly((p) => Math.max(0, p - 1));
      if (event.key === 'ArrowRight') setPly((p) => Math.min(total, p + 1));
      if (event.key === 'Home') setPly(0);
      if (event.key === 'End') setPly(total);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [total]);

  useEffect(() => () => engineRef.current?.dispose(), []);

  async function analyze() {
    engineRef.current?.dispose();
    const engine = createEngine(settings.engine);
    engineRef.current = engine;
    setProgress({ done: 0, total: total + 1 });
    try {
      const result = await analyzeGame(
        engine,
        record.startSfen,
        record.moves,
        ANALYSIS_MS,
        (done, all) => setProgress({ done, total: all }),
      );
      setAnalysis(result);
      updateGame(id, { scores: result.scores });
    } catch (error) {
      if (!(error instanceof CancelledError)) console.error(error);
    } finally {
      setProgress(null);
    }
  }

  function stop() {
    engineRef.current?.cancel();
    setProgress(null);
  }

  const qualities: (MoveQuality | null)[] = analysis ? analysis.plies.map((p) => p.quality) : [];
  const current = analysis && ply < total ? analysis.plies[ply] : null;
  const arrows: BoardArrow[] = [];
  if (current?.bestMove) {
    const best = usiToMove(current.bestMove);
    if (best !== null) arrows.push({ move: best, tone: 'best' });
  }
  const bestLabel = (() => {
    if (!current?.bestMove) return null;
    const best = usiToMove(current.bestMove);
    return best === null ? null : moveToKifu(best, position, null).replace(/\(\d\d\)$/, '');
  })();

  const summary = (color: Color) => {
    if (!analysis) return null;
    const counts = { blunder: 0, mistake: 0, inaccuracy: 0 };
    const startColor: Color = record.startSfen.split(' ')[1] === 'w' ? GOTE : SENTE;
    analysis.plies.forEach((entry, index) => {
      const mover = index % 2 === 0 ? startColor : ((1 - startColor) as Color);
      if (mover === color && entry.quality in counts)
        counts[entry.quality as keyof typeof counts]++;
    });
    return t('review.summary', {
      side: `${sideMark(color)} ${sideName(t, color, handicapped)}`,
      b: counts.blunder,
      m: counts.mistake,
      i: counts.inaccuracy,
    });
  };

  const spent = record.times?.[ply - 1];

  return (
    <div className="flex min-h-dvh flex-col">
      <PageHeader
        title={`${record.sente ?? ''} − ${record.gote ?? ''}`}
        kanji="検討"
        back="records"
        actions={
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('play.export')}
            onClick={() => setExporting(true)}
          >
            <Download />
          </Button>
        }
      />
      <main className="gutter mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-4 py-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:py-5">
        <section className="flex min-w-0 flex-col gap-3">
          <ShogiBoard
            position={position}
            bottom={flipped ? GOTE : SENTE}
            legalMoves={[]}
            lastMove={ply > 0 ? (record.moves[ply - 1] as Move) : null}
            showCoordinates={settings.showCoordinates}
            arrows={arrows}
            ply={ply}
            labels={[<span key="s">☗ {record.sente}</span>, <span key="g">☖ {record.gote}</span>]}
          />
          <div className="flex items-center justify-center gap-1" role="toolbar">
            <Button
              variant="outline"
              size="icon"
              aria-label={t('review.first')}
              onClick={() => setPly(0)}
            >
              <ChevronFirst />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={t('review.prev')}
              onClick={() => setPly((p) => Math.max(0, p - 1))}
              data-testid="prev"
            >
              <ChevronLeft />
            </Button>
            <span className="num min-w-[7rem] text-center text-sm" data-testid="ply">
              {ply === 0 ? t('review.initial') : t('review.position', { n: ply })}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label={t('review.next')}
              onClick={() => setPly((p) => Math.min(total, p + 1))}
              data-testid="next"
            >
              <ChevronRight />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={t('review.last')}
              onClick={() => setPly(total)}
            >
              <ChevronLast />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setFlipped((f) => !f)}>
              {t('play.flip')}
            </Button>
          </div>
        </section>

        <aside className="flex min-w-0 flex-col gap-3">
          {final.result && (
            <div className="rounded-[4px] border border-shu/40 bg-shu/10 px-3 py-2 text-sm">
              {t(`result.${final.result.reason}` as MessageKey)} ·{' '}
              {final.result.winner === null
                ? t('result.draw')
                : t('result.win', { side: sideName(t, final.result.winner, handicapped) })}
            </div>
          )}
          {scores && (
            <EvalGraph
              scores={scores}
              current={Math.min(ply, scores.length - 1)}
              onSelect={setPly}
            />
          )}

          <div className="flex flex-col gap-2 rounded-[4px] border border-border bg-card p-3">
            {progress ? (
              <div className="flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-[width]"
                    style={{ width: `${(progress.done / progress.total) * 100}%` }}
                  />
                </div>
                <span className="num text-xs text-muted-foreground">
                  {t('review.analyzing', progress)}
                </span>
                <Button variant="ghost" size="sm" onClick={stop}>
                  {t('review.stop')}
                </Button>
              </div>
            ) : (
              <Button onClick={analyze} disabled={total === 0} data-testid="analyze">
                {t('review.analyze')}
              </Button>
            )}
            {current && (
              <div
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                data-testid="move-quality"
              >
                <span className={cn('inline-flex items-center gap-1.5')}>
                  <span
                    className={cn(
                      'size-2 rounded-full border border-border',
                      QUALITY_COLOR[current.quality],
                    )}
                  />
                  {labels[ply]} · {t(`review.quality.${current.quality}`)}
                </span>
                {bestLabel && current.quality !== 'best' && (
                  <span className="text-muted-foreground">
                    {t('review.engineBest')}：
                    <span className="font-koma text-foreground">{bestLabel}</span>
                  </span>
                )}
              </div>
            )}
            {analysis && (
              <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                <span>{summary(SENTE)}</span>
                <span>{summary(GOTE)}</span>
              </div>
            )}
          </div>

          <KifuPanel labels={labels} current={ply} onSelect={setPly} qualities={qualities} />
          {spent !== undefined && spent > 0 && (
            <p className="num text-xs text-muted-foreground">⏱ {formatClock(spent)}</p>
          )}
        </aside>
      </main>
      <ExportDialog
        open={exporting}
        onOpenChange={setExporting}
        record={record}
        currentSfen={position.toSfen(ply + 1)}
      />
    </div>
  );
}
