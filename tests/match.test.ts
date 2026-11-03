import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Move } from '../src/core/move.ts';
import { usiToMove } from '../src/core/notation.ts';
import { GOTE, SENTE } from '../src/core/types.ts';
import type { LocalConfig } from '../src/state/match.ts';
import { LocalMatch } from '../src/state/match.ts';

const usi = (text: string): Move => usiToMove(text) as Move;
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const untimed = { mainMs: 0, byoyomiMs: 0, incrementMs: 0 };
const config = (patch: Partial<LocalConfig> = {}): LocalConfig => ({
  mode: 'local',
  handicap: 'even',
  control: untimed,
  human: SENTE,
  level: 1,
  names: ['A', 'B'],
  ...patch,
});

async function until(check: () => boolean, ms = 5000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('timeout');
    await wait(20);
  }
}

describe('對局控制', () => {
  it('雙人同機：輪流走、悔棋一手', () => {
    const match = new LocalMatch(config());
    match.play(usi('7g7f'));
    match.play(usi('3c3d'));
    assert.equal(match.store.get().game.moves.length, 2);
    match.undo();
    assert.equal(match.store.get().game.moves.length, 1);
    assert.equal(match.store.get().game.turn, GOTE);
    match.dispose();
  });

  it('對電腦：電腦會回應；悔棋退回到自己的回合', async () => {
    const match = new LocalMatch(config({ mode: 'ai' }));
    match.play(usi('7g7f'));
    await until(() => match.store.get().game.moves.length === 2);
    assert.equal(match.store.get().interactive, true);
    match.undo();
    assert.equal(match.store.get().game.moves.length, 0);
    match.dispose();
  });

  it('電腦執先手時先走；不是人類的回合時忽略操作', async () => {
    const match = new LocalMatch(config({ mode: 'ai', human: GOTE }));
    match.play(usi('7g7f'));
    await until(() => match.store.get().game.moves.length === 1);
    assert.equal(match.store.get().bottom, GOTE);
    match.dispose();
  });

  it('切れ負け：時間到判負並存檔', async () => {
    const match = new LocalMatch(
      config({ control: { mainMs: 150, byoyomiMs: 0, incrementMs: 0 } }),
    );
    assert.equal(match.store.get().canUndo, false, '計時對局不能悔棋');
    await until(() => match.store.get().result !== null, 2000);
    assert.deepEqual(match.store.get().result, { winner: GOTE, reason: 'timeout' });
    assert.ok(match.store.get().savedId);
    match.dispose();
  });

  it('投了：對電腦時投了的是人類', () => {
    const match = new LocalMatch(config({ mode: 'ai', human: GOTE }));
    match.resign();
    assert.deepEqual(match.store.get().result, { winner: SENTE, reason: 'resign' });
    match.dispose();
  });
});
