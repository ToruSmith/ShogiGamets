import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatClock,
  initialClock,
  readClock,
  replayClock,
  spendTime,
  UNTIMED,
} from '../src/core/clock.ts';
import { GOTE, SENTE } from '../src/core/types.ts';

const suddenDeath = { mainMs: 60_000, byoyomiMs: 0, incrementMs: 0 };
const byoyomi = { mainMs: 10_000, byoyomiMs: 30_000, incrementMs: 0 };
const fischer = { mainMs: 60_000, byoyomiMs: 0, incrementMs: 5_000 };

describe('持時間', () => {
  it('切れ負け：用完就輸', () => {
    const state = initialClock(suddenDeath);
    assert.equal(spendTime(suddenDeath, state, SENTE, 59_000)?.remaining[SENTE], 1000);
    assert.equal(spendTime(suddenDeath, state, SENTE, 61_000), null);
  });

  it('秒讀：本時間用完後每手重新計秒', () => {
    let state = initialClock(byoyomi);
    state = spendTime(byoyomi, state, SENTE, 15_000) as typeof state;
    assert.equal(state.remaining[SENTE], 0);
    const reading = readClock(byoyomi, state, SENTE, 20_000);
    assert.equal(reading.inByoyomi, true);
    assert.equal(reading.byoyomi, 10_000);
    assert.ok(spendTime(byoyomi, state, SENTE, 29_000));
    assert.equal(spendTime(byoyomi, state, SENTE, 31_000), null);
    assert.ok(readClock(byoyomi, state, SENTE, 31_000).flagged);
  });

  it('費雪制：每手加秒', () => {
    const state = spendTime(fischer, initialClock(fischer), SENTE, 10_000);
    assert.equal(state?.remaining[SENTE], 55_000);
  });

  it('不計時永遠不會超時', () => {
    assert.ok(spendTime(UNTIMED, initialClock(UNTIMED), SENTE, 1e9));
  });

  it('由耗時重演，找出超時的手數', () => {
    const { flaggedAt, state } = replayClock(suddenDeath, SENTE, [30_000, 10_000, 31_000]);
    assert.equal(flaggedAt, 2);
    assert.equal(state.remaining[GOTE], 50_000);
    assert.equal(replayClock(suddenDeath, GOTE, [30_000, 10_000]).flaggedAt, -1);
  });

  it('顯示格式', () => {
    assert.equal(formatClock(65_000), '1:05');
    assert.equal(formatClock(3_725_000), '1:02:05');
    assert.equal(formatClock(9_540), '9.5');
    assert.equal(formatClock(-5), '0.0');
  });
});
