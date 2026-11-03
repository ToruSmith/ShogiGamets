import { useEffect, useRef, useState } from 'react';
import type { ClockView } from '../state/match.ts';
import { formatClock, readClock } from '../core/clock.ts';
import type { Color } from '../core/types.ts';
import { playTick } from '../platform/sound.ts';
import { cn } from '../lib/utils.ts';

/** 一方的棋鐘。輪到他時每 100ms 更新；讀秒最後十秒會嗶。 */
export function Clock({
  clock,
  color,
  active,
  now,
  sound,
}: {
  clock: ClockView;
  color: Color;
  active: boolean;
  now: () => number;
  sound: boolean;
}) {
  const [, setTick] = useState(0);
  const lastBeep = useRef(-1);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setTick((n) => n + 1), 100);
    return () => clearInterval(timer);
  }, [active]);

  const elapsed =
    active && clock.turnStartedAt !== null ? Math.max(0, now() - clock.turnStartedAt) : 0;
  const reading = readClock(clock.control, clock.state, color, elapsed);
  const byoyomi = reading.inByoyomi && clock.control.byoyomiMs > 0;
  const shown = byoyomi ? reading.byoyomi : reading.main;
  const low = active && shown < 10_000;

  useEffect(() => {
    if (!sound || !low) return;
    const second = Math.ceil(shown / 1000);
    if (second !== lastBeep.current && second > 0) {
      lastBeep.current = second;
      playTick();
    }
  }, [low, shown, sound]);

  return (
    <span
      className={cn(
        'num inline-flex items-baseline gap-1 rounded-[3px] px-2 py-0.5 font-mono text-sm',
        active ? 'bg-[#f6e7c8] text-[#1d140b]' : 'bg-black/25 text-[#f4e3c3]/80',
        low && 'bg-shu text-white',
      )}
      data-clock={color}
    >
      {byoyomi && <span className="text-[10px] opacity-70">秒</span>}
      {formatClock(shown)}
    </span>
  );
}
