import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analyzeGame, classify, senteScore } from '../src/ai/analysis.ts';
import { Engine, MATE } from '../src/ai/engine.ts';
import { inlineTransport } from '../src/ai/engines.ts';
import { captureMoves } from '../src/ai/movegen.ts';
import { CancelledError } from '../src/ai/types.ts';
import { parseInfo, UsiEngine } from '../src/ai/usi-engine.ts';
import { Game } from '../src/core/game.ts';
import { HANDICAPS } from '../src/core/handicap.ts';
import type { Move } from '../src/core/move.ts';
import { isDrop, moveTo } from '../src/core/move.ts';
import { moveToUsi, usiToMove } from '../src/core/notation.ts';
import { Position, START_SFEN } from '../src/core/position.ts';
import { EMPTY } from '../src/core/types.ts';

const usi = (text: string): Move => usiToMove(text) as Move;

/** 固定種子的亂數 */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

function randomPositions(count: number): Position[] {
  const random = seeded(7);
  const out: Position[] = [];
  for (let game = 0; game < count; game++) {
    const position = Position.fromSfen();
    for (let ply = 0; ply < 80; ply++) {
      const moves = position.legalMoves();
      if (moves.length === 0) break;
      position.make(moves[Math.floor(random() * moves.length)] as Move);
      if (ply % 10 === 9) out.push(Position.fromSfen(position.toSfen()));
    }
  }
  return out;
}

describe('走法產生', () => {
  const positions = randomPositions(6);

  it('吃子產生器與 core 的吃子手一致（升變版本優先）', () => {
    for (const position of positions) {
      const fromCore = new Set(
        position
          .pseudoMoves()
          .filter((move) => !isDrop(move) && position.board[moveTo(move)] !== EMPTY)
          .map((move) => moveToUsi(move).replace('+', '')),
      );
      const fromAi = new Set(
        captureMoves(position, []).map((move) => moveToUsi(move).replace('+', '')),
      );
      assert.deepEqual([...fromAi].sort(), [...fromCore].sort(), position.toSfen());
    }
  });

  it('引擎的合法手與 core 相同（含打步詰）', () => {
    const extra = [
      Position.fromSfen('8k/7R1/7G1/9/9/9/9/9/4K4 b P 1'),
      Position.fromSfen('4k4/9/9/9/4r4/9/4G4/9/4K4 b - 1'),
    ];
    for (const position of [...positions, ...extra]) {
      const engine = new Engine();
      engine.setPosition(position.toSfen(), []);
      const mine = engine.legalMoves().map(moveToUsi).sort();
      const core = position.legalMoves().map(moveToUsi).sort();
      assert.deepEqual(mine, core, position.toSfen());
    }
  });
});

describe('內建引擎', () => {
  const best = (sfen: string, limits = { depth: 3 }): string => {
    const engine = new Engine();
    engine.setPosition(sfen, []);
    const { best: move } = engine.search(limits);
    return move === null ? 'none' : moveToUsi(move);
  };

  it('看得到一手詰', () => {
    assert.equal(best('4k4/9/4P4/9/9/9/9/9/4K4 b G 1'), 'G*5b');
  });

  it('會吃掉白送的飛車', () => {
    assert.equal(best('4k4/9/9/9/4r4/9/9/4R4/4K4 b - 1'), '5h5e');
  });

  it('看得到三手詰並回報詰數', () => {
    const engine = new Engine();
    engine.setPosition('9/k8/p1+P6/1g7/9/9/9/9/9 b RPr2b3g4s4n4l15p 1', []);
    const outcome = engine.search({ depth: 5 });
    assert.equal(outcome.info.mate, 3);
    assert.equal(moveToUsi(outcome.best as Move), 'R*7b');
  });

  it('無棋可走時回傳 null', () => {
    const engine = new Engine();
    engine.setPosition('4k4/4G4/4P4/9/9/9/9/9/4K4 w - 1', []);
    const outcome = engine.search({ depth: 2 });
    assert.equal(outcome.best, null);
    assert.equal(outcome.info.score, -MATE);
  });

  it('時間到中斷後局面完整還原', () => {
    const engine = new Engine();
    const moves = ['7g7f', '3c3d', '2g2f'].map(usi);
    engine.setPosition(START_SFEN, moves);
    const before = engine.currentPosition.toSfen();
    const key = engine.currentPosition.repetitionKey;
    engine.search({ timeMs: 30 });
    engine.search({ nodes: 777, skill: 12 });
    assert.equal(engine.currentPosition.toSfen(), before);
    assert.equal(engine.currentPosition.repetitionKey, key);
  });

  it('各難度自我對弈全程合法（含駒落ち）', () => {
    for (const [index, skill] of [0, 8, 20].entries()) {
      const handicap = HANDICAPS[index * 4] as (typeof HANDICAPS)[number];
      const game = new Game(handicap.sfen);
      const engine = new Engine();
      engine.setRandom(seeded(index + 1));
      for (let ply = 0; ply < 24 && !game.result; ply++) {
        engine.setPosition(game.startSfen, game.moves);
        const { best: move } = engine.search({ nodes: 3000, skill });
        assert.ok(move !== null);
        assert.ok(game.play(move), `${handicap.name} 第 ${ply + 1} 手 ${moveToUsi(move)}`);
      }
    }
  });
});

describe('USI', () => {
  it('解析 info 行', () => {
    const info = parseInfo('info depth 7 seldepth 9 time 10 nodes 1234 score cp -56 pv 7g7f 3c3d');
    assert.deepEqual(info, {
      depth: 7,
      scoreCp: -56,
      mate: null,
      nodes: 1234,
      pv: ['7g7f', '3c3d'],
    });
    assert.equal(parseInfo('info depth 3 score mate -5 pv 1a1b')?.mate, -5);
    assert.equal(parseInfo('info string hello'), null);
  });

  it('透過 USI 通道搜尋，取消時以 CancelledError 結束', async () => {
    const engine = new UsiEngine('test', inlineTransport);
    const result = await engine.search({
      sfen: '4k4/9/4P4/9/9/9/9/9/4K4 b G 1',
      moves: [],
      depth: 2,
    });
    assert.equal(result.bestMove, 'G*5b');
    assert.equal(result.info?.mate, 1);
    const running = engine.search({ sfen: START_SFEN, moves: [], movetimeMs: 5000 });
    engine.cancel();
    await assert.rejects(running, CancelledError);
    const again = await engine.search({ sfen: START_SFEN, moves: ['7g7f'], depth: 1, skill: 0 });
    assert.ok(usiToMove(again.bestMove) !== null);
    engine.dispose();
  });

  it('被詰時回傳 resign', async () => {
    const engine = new UsiEngine('test', inlineTransport);
    const result = await engine.search({
      sfen: '4k4/4G4/4P4/9/9/9/9/9/4K4 w - 1',
      moves: [],
      depth: 1,
    });
    assert.equal(result.bestMove, 'resign');
    engine.dispose();
  });
});

describe('賽後分析', () => {
  it('分類與分數換算', () => {
    assert.equal(classify(600, false), 'blunder');
    assert.equal(classify(600, true), 'best');
    assert.equal(classify(30, false), 'good');
    assert.equal(senteScore({ depth: 1, scoreCp: 100, mate: null, nodes: 0, pv: [] }, false), -100);
    assert.equal(senteScore({ depth: 1, scoreCp: null, mate: 3, nodes: 0, pv: [] }, true), 3000);
  });

  it('白送飛車被判為惡手', async () => {
    const engine = new UsiEngine('test', inlineTransport);
    const sfen = '4k4/9/9/9/9/9/9/4R4/4K4 w r 1';
    const progress: number[] = [];
    const analysis = await analyzeGame(engine, sfen, ['R*5e', '5h5e'].map(usi), 200, (done) =>
      progress.push(done),
    );
    assert.deepEqual(progress, [1, 2, 3]);
    assert.equal(analysis.scores.length, 3);
    assert.equal(analysis.plies[0]?.quality, 'blunder');
    assert.ok((analysis.scores[1] as number) > 500, '送掉飛車後先手大優');
    engine.dispose();
  });
});
