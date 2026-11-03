import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Game } from '../src/core/game.ts';
import { MateSolver } from '../src/core/mate.ts';
import type { Move } from '../src/core/move.ts';
import { usiToMove } from '../src/core/notation.ts';
import { Position } from '../src/core/position.ts';
import { judgeTsumeMove, TSUME_PROBLEMS } from '../src/core/tsume.ts';
import { GOTE, SENTE } from '../src/core/types.ts';

const usi = (text: string): Move => usiToMove(text) as Move;

describe('詰み探索', () => {
  it('頭金是一手詰', () => {
    const solver = new MateSolver(Position.fromSfen('4k4/9/4P4/9/9/9/9/9/9 b G 1'));
    assert.equal(solver.shortestMate(5), 1);
  });

  it('打步詰不算', () => {
    const solver = new MateSolver(Position.fromSfen('8k/7R1/7G1/9/9/9/9/9/4K4 b P 1'));
    assert.ok(!solver.winningAttacks(1).includes(usi('P*1b')));
  });

  it('沒有詰就回傳 null', () => {
    assert.equal(
      new MateSolver(Position.fromSfen('4k4/9/9/9/9/9/9/9/4K4 b P 1')).shortestMate(3),
      null,
    );
  });
});

describe('詰將棋題庫', () => {
  it('每種長度都有題目', () => {
    for (const length of [1, 3, 5, 7]) {
      assert.ok(
        TSUME_PROBLEMS.some((p) => p.length === length),
        `${length} 手詰`,
      );
    }
  });

  for (const problem of TSUME_PROBLEMS) {
    it(`第 ${problem.id} 題：${problem.length} 手詰，沒有更短的解，主變化合法並以將死結束`, () => {
      const position = Position.fromSfen(problem.sfen);
      assert.equal(position.inCheck(GOTE), false);
      assert.equal(new MateSolver(position).shortestMate(problem.length), problem.length);
      const game = Game.fromMoves(problem.sfen, problem.solution.map(usi));
      assert.equal(game.result?.reason, 'checkmate');
      assert.equal(game.result?.winner, SENTE);
      assert.equal(problem.solution.length, problem.length);
    });
  }
});

describe('詰將棋判定', () => {
  const problem = TSUME_PROBLEMS.find((p) => p.length === 3) as (typeof TSUME_PROBLEMS)[number];

  it('照主變化走能解開', () => {
    const moves = [usi(problem.solution[0] as string)];
    const first = judgeTsumeMove(problem, moves);
    assert.equal(first.kind, 'continue');
    if (first.kind !== 'continue') return;
    moves.push(first.reply);
    const position = Position.fromSfen(problem.sfen);
    for (const move of moves) position.make(move);
    const finishing = new MateSolver(position).winningAttacks(1)[0] as Move;
    assert.equal(judgeTsumeMove(problem, [...moves, finishing]).kind, 'solved');
  });

  it('不將軍的著手是錯的', () => {
    const position = Position.fromSfen(problem.sfen);
    const quiet = position.legalMoves().find((move) => {
      position.make(move);
      const check = position.inCheck();
      position.unmake();
      return !check;
    });
    if (quiet !== undefined) assert.equal(judgeTsumeMove(problem, [quiet]).kind, 'wrong');
  });
});
