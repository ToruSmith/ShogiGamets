import { availableEngines } from '../ai/engines.ts';
import type { EngineKind } from '../ai/engines.ts';
import { PageHeader } from '../components/PageHeader.tsx';
import { Card, CardContent } from '../components/ui/card.tsx';
import { Input } from '../components/ui/input.tsx';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.tsx';
import { Switch } from '../components/ui/switch.tsx';
import { LOCALES, useT } from '../i18n/index.ts';
import type { MessageKey } from '../i18n/index.ts';
import { resetEngine } from '../state/match.ts';
import type { Locale, Settings, Theme } from '../state/settings.ts';
import { settingsStore, updateSettings } from '../state/settings.ts';
import { useStore } from '../state/store.ts';

export function SettingsView() {
  const t = useT();
  const settings = useStore(settingsStore);
  const engines = availableEngines();

  const toggle = (key: keyof Settings, label: MessageKey) => (
    <label
      htmlFor={`setting-${key}`}
      className="flex items-center justify-between gap-4 py-3 text-sm"
    >
      {t(label)}
      <Switch
        id={`setting-${key}`}
        checked={Boolean(settings[key])}
        onCheckedChange={(checked) => updateSettings({ [key]: checked } as Partial<Settings>)}
      />
    </label>
  );

  return (
    <div className="min-h-dvh">
      <PageHeader title={t('settings.title')} kanji="設定" />
      <main className="gutter mx-auto flex max-w-xl flex-col gap-4 py-6">
        <Card>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="setting-locale" className="text-sm font-medium">
                {t('settings.language')} · Language
              </label>
              <Select
                value={settings.locale}
                onValueChange={(value) => updateSettings({ locale: value as Locale })}
              >
                <SelectTrigger id="setting-locale" data-testid="locale">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCALES.map((locale) => (
                    <SelectItem key={locale.id} value={locale.id}>
                      {locale.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t('settings.theme')}</legend>
              <RadioGroup
                value={settings.theme}
                onValueChange={(value) => updateSettings({ theme: value as Theme })}
              >
                {(['system', 'light', 'dark'] as const).map((theme) => (
                  <RadioGroupItem key={theme} value={theme} id={`theme-${theme}`}>
                    {t(`settings.theme.${theme}`)}
                  </RadioGroupItem>
                ))}
              </RadioGroup>
            </fieldset>
          </CardContent>
        </Card>
        <Card className="py-2">
          <CardContent className="flex flex-col divide-y divide-border">
            {toggle('sound', 'settings.sound')}
            {toggle('showLegalMoves', 'settings.legal')}
            {toggle('showCoordinates', 'settings.coordinates')}
            {toggle('autoPromote', 'settings.autoPromote')}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="setting-name" className="text-sm font-medium">
                {t('settings.name')}
              </label>
              <Input
                id="setting-name"
                value={settings.playerName}
                maxLength={16}
                onChange={(event) => updateSettings({ playerName: event.target.value })}
              />
            </div>
            {engines.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="setting-engine" className="text-sm font-medium">
                  {t('settings.engine')}
                </label>
                <Select
                  value={settings.engine}
                  onValueChange={(value) => {
                    updateSettings({ engine: value as EngineKind });
                    resetEngine();
                  }}
                >
                  <SelectTrigger id="setting-engine">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {engines.map((engine) => (
                      <SelectItem key={engine} value={engine}>
                        {t(`settings.engine.${engine}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.about')}</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
