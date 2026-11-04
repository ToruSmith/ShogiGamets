import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Move } from '../src/core/move.ts';
import { usiToMove } from '../src/core/notation.ts';
import { GOTE, SENTE } from '../src/core/types.ts';
import type { RoomView } from '../src/online/session.ts';
import {
  isFlagged,
  listLobby,
  normaliseRoomCode,
  replayRoom,
  RoomSession,
} from '../src/online/session.ts';
import type { RoomConfig, RoomData } from '../src/online/types.ts';
import { SERVER_TIME } from '../src/online/types.ts';
import { PermissionDenied, RulesBackend, RulesDb } from './helpers/rules-db.ts';

const usi = (text: string): Move => usiToMove(text) as Move;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const EVEN: RoomConfig = {
  handicap: 'even',
  mainMs: 0,
  byoyomiMs: 0,
  incrementMs: 0,
  public: true,
};

async function setup(config: RoomConfig = EVEN) {
  const db = new RulesDb();
  const views: Record<string, RoomView | null> = { host: null, guest: null };
  const host = new RoomSession(new RulesBackend(db, 'alice'), (view) => (views.host = view));
  const guest = new RoomSession(new RulesBackend(db, 'bob'), (view) => (views.guest = view));
  const code = await host.create(config, 'Alice', 'sente');
  assert.equal(await guest.join(code, 'Bob'), null);
  await flush();
  return {
    db,
    host,
    guest,
    code,
    views,
    alice: new RulesBackend(db, 'alice'),
    bob: new RulesBackend(db, 'bob'),
  };
}

describe('房間代碼', () => {
  it('接受邀請連結與小寫', () => {
    assert.equal(normaliseRoomCode('https://x.pages.dev/#/r/abc234'), 'ABC234');
    assert.equal(normaliseRoomCode('ABC10O'), null);
  });
});

describe('線上對局', () => {
  it('兩人輪流下，雙方看到同一盤棋', async () => {
    const { host, guest, views } = await setup();
    assert.equal(views.host?.myTurn, true);
    assert.equal(views.guest?.myTurn, false);
    assert.ok(await host.play(usi('7g7f')));
    await flush();
    assert.equal(await host.play(usi('3c3d')), false, '不是自己的回合');
    assert.ok(await guest.play(usi('3c3d')));
    await flush();
    assert.equal(views.host?.game.moves.length, 2);
    assert.equal(views.guest?.game.position.toSfen(), views.host?.game.position.toSfen());
  });

  it('認輸後雙方都看到結果，再戰時交換先後手', async () => {
    const { host, guest, views, code } = await setup();
    await host.play(usi('7g7f'));
    await guest.resign();
    await flush();
    assert.deepEqual(views.host?.game.result, { winner: SENTE, reason: 'resign' });
    await host.requestRematch();
    await guest.requestRematch();
    await flush();
    await flush();
    assert.notEqual(views.host?.code, code);
    assert.equal(views.host?.code, views.guest?.code);
    assert.equal(views.host?.seat, 'gote');
    assert.equal(views.guest?.seat, 'sente');
    assert.equal(views.guest?.myTurn, true);
  });

  it('駒落ち：上手（後手）先走', async () => {
    const { host, guest, views } = await setup({ ...EVEN, handicap: 'two' });
    assert.equal(views.host?.myTurn, false);
    assert.equal(views.guest?.myTurn, true);
    assert.ok(await guest.play(usi('5a4b')));
    await flush();
    assert.ok(await host.play(usi('7g7f')));
    await flush();
    assert.equal(views.guest?.game.moves.length, 2);
  });

  it('第三人加入變成觀戰', async () => {
    const { db, code } = await setup();
    let seen: RoomView | null = null;
    const spectator = new RoomSession(new RulesBackend(db, 'carol'), (view) => (seen = view));
    await spectator.join(code, 'Carol');
    await flush();
    assert.equal((seen as RoomView | null)?.seat, null);
  });

  it('還沒有對手時離開會刪除房間', async () => {
    const db = new RulesDb();
    const host = new RoomSession(new RulesBackend(db, 'alice'), () => undefined);
    const code = await host.create(EVEN, 'Alice', 'gote');
    await host.leave();
    assert.equal(db.read(`rooms/${code}`), null);
  });

  it('雙方都入座後，棋手不能刪房；超過一天的舊房間任何登入者都能清除', async () => {
    const { db, code } = await setup(EVEN);
    for (const uid of ['alice', 'bob', 'mallory']) {
      assert.throws(() => db.write({ [`rooms/${code}`]: null }, { uid }), PermissionDenied);
    }
    db.time += 25 * 60 * 60 * 1000;
    db.write({ [`rooms/${code}`]: null }, { uid: 'mallory' });
    assert.equal(db.read(`rooms/${code}`), null);
  });
});

describe('持時間', () => {
  const timed: RoomConfig = { ...EVEN, mainMs: 60_000 };

  it('由伺服器時間戳算出雙方剩餘時間', async () => {
    const { db, host, guest, views } = await setup(timed);
    db.time += 10_000;
    await host.play(usi('7g7f'));
    db.time += 25_000;
    await guest.play(usi('3c3d'));
    await flush();
    assert.deepEqual(views.host?.clock.remaining, [50_000, 35_000]);
    assert.deepEqual(views.host?.times, [10_000, 25_000]);
  });

  it('超時：畫面立即判負，超時後送出的棋步也不算', async () => {
    const { db, host, views } = await setup(timed);
    const view = views.host as RoomView;
    assert.equal(isFlagged(view, db.time + 59_000), false);
    assert.equal(isFlagged(view, db.time + 61_000), true);
    db.time += 61_000;
    // 規則擋不住遲到的棋步，但重演時會判超時
    await new RulesBackend(db, 'alice').update(view.code, {
      'moves/0': { i: 0, m: '7g7f', t: SERVER_TIME },
      n: 1,
    });
    await flush();
    assert.deepEqual(views.host?.game.result, { winner: GOTE, reason: 'timeout' });
    assert.equal(await host.play(usi('2g2f')), false);
  });
});

describe('規則擋下作弊', () => {
  it('不能替對方走、不能偽造時間、不能只加手數、不能寫奇怪的棋步', async () => {
    const { db, code, bob, alice } = await setup();
    const denied = (fn: () => Promise<void>) => assert.rejects(fn, PermissionDenied);
    await denied(() => bob.update(code, { 'moves/0': { i: 0, m: '3c3d', t: SERVER_TIME }, n: 1 }));
    await denied(() => alice.update(code, { 'moves/0': { i: 0, m: '7g7f', t: 123 }, n: 1 }));
    await denied(() => alice.update(code, { 'moves/0': { i: 0, m: '7g7f', t: SERVER_TIME } }));
    await denied(() =>
      alice.update(code, { 'moves/0': { i: 0, m: 'hello', t: SERVER_TIME }, n: 1 }),
    );
    await denied(() =>
      alice.update(code, { 'moves/0': { i: 5, m: '7g7f', t: SERVER_TIME }, n: 1 }),
    );
    await denied(() => alice.update(code, { 'resigned/gote': true }));
    await denied(() => alice.update(code, { winner: 'sente' }));
    await denied(() => alice.update(code, { 'config/mainMs': 1 }));
    await denied(() =>
      new RulesBackend(db, 'mallory').update(code, {
        'players/gote': { uid: 'mallory', name: 'M' },
      }),
    );
    await alice.update(code, { 'moves/0': { i: 0, m: '7g7f', t: SERVER_TIME }, n: 1 });
    await denied(() => alice.update(code, { 'moves/0': { i: 0, m: '2g2f', t: SERVER_TIME } }));
  });

  it('只加手數不落子：規則語言組不出 moves 的路徑，改由重演判該方負', async () => {
    const { code, alice, views } = await setup();
    await alice.update(code, { n: 1 });
    await flush();
    assert.deepEqual(views.guest?.game.result, { winner: GOTE, reason: 'resign' });
  });

  it('規則管不到的不合法棋步，重演時判該方負', () => {
    const room: RoomData = {
      createdAt: 0,
      startedAt: 0,
      config: EVEN,
      n: 2,
      players: { sente: { uid: 'a', name: 'A' }, gote: { uid: 'b', name: 'B' } },
      moves: { 0: { i: 0, m: '7g7f', t: 1 }, 1: { i: 1, m: '7g7f', t: 2 } },
    };
    assert.deepEqual(replayRoom(room).game.result, { winner: SENTE, reason: 'resign' });
    assert.deepEqual(replayRoom({ ...room, n: 3 }).game.result?.winner, SENTE);
    const skipped = { ...room, n: 2, moves: { 0: { i: 0, m: '7g7f', t: 1 } } };
    assert.deepEqual(replayRoom(skipped).game.result, { winner: SENTE, reason: 'resign' });
  });
});

describe('大廳', () => {
  it('只列出等待對手的公開房間', async () => {
    const db = new RulesDb();
    const alice = new RulesBackend(db, 'alice');
    const open = await new RoomSession(alice, () => undefined).create(EVEN, 'Alice', 'sente');
    await new RoomSession(new RulesBackend(db, 'carol'), () => undefined).create(
      { ...EVEN, public: false },
      'Carol',
      'sente',
    );
    const full = await new RoomSession(new RulesBackend(db, 'dave'), () => undefined).create(
      EVEN,
      'Dave',
      'gote',
    );
    await new RoomSession(new RulesBackend(db, 'erin'), () => undefined).join(full, 'Erin');
    const lobby = await listLobby(alice);
    assert.deepEqual(
      lobby.map((room) => [room.code, room.host, room.hostSeat]),
      [[open, 'Alice', 'sente']],
    );
    // 房主斷線（關掉分頁）後就不再列出
    await alice.update(open, { 'presence/sente': false });
    assert.deepEqual(await listLobby(alice), []);
  });
});
