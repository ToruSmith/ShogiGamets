import { Download, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { downloadText, kifFilename } from '../components/ExportDialog.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import { sideName } from '../components/sides.ts';
import { Button } from '../components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.tsx';
import { handicapOfSfen } from '../core/handicap.ts';
import { exportKif, importRecord, replayRecord } from '../core/record.ts';
import type { MessageKey } from '../i18n/index.ts';
import { useT } from '../i18n/index.ts';
import { navigate } from '../router.ts';
import type { SavedGame } from '../state/records.ts';
import { deleteGame, recordsStore, saveGame, toRecord } from '../state/records.ts';
import { settingsStore } from '../state/settings.ts';
import { useStore } from '../state/store.ts';

export function RecordsView() {
  const t = useT();
  const records = useStore(recordsStore);
  const { locale } = useStore(settingsStore);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function importText(source: string) {
    try {
      const record = importRecord(source);
      const final = replayRecord(record);
      const saved = saveGame({
        startSfen: record.startSfen,
        moves: record.moves,
        result: final.result,
        sente: record.sente ?? t('common.sente'),
        gote: record.gote ?? t('common.gote'),
        ...(record.times ? { times: record.times } : {}),
        mode: 'import',
      });
      setText('');
      setError(null);
      navigate(`review/${saved.id}`);
    } catch (problem) {
      setError(t('records.importError', { message: (problem as Error).message }));
    }
  }

  const format = new Intl.DateTimeFormat(locale === 'zh-TW' ? 'zh-TW' : 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const resultText = (game: SavedGame): string => {
    if (!game.result) return t('records.unfinished');
    const handicapped = (handicapOfSfen(game.startSfen)?.id ?? 'even') !== 'even';
    const reason = t(`result.${game.result.reason}` as MessageKey);
    return game.result.winner === null
      ? `${t('result.draw')} · ${reason}`
      : `${t('result.win', { side: sideName(t, game.result.winner, handicapped) })} · ${reason}`;
  };

  return (
    <div className="min-h-dvh">
      <PageHeader title={t('records.title')} kanji="棋譜" />
      <main className="gutter mx-auto grid max-w-6xl grid-cols-1 gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-w-0 flex-col gap-2" aria-label={t('records.title')}>
          {records.length === 0 && (
            <p className="py-6 text-sm text-muted-foreground">{t('records.empty')}</p>
          )}
          <ul
            className="flex flex-col divide-y divide-border rounded-[4px] border border-border bg-card"
            data-testid="records"
          >
            {records.map((game) => (
              <li key={game.id} className="flex items-center gap-3 px-3 py-2.5">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 flex-col text-left"
                  onClick={() => navigate(`review/${game.id}`)}
                >
                  <span className="truncate font-medium">
                    ☗ {game.sente} <span className="text-muted-foreground">−</span> ☖ {game.gote}
                  </span>
                  <span className="num truncate text-xs text-muted-foreground">
                    {format.format(game.savedAt)} · {t(`records.mode.${game.mode}` as MessageKey)} ·{' '}
                    {t('common.moves', { n: game.moves.length })} · {resultText(game)}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('records.exportKif')}
                  onClick={() => {
                    const record = toRecord(game);
                    downloadText(kifFilename(record), exportKif(record));
                  }}
                >
                  <Download />
                </Button>
                {pendingDelete === game.id ? (
                  <Button variant="destructive" size="sm" onClick={() => deleteGame(game.id)}>
                    {t('common.delete')}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('records.deleteConfirm')}
                    onClick={() => setPendingDelete(game.id)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{t('records.import')}</CardTitle>
            <CardDescription>{t('records.importHint')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <textarea
              id="import-text"
              data-testid="import-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={'position startpos moves 7g7f 3c3d\n\n手合割：平手\n   1 ７六歩(77)'}
              className="h-44 w-full resize-y rounded-[3px] border border-input bg-background p-2 font-mono text-xs leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
            />
            {error && (
              <p className="text-sm text-shu" role="alert" data-testid="import-error">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                onClick={() => importText(text)}
                disabled={!text.trim()}
                data-testid="import-button"
              >
                {t('records.importButton')}
              </Button>
              <Button variant="outline" onClick={() => fileInput.current?.click()}>
                {t('records.chooseFile')}
              </Button>
              <input
                ref={fileInput}
                id="import-file"
                type="file"
                accept=".kif,.kifu,.txt,.sfen,.usi"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const buffer = await file.arrayBuffer();
                  // .kif 多半是 Shift_JIS，.kifu 是 UTF-8
                  let decoded = new TextDecoder('utf-8').decode(buffer);
                  if (decoded.includes('�')) decoded = new TextDecoder('shift_jis').decode(buffer);
                  importText(decoded);
                  event.target.value = '';
                }}
              />
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
