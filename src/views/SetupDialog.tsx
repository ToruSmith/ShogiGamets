import { useState } from 'react';
import { AI_LEVELS } from '../ai/levels.ts';
import { Button } from '../components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.tsx';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.tsx';
import type { HandicapId } from '../core/handicap.ts';
import { HANDICAPS } from '../core/handicap.ts';
import type { Color } from '../core/types.ts';
import { GOTE, SENTE } from '../core/types.ts';
import { useT } from '../i18n/index.ts';
import type { MessageKey } from '../i18n/index.ts';
import { loadRaw, save } from '../platform/storage.ts';
import { navigate } from '../router.ts';
import { setCurrentMatch } from '../state/current.ts';
import { LocalMatch } from '../state/match.ts';
import { presetById, TIME_PRESETS } from '../state/presets.ts';

interface SetupPrefs {
  level: number;
  side: 'sente' | 'gote' | 'random';
  handicap: HandicapId;
  time: string;
}

const PREFS_KEY = 'shogi-setup';

export function SetupDialog({ mode, onClose }: { mode: 'ai' | 'local'; onClose: () => void }) {
  const t = useT();
  const [prefs, setPrefs] = useState<SetupPrefs>(() =>
    loadRaw<SetupPrefs>(`${PREFS_KEY}-${mode}`, {
      level: 3,
      side: 'sente',
      handicap: 'even',
      time: 'none',
    }),
  );
  const update = (patch: Partial<SetupPrefs>) => setPrefs((current) => ({ ...current, ...patch }));
  const handicapped = prefs.handicap !== 'even';

  function start() {
    save(`${PREFS_KEY}-${mode}`, prefs);
    const human: Color =
      prefs.side === 'random'
        ? Math.random() < 0.5
          ? SENTE
          : GOTE
        : prefs.side === 'sente'
          ? SENTE
          : GOTE;
    const level = AI_LEVELS.find((entry) => entry.id === prefs.level) ?? AI_LEVELS[0];
    const computer = `${t('common.computer')} · ${t(`level.${level?.id ?? 1}` as MessageKey)}`;
    const names: [string, string] =
      mode === 'ai'
        ? human === SENTE
          ? [t('common.you'), computer]
          : [computer, t('common.you')]
        : [
            t(handicapped ? 'common.shitate' : 'common.sente'),
            t(handicapped ? 'common.uwate' : 'common.gote'),
          ];
    setCurrentMatch(
      new LocalMatch({
        mode,
        handicap: prefs.handicap,
        control: presetById(prefs.time).control,
        human,
        level: prefs.level,
        names,
      }),
    );
    onClose();
    navigate('play');
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t(mode === 'ai' ? 'setup.title.ai' : 'setup.title.local')}</DialogTitle>
          <DialogDescription>
            {t(mode === 'ai' ? 'home.ai.desc' : 'home.local.desc')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {mode === 'ai' && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">{t('setup.level')}</legend>
              <RadioGroup
                value={String(prefs.level)}
                onValueChange={(value) => update({ level: Number(value) })}
                className="grid grid-cols-4"
                aria-label={t('setup.level')}
              >
                {AI_LEVELS.map((level) => (
                  <RadioGroupItem
                    key={level.id}
                    value={String(level.id)}
                    id={`level-${level.id}`}
                    className="flex-col gap-0 py-2"
                  >
                    <span className="num text-[11px] opacity-70">{level.id}</span>
                    <span>{t(`level.${level.id}` as MessageKey)}</span>
                  </RadioGroupItem>
                ))}
              </RadioGroup>
            </fieldset>
          )}

          <div className="flex flex-col gap-2">
            <label htmlFor="setup-handicap" className="text-sm font-medium">
              {t('setup.handicap')}
            </label>
            <Select
              value={prefs.handicap}
              onValueChange={(value) => update({ handicap: value as HandicapId })}
            >
              <SelectTrigger id="setup-handicap" aria-label={t('setup.handicap')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HANDICAPS.map((handicap) => (
                  <SelectItem key={handicap.id} value={handicap.id}>
                    {t(`handicap.${handicap.id}` as MessageKey)}
                    {handicap.id !== 'even' && (
                      <span className="ml-2 text-xs text-muted-foreground">{handicap.name}</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {handicapped && (
              <p className="text-xs text-muted-foreground">{t('setup.handicapHint')}</p>
            )}
          </div>

          {mode === 'ai' && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t('setup.side')}</legend>
              <RadioGroup
                value={prefs.side}
                onValueChange={(value) => update({ side: value as SetupPrefs['side'] })}
                aria-label={t('setup.side')}
              >
                <RadioGroupItem value="sente" id="side-sente">
                  ☗ {t(handicapped ? 'common.shitate' : 'common.sente')}
                </RadioGroupItem>
                <RadioGroupItem value="gote" id="side-gote">
                  ☖ {t(handicapped ? 'common.uwate' : 'common.gote')}
                </RadioGroupItem>
                <RadioGroupItem value="random" id="side-random">
                  {t('common.random')}
                </RadioGroupItem>
              </RadioGroup>
            </fieldset>
          )}

          <div className="flex flex-col gap-2">
            <label htmlFor="setup-time" className="text-sm font-medium">
              {t('setup.time')}
            </label>
            <Select value={prefs.time} onValueChange={(value) => update({ time: value })}>
              <SelectTrigger id="setup-time" aria-label={t('setup.time')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_PRESETS.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {t(preset.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={start} data-testid="start-game">
            {t('common.start')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
