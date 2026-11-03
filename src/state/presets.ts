import type { TimeControl } from '../core/clock.ts';
import type { MessageKey } from '../i18n/index.ts';

export interface TimePreset {
  id: string;
  label: MessageKey;
  control: TimeControl;
}

const minutes = (n: number): number => n * 60_000;

export const TIME_PRESETS: readonly TimePreset[] = [
  { id: 'none', label: 'time.none', control: { mainMs: 0, byoyomiMs: 0, incrementMs: 0 } },
  {
    id: 'sudden5',
    label: 'time.sudden5',
    control: { mainMs: minutes(5), byoyomiMs: 0, incrementMs: 0 },
  },
  {
    id: 'sudden10',
    label: 'time.sudden10',
    control: { mainMs: minutes(10), byoyomiMs: 0, incrementMs: 0 },
  },
  { id: 'byo30', label: 'time.byo30', control: { mainMs: 0, byoyomiMs: 30_000, incrementMs: 0 } },
  {
    id: '10m30s',
    label: 'time.10m30s',
    control: { mainMs: minutes(10), byoyomiMs: 30_000, incrementMs: 0 },
  },
  {
    id: '30m60s',
    label: 'time.30m60s',
    control: { mainMs: minutes(30), byoyomiMs: 60_000, incrementMs: 0 },
  },
  {
    id: 'fischer3',
    label: 'time.fischer3',
    control: { mainMs: minutes(3), byoyomiMs: 0, incrementMs: 2_000 },
  },
  {
    id: 'fischer10',
    label: 'time.fischer10',
    control: { mainMs: minutes(10), byoyomiMs: 0, incrementMs: 5_000 },
  },
];

export const presetById = (id: string): TimePreset =>
  TIME_PRESETS.find((preset) => preset.id === id) ?? (TIME_PRESETS[0] as TimePreset);

export function presetOf(control: TimeControl): TimePreset | undefined {
  return TIME_PRESETS.find(
    (preset) =>
      preset.control.mainMs === control.mainMs &&
      preset.control.byoyomiMs === control.byoyomiMs &&
      preset.control.incrementMs === control.incrementMs,
  );
}
