import { useState } from 'react';
import type { GameRecord } from '../core/record.ts';
import { exportKif, exportSfen } from '../core/record.ts';
import { useT } from '../i18n/index.ts';
import { Button } from './ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs.tsx';

export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function kifFilename(record: GameRecord): string {
  const date = new Date(record.startedAt ?? Date.now());
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  return `shogi-${stamp}-${record.moves.length}.kif`;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** 匯出 KIF 與 SFEN（含當前局面）。 */
export function ExportDialog({
  open,
  onOpenChange,
  record,
  currentSfen,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: GameRecord;
  currentSfen: string;
}) {
  const t = useT();
  const [copied, setCopied] = useState<string | null>(null);
  const kif = open ? exportKif(record) : '';
  const sfen = open ? `position ${exportSfen(record)}` : '';
  const copyButton = (id: string, text: string) => (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        if (await copy(text)) setCopied(id);
      }}
    >
      {copied === id ? t('common.copied') : t('common.copy')}
    </Button>
  );
  const area = (value: string, id: string) => (
    <textarea
      id={id}
      readOnly
      value={value}
      className="h-56 w-full resize-none rounded-[3px] border border-input bg-background p-2 font-mono text-xs leading-relaxed"
      onFocus={(event) => event.currentTarget.select()}
    />
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('play.export')}</DialogTitle>
          <DialogDescription>KIF · SFEN</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="kif">
          <TabsList>
            <TabsTrigger value="kif">KIF</TabsTrigger>
            <TabsTrigger value="sfen">SFEN</TabsTrigger>
          </TabsList>
          <TabsContent value="kif" className="flex flex-col gap-2">
            {area(kif, 'export-kif')}
            <div className="flex gap-2">
              <Button size="sm" onClick={() => downloadText(kifFilename(record), kif)}>
                {t('records.exportKif')}
              </Button>
              {copyButton('kif', kif)}
            </div>
          </TabsContent>
          <TabsContent value="sfen" className="flex flex-col gap-2">
            {area(sfen, 'export-sfen')}
            <div className="flex flex-wrap items-center gap-2">
              {copyButton('sfen', sfen)}
              <code
                className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
                title={currentSfen}
              >
                {currentSfen}
              </code>
              {copyButton('current', `sfen ${currentSfen}`)}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
