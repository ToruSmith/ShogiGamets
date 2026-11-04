import { Download, FlipVertical2, Flag, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ShogiBoard } from '../board/ShogiBoard.tsx';
import { Clock } from '../components/Clock.tsx';
import { ExportDialog } from '../components/ExportDialog.tsx';
import { KifuPanel } from '../components/KifuPanel.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import { ResultBanner } from '../components/ResultBanner.tsx';
import { sideMark, sideName } from '../components/sides.ts';
import { Button } from '../components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.tsx';
import { handicapOfSfen } from '../core/handicap.ts';
import type { Move } from '../core/move.ts';
import { kifuLabels } from '../core/record.ts';
import type { Color } from '../core/types.ts';
import { GOTE, SENTE, opponentOf } from '../core/types.ts';
import type { MessageKey } from '../i18n/index.ts';
import { useT } from '../i18n/index.ts';
import { cn } from '../lib/utils.ts';
import { playKoma } from '../platform/sound.ts';
import { navigate } from '../router.ts';
import { currentMatch, setCurrentMatch } from '../state/current.ts';
import type { MatchController } from '../state/match.ts';
import { LocalMatch, resumableMatch } from '../state/match.ts';
import { settingsStore } from '../state/settings.ts';
import { useStore } from '../state/store.ts';

/** #/play：沒有進行中的對局時，試著接續上次的對局，否則回大廳 */
export function PlayRoute() {
  const match = useStore(currentMatch);
  useEffect(() => {
    if (match) return;
    const resume = resumableMatch();
    if (resume) setCurrentMatch(new LocalMatch(resume, true));
    else navigate('');
  }, [match]);
  return match ? <PlayView controller={match} /> : null;
}

const DRAW_LABELS = {
  local: 'play.drawAgree',
  hidden: 'play.drawOffer',
  available: 'play.drawOffer',
  sent: 'play.drawSent',
  received: 'play.drawAccept',
} as const;

export function PlayView({
  controller,
  header,
}: {
  controller: MatchController;
  header?: React.ReactNode;
}) {
  const t = useT();
  const settings = useStore(settingsStore);
  const snapshot = useStore(controller.store);
  const { game, result, online } = snapshot;
  const [flipped, setFlipped] = useState(false);
  const [bannerHidden, setBannerHidden] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const plies = game.moves.length;
  const bottom: Color = flipped ? opponentOf(snapshot.bottom) : snapshot.bottom;
  const handicapped = (handicapOfSfen(game.startSfen)?.id ?? 'even') !== 'even';

  const legalMoves = useMemo<Move[]>(
    () => (snapshot.interactive ? game.legalMoves() : []),
    // version 代表棋局內容；game 是同一個可變物件
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot.version, snapshot.interactive],
  );
  const labels = useMemo(
    () => kifuLabels(game.startSfen, game.moves),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game.startSfen, plies, snapshot.version],
  );

  // 新的一手：駒音
  const lastPlies = useRef(plies);
  useEffect(() => {
    if (plies > lastPlies.current && settings.sound)
      playKoma(game.position.inCheck() ? 'strong' : 'normal');
    lastPlies.current = plies;
  }, [plies, settings.sound, game]);

  useEffect(() => setBannerHidden(false), [result?.reason, result?.winner]);

  const sideLabel = (color: Color) => {
    const info = snapshot.sides[color];
    const active = !result && game.turn === color;
    return (
      <>
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              'text-base leading-none',
              active ? 'text-[#f6e7c8]' : 'text-[#f6e7c8]/55',
            )}
          >
            {sideMark(color)}
          </span>
          <span className="min-w-0 truncate font-medium" data-testid={`name-${color}`}>
            {info.name}
          </span>
          {snapshot.thinking && active && (
            <span className="size-1.5 animate-pulse rounded-full bg-[#f6e7c8]" />
          )}
        </span>
        {snapshot.clock && (
          <Clock
            clock={snapshot.clock}
            color={color}
            active={active && snapshot.clock.turnStartedAt !== null}
            now={() => controller.now()}
            sound={settings.sound && info.kind === 'human'}
          />
        )}
      </>
    );
  };

  const status = result
    ? t(`result.${result.reason}` as MessageKey)
    : snapshot.thinking
      ? t('play.thinking')
      : game.position.inCheck()
        ? `${t('play.check')} · ${t('play.turn', { side: sideName(t, game.turn, handicapped) })}`
        : t('play.turn', { side: sideName(t, game.turn, handicapped) });

  const youAre: Color | null =
    snapshot.mode === 'local'
      ? null
      : snapshot.sides[SENTE].kind === 'human' && snapshot.sides[GOTE].kind !== 'human'
        ? SENTE
        : snapshot.sides[GOTE].kind === 'human' && snapshot.sides[SENTE].kind !== 'human'
          ? GOTE
          : null;

  const record = {
    startSfen: game.startSfen,
    moves: [...game.moves],
    result,
    sente: snapshot.sides[SENTE].name,
    gote: snapshot.sides[GOTE].name,
    startedAt: Date.now(),
    times: snapshot.times,
  };

  function playAgain() {
    if (controller instanceof LocalMatch) {
      setCurrentMatch(new LocalMatch(controller.config));
    } else {
      controller.rematch();
    }
  }

  const title =
    snapshot.mode === 'ai'
      ? t('home.ai')
      : snapshot.mode === 'local'
        ? t('home.local')
        : t('home.online');
  const kanji = snapshot.mode === 'ai' ? '対局' : snapshot.mode === 'local' ? '対面' : '通信';

  return (
    <div className="flex min-h-dvh flex-col">
      <PageHeader
        title={title}
        kanji={kanji}
        actions={
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('play.flip')}
              title={t('play.flip')}
              onClick={() => setFlipped((f) => !f)}
            >
              <FlipVertical2 />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('play.export')}
              title={t('play.export')}
              onClick={() => setExporting(true)}
            >
              <Download />
            </Button>
          </>
        }
      />
      {header}
      <main className="gutter mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-4 py-3 lg:grid-cols-[minmax(0,1fr)_300px] lg:py-5">
        <section className="relative min-w-0">
          <ShogiBoard
            position={game.position}
            bottom={bottom}
            legalMoves={legalMoves}
            lastMove={snapshot.lastMove}
            onMove={(move) => controller.play(move)}
            showLegal={settings.showLegalMoves}
            showCoordinates={settings.showCoordinates}
            autoPromote={settings.autoPromote}
            labels={[sideLabel(SENTE), sideLabel(GOTE)]}
            ply={plies}
          />
          {result && !bannerHidden && (
            <ResultBanner
              result={result}
              handicapped={handicapped}
              youAre={youAre}
              onDismiss={() => setBannerHidden(true)}
            />
          )}
          {online && !online.opponentJoined && online.seat && !online.closed && (
            <WaitingOverlay code={online.code} />
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-3">
          <div
            className={cn(
              'rounded-[4px] border px-3 py-2.5 text-sm font-medium',
              result
                ? 'border-shu/50 bg-shu/10'
                : game.position.inCheck()
                  ? 'border-shu/40 text-shu'
                  : 'border-border bg-card',
            )}
            role="status"
            data-testid="status"
          >
            {status}
          </div>
          {online && <OnlineNotices online={online} />}

          <KifuPanel labels={labels} current={plies} />

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => controller.undo()}
              disabled={!snapshot.canUndo}
              data-testid="undo"
            >
              <Undo2 />
              {t('play.undo')}
            </Button>
            <Button
              variant="outline"
              onClick={() => setConfirmResign(true)}
              disabled={Boolean(result) || (snapshot.mode === 'online' && !online?.seat)}
              data-testid="resign"
            >
              <Flag />
              {t('play.resign')}
            </Button>
          </div>

          {snapshot.canDeclare && (
            <Button onClick={() => controller.declare()} data-testid="declare">
              {t('play.declare')}
            </Button>
          )}
          {snapshot.draw !== 'hidden' && !result && (
            <Button
              variant="outline"
              onClick={() => controller.offerDraw()}
              disabled={snapshot.draw === 'sent'}
              data-testid="draw"
            >
              {t(DRAW_LABELS[snapshot.mode === 'local' ? 'local' : snapshot.draw])}
            </Button>
          )}

          {result && (
            <div className="grid grid-cols-2 gap-2">
              {snapshot.savedId && (
                <Button onClick={() => navigate(`review/${snapshot.savedId}`)} data-testid="review">
                  {t('play.review')}
                </Button>
              )}
              {(snapshot.mode !== 'online' || online?.seat) && (
                <Button
                  variant="outline"
                  onClick={playAgain}
                  disabled={Boolean(online?.rematchRequested)}
                  data-testid="again"
                >
                  {snapshot.mode === 'online' ? t('online.rematch') : t('play.again')}
                </Button>
              )}
            </div>
          )}
        </aside>
      </main>

      <ExportDialog
        open={exporting}
        onOpenChange={setExporting}
        record={record}
        currentSfen={game.position.toSfen(plies + 1)}
      />

      <Dialog open={confirmResign} onOpenChange={setConfirmResign}>
        <DialogContent closeLabel={t('common.close')} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('play.resignConfirm')}</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmResign(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              data-testid="confirm-resign"
              onClick={() => {
                setConfirmResign(false);
                controller.resign();
              }}
            >
              {t('play.resign')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OnlineNotices({
  online,
}: {
  online: NonNullable<ReturnType<MatchController['store']['get']>['online']>;
}) {
  const t = useT();
  const notices: string[] = [];
  if (online.closed) notices.push(t('online.closed'));
  if (!online.seat && !online.closed) notices.push(t('online.spectating'));
  if (online.seat && online.opponentJoined && !online.opponentOnline)
    notices.push(t('online.opponentOffline'));
  if (online.rematchRequested) notices.push(t('online.rematchWaiting'));
  else if (online.opponentWantsRematch) notices.push(t('online.rematchOffer'));
  if (!notices.length) return null;
  return (
    <div
      className="flex flex-col gap-1 rounded-[4px] border border-border bg-card px-3 py-2 text-sm text-muted-foreground"
      data-testid="online-notice"
    >
      {notices.map((notice) => (
        <span key={notice}>{notice}</span>
      ))}
    </div>
  );
}

function WaitingOverlay({ code }: { code: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}${location.pathname}#/r/${code}`;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[rgb(20_14_6/0.35)] p-4">
      <div
        className="flex w-full max-w-sm flex-col gap-3 rounded-[4px] border border-border bg-card p-5 text-center shadow-xl"
        data-testid="waiting"
      >
        <p className="text-sm text-muted-foreground">{t('online.waiting')}</p>
        <p className="num font-mono text-4xl tracking-[0.3em]" data-testid="room-code">
          {code}
        </p>
        <p className="text-xs text-muted-foreground">{t('online.invite')}</p>
        <input
          readOnly
          value={link}
          id="invite-link"
          className="w-full rounded-[3px] border border-input bg-background px-2 py-1.5 font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            } catch {
              (document.getElementById('invite-link') as HTMLInputElement | null)?.select();
            }
          }}
        >
          {copied ? t('common.copied') : t('online.copyLink')}
        </Button>
      </div>
    </div>
  );
}
