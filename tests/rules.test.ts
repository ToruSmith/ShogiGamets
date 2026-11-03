import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Game } from '../src/core/game.ts';
import { moveToKifu, moveToUsi, usiToMove } from '../src/core/notation.ts';
import { Position, START_SFEN } from '../src/core/position.ts';
import type { Move } from '../src/core/move.ts';
import { GOTE, SENTE } from '../src/core/types.ts';

const usi = (text: string): Move => {
  const move = usiToMove(text);
  if (move === null) throw new Error(text);
  return move;
};
const legal = (sfen: string): Set<string> =>
  new Set(Position.fromSfen(sfen).legalMoves().map(moveToUsi));

describe('打入', () => {
  it('二步不可打', () => {
    const moves = legal('4k4/9/9/9/9/9/4P4/9/4K4 b P 1');
    assert.ok(!moves.has('P*5d'), '同一筋已有未升變的步');
    assert.ok(moves.has('P*4d'));
  });

  it('同筋只有と金時可以打步', () => {
    assert.ok(legal('4k4/9/9/9/9/9/4+P4/9/4K4 b P 1').has('P*5d'));
  });

  it('步、香不能打在最後一段，桂不能打在最後兩段', () => {
    const moves = legal('4k4/9/9/9/9/9/9/9/4K4 b PLN 1');
    assert.ok(!moves.has('P*1a'));
    assert.ok(!moves.has('L*1a'));
    assert.ok(!moves.has('N*1a'));
    assert.ok(!moves.has('N*1b'));
    assert.ok(moves.has('N*1c'));
    assert.ok(moves.has('P*1b'));
  });

  it('打步詰是禁手', () => {
    // 後手玉在 1a，飛車守住 2a 與 1b，金保護飛車，打步 1b 無處可逃
    const moves = legal('8k/7R1/7G1/9/9/9/9/9/4K4 b P 1');
    assert.equal(moves.has('P*1b'), false, '打步將死對手');
  });

  it('打步將軍但對手能逃就可以', () => {
    assert.ok(legal('8k/9/9/9/9/9/9/9/4K4 b P 1').has('P*1b'));
  });

  it('走步將死不是打步詰', () => {
    const game = new Game('8k/6G2/7GP/9/9/9/9/9/4K4 b - 1');
    assert.ok(game.play(usi('1c1b')));
    assert.equal(game.result?.reason, 'checkmate');
    assert.equal(game.result?.winner, SENTE);
  });
});

describe('升變', () => {
  it('進入敵陣可選擇升變', () => {
    const moves = legal('4k4/9/9/P8/9/9/9/9/4K4 b - 1');
    assert.ok(moves.has('9d9c'));
    assert.ok(moves.has('9d9c+'));
  });

  it('步走到最後一段必須升變', () => {
    const moves = legal('4k4/P8/9/9/9/9/9/9/4K4 b - 1');
    assert.ok(moves.has('9b9a+'));
    assert.ok(!moves.has('9b9a'));
  });

  it('桂走到最後兩段必須升變', () => {
    const moves = legal('4k4/9/9/N8/9/9/9/9/4K4 b - 1');
    assert.ok(moves.has('9d8b+'));
    assert.ok(!moves.has('9d8b'));
  });

  it('從敵陣走出也能升變；金與玉不能升變', () => {
    const moves = legal('4k4/9/R8/9/G8/9/9/9/4K4 b - 1');
    assert.ok(moves.has('9c9d+'));
    assert.ok(![...moves].some((move) => move.startsWith('9e') && move.endsWith('+')));
  });

  it('被吃掉的升變棋子回到手上是原本的棋種', () => {
    const position = Position.fromSfen('4k4/9/9/9/9/9/+p8/R8/4K4 b - 1');
    position.make(usi('9h9g'));
    assert.equal(position.toSfen().split(' ')[2], 'P');
  });
});

describe('王的安全', () => {
  it('被將軍時只能應將', () => {
    const moves = legal('4k4/9/9/9/4r4/9/9/9/4K3R b - 1');
    assert.ok(moves.has('5i4i'));
    assert.ok(!moves.has('1i1a'));
  });

  it('被牽制的棋不能離線', () => {
    const moves = legal('4k4/9/9/9/4r4/9/4G4/9/4K4 b - 1');
    assert.ok(moves.has('5g5f'));
    assert.ok(!moves.has('5g4g'));
  });

  it('王不能走進被攻擊的格子', () => {
    const moves = legal('4k4/9/9/9/9/9/9/3r5/4K4 b - 1');
    assert.ok(!moves.has('5i5h'));
    assert.ok(!moves.has('5i6i'));
    assert.ok(moves.has('5i4i'));
    assert.ok(moves.has('5i6h'), '沒有保護的飛車可以吃');
  });
});

describe('終局', () => {
  it('將死', () => {
    const game = new Game('8k/9/8G/9/9/9/9/9/4K4 b G 1');
    assert.ok(game.play(usi('G*1b')));
    assert.equal(game.result?.reason, 'checkmate');
    assert.equal(game.result?.winner, SENTE);
    assert.equal(game.play(usi('5i5h')), false);
  });

  it('悔棋會清除勝負', () => {
    const game = new Game('8k/9/8G/9/9/9/9/9/4K4 b G 1');
    game.play(usi('G*1b'));
    game.undo();
    assert.equal(game.result, null);
    assert.equal(game.turn, SENTE);
  });

  it('千日手：同局面第四次出現判和', () => {
    const game = new Game();
    const cycle = ['2h3h', '8b7b', '3h2h', '7b8b'];
    for (let round = 0; round < 3; round++) {
      assert.equal(game.result, null);
      for (const text of cycle) assert.ok(game.play(usi(text)), text);
    }
    assert.equal(game.result?.reason, 'repetition');
    assert.equal(game.result?.winner, null);
  });

  it('連續王手千日手：將軍的一方判負', () => {
    const game = new Game('8k/9/9/9/9/9/9/8R/4K4 b - 1');
    assert.ok(game.play(usi('1h1b')));
    assert.ok(game.play(usi('1a2a')));
    for (let round = 0; round < 4 && !game.result; round++) {
      for (const text of ['1b2b', '2a1a', '2b1b', '1a2a']) {
        if (game.result) break;
        assert.ok(game.play(usi(text)), text);
      }
    }
    assert.equal(game.result?.reason, 'perpetual-check');
    assert.equal(game.result?.winner, GOTE);
  });

  it('認輸與超時', () => {
    const game = new Game();
    game.conclude(SENTE, 'resign');
    assert.equal(game.result?.winner, GOTE);
  });

  it('不合法的棋步不改變狀態', () => {
    const game = new Game();
    assert.equal(game.play(usi('7g7e')), false);
    assert.equal(game.moves.length, 0);
    assert.equal(game.position.toSfen(), START_SFEN);
  });
});

describe('棋譜', () => {
  it('USI 可往返', () => {
    for (const text of ['7g7f', '8h2b+', 'P*5e', 'R*1a']) {
      assert.equal(moveToUsi(usi(text)), text);
    }
    assert.equal(usiToMove('9j1a'), null);
    assert.equal(usiToMove('X*5e'), null);
  });

  it('日文棋譜', () => {
    const position = Position.fromSfen();
    assert.equal(moveToKifu(usi('7g7f'), position, null), '▲７六歩(77)');
    assert.equal(moveToKifu(usi('2h7h'), position, null), '▲７八飛(28)');
    const game = new Game('4k4/9/9/9/9/9/9/9/4K4 b P 1');
    assert.equal(moveToKifu(usi('P*5e'), game.position, null), '▲５五歩打');
  });
});
