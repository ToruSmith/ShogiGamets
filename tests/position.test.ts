import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Position, START_SFEN } from '../src/core/position.ts';

describe('走子數量基準（perft）', () => {
  for (const [depth, expected] of [
    [1, 30],
    [2, 900],
    [3, 25470],
    [4, 719731],
  ] as const) {
    it(`初形深度 ${depth} = ${expected}`, () => {
      assert.equal(Position.fromSfen().perft(depth), expected);
    });
  }

  it('已知合法手數最多的局面有 593 手', () => {
    const position = Position.fromSfen('R8/2K1S1SSk/4B4/9/9/9/9/9/1L1L1L3 b RBGSNLP3g3n17p 1');
    assert.equal(position.legalMoves().length, 593);
  });
});

describe('SFEN', () => {
  it('可往返', () => {
    for (const sfen of [
      START_SFEN,
      '8l/1l+R2P3/p2pBG1pp/kps1p4/Nn1P2G2/P1P1P2PP/1PS6/1KSG3+r1/LN2+p3L w Sbgn3p 124',
    ]) {
      assert.equal(Position.fromSfen(sfen).toSfen(Number(sfen.split(' ')[3])), sfen);
    }
  });

  it('走子再收回後局面與雜湊都還原', () => {
    const position = Position.fromSfen();
    const before = position.toSfen();
    const key = position.repetitionKey;
    position.perft(3);
    assert.equal(position.toSfen(), before);
    assert.equal(position.repetitionKey, key);
  });

  it('拒絕壞掉的 SFEN', () => {
    assert.throws(() => Position.fromSfen('abc'));
    assert.throws(() => Position.fromSfen('9/9/9/9/9/9/9/9 b - 1'));
  });
});
