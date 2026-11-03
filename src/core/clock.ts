import type { Color } from './types.ts';
import { GOTE, SENTE } from './types.ts';

/**
 * 持時間。三種常見制度都能用這三個數字描述：
 *   切れ負け：main > 0，其餘為 0
 *   秒讀み：  main 用完後每手有 byoyomi 秒
 *   フィッシャー：每走一手加 increment 秒
 * main 與 byoyomi 都是 0 代表不計時。
 */
export interface TimeControl {
  mainMs: number;
  byoyomiMs: number;
  incrementMs: number;
}

export const UNTIMED: TimeControl = { mainMs: 0, byoyomiMs: 0, incrementMs: 0 };

export const isTimed = (control: TimeControl): boolean =>
  control.mainMs > 0 || control.byoyomiMs > 0;

export interface ClockState {
  /** 每位棋手剩下的本時間 */
  remaining: [number, number];
}

export const initialClock = (control: TimeControl): ClockState => ({
  remaining: [control.mainMs, control.mainMs],
});

export interface ClockReading {
  /** 這一手開始後已經用掉 elapsed，現在剩下的本時間 */
  main: number;
  /** 本時間用完後，這一手的讀秒還剩多少；尚未進入讀秒則等於 byoyomiMs */
  byoyomi: number;
  inByoyomi: boolean;
  flagged: boolean;
}

/** 輪到 color 走、已經想了 elapsed 毫秒時的時鐘讀數 */
export function readClock(
  control: TimeControl,
  state: ClockState,
  color: Color,
  elapsed: number,
): ClockReading {
  const main = state.remaining[color] - elapsed;
  if (main >= 0) {
    return { main, byoyomi: control.byoyomiMs, inByoyomi: main === 0, flagged: false };
  }
  const byoyomi = control.byoyomiMs + main;
  return { main: 0, byoyomi: Math.max(0, byoyomi), inByoyomi: true, flagged: byoyomi < 0 };
}

/** color 花 elapsed 毫秒走完一手。超時則回傳 null。 */
export function spendTime(
  control: TimeControl,
  state: ClockState,
  color: Color,
  elapsed: number,
): ClockState | null {
  if (!isTimed(control)) return state;
  const reading = readClock(control, state, color, elapsed);
  if (reading.flagged) return null;
  const remaining: [number, number] = [...state.remaining];
  remaining[color] = reading.main + control.incrementMs;
  return { remaining };
}

/**
 * 從每一手的耗時重演時鐘。線上對戰用伺服器時間戳算出耗時，
 * 所以雙方得到一樣的結果。回傳時鐘狀態，以及第一個超時的手數（沒有則為 -1）。
 */
export function replayClock(
  control: TimeControl,
  firstMover: Color,
  elapsedPerMove: readonly number[],
): { state: ClockState; flaggedAt: number } {
  let state = initialClock(control);
  let color = firstMover;
  for (let ply = 0; ply < elapsedPerMove.length; ply++) {
    const next = spendTime(control, state, color, elapsedPerMove[ply] as number);
    if (!next) return { state, flaggedAt: ply };
    state = next;
    color = color === SENTE ? GOTE : SENTE;
  }
  return { state, flaggedAt: -1 };
}

/** 顯示用：1:05、0:09.5（最後十秒顯示小數） */
export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < 10_000)
    return `${Math.floor(clamped / 1000)}.${Math.floor((clamped % 1000) / 100)}`;
  const total = Math.ceil(clamped / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}
