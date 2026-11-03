import { Check } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ShogiBoard } from '../board/ShogiBoard.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import { Button } from '../components/ui/button.tsx';
import type { Move } from '../core/move.ts';
import { moveToKifu, usiToMove } from '../core/notation.ts';
import { Position } from '../core/position.ts';
import { kifuLabels } from '../core/record.ts';
import type { TsumeProblem } from '../core/tsume.ts';
import { judgeTsumeMove, TSUME_PROBLEMS } from '../core/tsume.ts';
import { SENTE } from '../core/types.ts';
import { useT } from '../i18n/index.ts';
import { cn } from '../lib/utils.ts';
import { playKoma } from '../platform/sound.ts';
import { navigate } from '../router.ts';
import { markSolved, solvedStore } from '../state/records.ts';
import { settingsStore } from '../state/settings.ts';
import { useStore } from '../state/store.ts';

const KANJI_COUNT = ['', '一', '', '三', '', '五', '', '七'];

export function TsumeList() {
  const t = useT();
  const solved = useStore(solvedStore);
  const groups = [1, 3, 5, 7].map((length) => ({
    length,
    problems: TSUME_PROBLEMS.filter((problem) => problem.length === length),
  }));
  return (
    <div className="min-h-dvh">
      <PageHeader title={t('tsume.title')} kanji="詰将棋" />
      <main className="gutter mx-auto flex max-w-6xl flex-col gap-8 py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {t('tsume.rules')}
          </p>
          <p className="num text-sm font-medium" data-testid="solved-count">
            {t('tsume.solvedCount', { n: solved.length, total: TSUME_PROBLEMS.length })}
          </p>
        </div>
        {groups.map(({ length, problems }) => (
          <section key={length} className="flex flex-col gap-3 sm:flex-row sm:gap-5">
            <h2 className="flex items-baseline gap-2 sm:w-16 sm:flex-col sm:items-center">
              <span className="tate hidden font-display text-3xl leading-none sm:block">
                {KANJI_COUNT[length]}手詰
              </span>
              <span className="text-sm text-muted-foreground sm:hidden">
                {t('tsume.lengthGroup', { n: length })}
              </span>
            </h2>
            <ul className="grid flex-1 grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {problems.map((problem) => {
                const done = solved.includes(problem.id);
                return (
                  <li key={problem.id}>
                    <button
                      type="button"
                      data-testid={`tsume-${problem.id}`}
                      onClick={() => navigate(`tsume/${problem.id}`)}
                      className={cn(
                        'flex h-16 w-full items-center justify-between rounded-[3px] border bg-card px-3 text-left transition-colors hover:border-primary/60',
                        done ? 'border-primary/40' : 'border-border',
                      )}
                    >
                      <span className="num text-lg font-semibold">{problem.id}</span>
                      {done && <Check className="size-4 text-primary" aria-label="solved" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}

type Status = { kind: 'playing' } | { kind: 'wrong' } | { kind: 'solved' };

export function TsumeView({ id }: { id: number }) {
  const problem = TSUME_PROBLEMS.find((entry) => entry.id === id);
  if (!problem) {
    navigate('tsume');
    return null;
  }
  return <Tsume key={id} problem={problem} />;
}

function Tsume({ problem }: { problem: TsumeProblem }) {
  const t = useT();
  const settings = useStore(settingsStore);
  const [moves, setMoves] = useState<Move[]>([]);
  const [status, setStatus] = useState<Status>({ kind: 'playing' });
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<'none' | 'hint' | 'answer'>('none');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const position = useMemo(() => {
    const p = Position.fromSfen(problem.sfen);
    for (const move of moves) p.make(move);
    return p;
  }, [problem.sfen, moves]);
  const legal = useMemo(
    () =>
      status.kind === 'solved' || busy || position.turn !== SENTE ? [] : position.legalMoves(),
    [position, status.kind, busy],
  );
  const remaining = problem.length - moves.length;
  const solution = useMemo(
    () => problem.solution.map((text) => usiToMove(text) as Move),
    [problem],
  );

  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  function play(move: Move) {
    const next = [...moves, move];
    setMoves(next);
    if (settings.sound) playKoma();
    setBusy(true);
    // 讓棋子先落下，再判定
    later(() => {
      const verdict = judgeTsumeMove(problem, next);
      if (verdict.kind === 'wrong') {
        setStatus({ kind: 'wrong' });
        later(() => {
          setMoves(moves);
          setBusy(false);
        }, 700);
      } else if (verdict.kind === 'solved') {
        setStatus({ kind: 'solved' });
        setBusy(false);
        markSolved(problem.id);
      } else {
        setStatus({ kind: 'playing' });
        later(() => {
          setMoves([...next, verdict.reply]);
          if (settings.sound) playKoma();
          setBusy(false);
        }, 380);
      }
    }, 60);
  }

  function reset() {
    timers.current.forEach(clearTimeout);
    setMoves([]);
    setStatus({ kind: 'playing' });
    setBusy(false);
  }

  const start = Position.fromSfen(problem.sfen);
  const hint = moveToKifu(solution[0] as Move, start, null).replace(/\(\d\d\)$/, '');
  const answer = kifuLabels(problem.sfen, solution).join(' ');
  const nextProblem = TSUME_PROBLEMS.find((entry) => entry.id === problem.id + 1);

  const message =
    status.kind === 'solved'
      ? t('tsume.solved')
      : status.kind === 'wrong'
        ? t('tsume.wrong')
        : t('tsume.yourMove', { n: Math.max(1, remaining) });

  return (
    <div className="flex min-h-dvh flex-col">
      <PageHeader
        title={`${t('tsume.problem', { id: problem.id })} · ${t('tsume.lengthGroup', { n: problem.length })}`}
        kanji="詰"
        back="tsume"
      />
      <main className="gutter mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-4 py-3 lg:grid-cols-[minmax(0,1fr)_300px] lg:py-5">
        <section className="min-w-0">
          <ShogiBoard
            position={position}
            bottom={SENTE}
            legalMoves={legal}
            lastMove={moves.at(-1) ?? null}
            onMove={play}
            showLegal={settings.showLegalMoves}
            showCoordinates={settings.showCoordinates}
            autoPromote={settings.autoPromote}
            ply={moves.length}
            labels={[<span key="s">☗ 攻方</span>, <span key="g">☖ 玉方</span>]}
          />
        </section>
        <aside className="flex flex-col gap-3">
          <div
            role="status"
            data-testid="tsume-status"
            data-state={status.kind}
            className={cn(
              'rounded-[4px] border px-3 py-3 text-sm font-medium',
              status.kind === 'solved'
                ? 'border-primary bg-primary text-primary-foreground'
                : status.kind === 'wrong'
                  ? 'border-shu/50 bg-shu/10 text-shu'
                  : 'border-border bg-card',
            )}
          >
            {status.kind === 'solved' && <span className="mr-2 font-display text-xl">詰み</span>}
            {message}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{t('tsume.rules')}</p>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" onClick={reset} data-testid="tsume-reset">
              {t('tsume.reset')}
            </Button>
            <Button variant="outline" onClick={() => setReveal('hint')}>
              {t('tsume.hint')}
            </Button>
            <Button
              variant="outline"
              onClick={() => setReveal('answer')}
              data-testid="tsume-answer"
            >
              {t('tsume.answer')}
            </Button>
          </div>
          {reveal !== 'none' && (
            <p
              className="rounded-[4px] border border-border bg-card px-3 py-2 font-koma text-sm leading-relaxed"
              data-testid="tsume-reveal"
            >
              {reveal === 'hint'
                ? t('tsume.hintText', { move: hint })
                : t('tsume.answerText', { line: answer })}
            </p>
          )}
          <div className="mt-auto grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={() => navigate('tsume')}>
              {t('tsume.list')}
            </Button>
            {nextProblem && (
              <Button onClick={() => navigate(`tsume/${nextProblem.id}`)} data-testid="tsume-next">
                {t('tsume.next')}
              </Button>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
