import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canDeclare, countDeclaration } from '../src/core/declaration.ts';
import { Game } from '../src/core/game.ts';
import { Position } from '../src/core/position.ts';
import { GOTE, SENTE } from '../src/core/types.ts';

const can = (sfen: string): boolean => canDeclare(Position.fromSfen(sfen));
const SENTE_28 = '4K4/PPPPPPPPP/2R1B1G2/9/9/9/9/9/4k4 b R3G 1';
const SENTE_27 = '4K4/PPPPPPPPP/2R1B1G2/9/9/9/9/9/4k4 b R2G 1';
const GOTE_27 = '4K4/9/9/9/9/9/2r1b1g2/ppppppppp/4k4 w r2g 1';

describe('入玉宣言（27 點法）', () => {
  it('持駒與敵陣內的駒一起計點，飛角與成駒 5 點', () => {
    const position = Position.fromSfen('4K4/PP7/+R+B+P6/9/9/9/9/9/4k4 b B 1');
    assert.deepEqual(countDeclaration(position, SENTE), { pieces: 5, points: 18 });
  });

  it('先手 28 點才成立，後手 27 點就成立', () => {
    assert.equal(can(SENTE_28), true);
    assert.equal(can(SENTE_27), false);
    assert.equal(can(GOTE_27), true);
    assert.equal(countDeclaration(Position.fromSfen(GOTE_27), GOTE).points, 27);
  });

  it('玉不在敵陣、被將軍、敵陣內不足 10 枚都不成立', () => {
    assert.equal(can('9/PPPPPPPPP/2R1B1G2/4K4/9/9/9/9/4k4 b R3G 1'), false);
    assert.equal(can('4K3r/PPPPPPPPP/2R1B1G2/9/9/9/9/9/4k4 b B3G 1'), false);
    assert.equal(can('4K4/PPPPPPPP1/9/9/9/9/9/9/4k4 b 2R2B4G 1'), false);
  });

  it('宣言成立時宣言方勝；不成立時棋局繼續', () => {
    const game = new Game(SENTE_28);
    assert.equal(game.declare(), true);
    assert.deepEqual(game.result, { winner: SENTE, reason: 'declaration' });
    const early = new Game(SENTE_27);
    assert.equal(early.declare(), false);
    assert.equal(early.result, null);
  });
});
