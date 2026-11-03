import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Game } from '../src/core/game.ts';
import { HANDICAPS, handicapById, handicapOfSfen } from '../src/core/handicap.ts';
import type { Move } from '../src/core/move.ts';
import { moveToUsi, usiToMove } from '../src/core/notation.ts';
import { START_SFEN } from '../src/core/position.ts';
import {
  exportKif,
  exportSfen,
  importKif,
  importRecord,
  importSfen,
  kifuLabels,
  RecordError,
  replayRecord,
} from '../src/core/record.ts';
import { GOTE, SENTE } from '../src/core/types.ts';

const usi = (text: string): Move => usiToMove(text) as Move;
const OPENING = ['7g7f', '3c3d', '8h2b+', '3a2b', 'B*4e', '8b7b'].map(usi);

describe('SFEN 匯入匯出', () => {
  it('startpos moves 可往返', () => {
    const text = exportSfen({ startSfen: START_SFEN, moves: OPENING });
    assert.equal(text, 'startpos moves 7g7f 3c3d 8h2b+ 3a2b B*4e 8b7b');
    assert.deepEqual(importSfen(`position ${text}`).moves, OPENING);
  });

  it('接受自訂局面與省略手數', () => {
    const record = importSfen('sfen 4k4/9/9/9/9/9/9/9/4K4 b G moves G*5b');
    assert.equal(record.startSfen, '4k4/9/9/9/9/9/9/9/4K4 b G 1');
    assert.equal(record.moves.length, 1);
    assert.equal(importSfen('4k4/9/9/9/9/9/9/9/4K4 b G').moves.length, 0);
  });

  it('只有棋步時從平手開始', () => {
    assert.equal(importRecord('7g7f 3c3d').moves.length, 2);
  });

  it('不合法的棋步會指出第幾手', () => {
    assert.throws(() => importSfen('startpos moves 7g7f 7g7e'), /第 2 手/);
    assert.throws(() => importSfen('startpos moves zz'), RecordError);
  });
});

describe('KIF', () => {
  it('匯出後再匯入得到同樣的棋步與結局', () => {
    const record = {
      startSfen: START_SFEN,
      moves: OPENING,
      result: { winner: GOTE as 0 | 1, reason: 'resign' as const },
      sente: '甲',
      gote: '乙',
      times: [1000, 2000, 65000, 3000, 4000, 5000],
    };
    const kif = exportKif(record);
    assert.match(kif, /手合割：平手/);
    assert.match(kif, / {3}3 ２二角成\(88\)/);
    assert.match(kif, / {3}4 同　銀\(31\)/);
    assert.match(kif, / {3}5 ４五角打/);
    assert.match(kif, / {3}7 投了/);
    assert.match(kif, /まで6手で後手の勝ち/);
    const back = importKif(kif);
    assert.deepEqual(back.moves, OPENING);
    assert.deepEqual(back.result, { winner: GOTE, reason: 'resign' });
    assert.equal(back.sente, '甲');
    assert.deepEqual(back.times, [1000, 2000, 65000, 3000, 4000, 5000]);
  });

  it('讀得懂一般軟體輸出的 KIF', () => {
    const kif = `# ---- Kifu for Windows V7 V7.70 棋譜ファイル ----
開始日時：2024/05/01 10:00:00
手合割：平手　　
先手：先手さん
後手：後手さん
手数----指手---------消費時間--
*コメント
   1 ７六歩(77)   ( 0:03/00:00:03)
   2 ３四歩(33)   ( 0:05/00:00:05)
   3 ２二角成(88) ( 0:01/00:00:04)
   4 同　銀(31)   ( 0:02/00:00:07)
   5 ４五角打     ( 0:10/00:00:14)
   6 中断         ( 0:00/00:00:07)
まで5手で中断
変化：5手
   5 ６八銀(79)   ( 0:00/00:00:04)
`;
    const record = importKif(kif);
    assert.equal(record.moves.length, 5);
    assert.equal(record.result, undefined);
    assert.equal(record.sente, '先手さん');
  });

  it('駒落ち：手合割決定起始局面，上手先走', () => {
    const kif = '手合割：二枚落ち\n手数----指手--\n   1 ６二銀(71)\n   2 ７六歩(77)\n';
    const record = importKif(kif);
    assert.equal(record.startSfen, handicapById('two').sfen);
    const game = replayRecord(record);
    assert.equal(game.turn, GOTE);
    const exported = exportKif(record);
    assert.match(exported, /手合割：二枚落ち/);
    assert.match(exported, /上手：/);
  });

  it('BOD 盤面圖（詰將棋）可往返', () => {
    const record = { startSfen: '7Sk/9/8p/9/9/9/9/9/9 b G2r2b3g3s4n4l17p 1', moves: [usi('G*1b')] };
    const kif = exportKif(record);
    assert.match(kif, /\| ・ ・ ・ ・ ・ ・ ・ ・v歩\|三/);
    assert.match(kif, /先手の持駒：金/);
    const back = importKif(kif);
    assert.equal(back.startSfen, record.startSfen);
    assert.deepEqual(back.moves, record.moves);
    assert.equal(replayRecord(back).result?.reason, 'checkmate');
    assert.match(kif, /まで1手で先手の勝ち/);
  });

  it('自動判斷格式', () => {
    assert.equal(importRecord('   1 ７六歩(77)\n').moves.length, 1);
    assert.throws(() => importRecord('hello'), RecordError);
  });
});

describe('棋譜標記', () => {
  it('省略出發點並處理同', () => {
    assert.deepEqual(kifuLabels(START_SFEN, OPENING.slice(0, 4)), [
      '▲７六歩',
      '△３四歩',
      '▲２二角成',
      '△同　銀',
    ]);
  });
});

describe('駒落ち', () => {
  it('每種手合都是合法局面，且由上手先走', () => {
    for (const handicap of HANDICAPS) {
      const game = new Game(handicap.sfen);
      assert.ok(game.legalMoves().length > 0, handicap.name);
      assert.equal(game.turn, handicap.id === 'even' ? SENTE : GOTE, handicap.name);
      assert.equal(handicapOfSfen(handicap.sfen)?.id, handicap.id);
    }
  });

  it('上手可以正常走子', () => {
    const game = new Game(handicapById('rook').sfen);
    assert.ok(game.play(usi('3c3d')));
    assert.equal(moveToUsi(game.moves[0] as Move), '3c3d');
  });
});
