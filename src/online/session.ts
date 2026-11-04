import type { ClockState, TimeControl } from '../core/clock.ts';
import { initialClock, isTimed, readClock, spendTime } from '../core/clock.ts';
import { Game } from '../core/game.ts';
import { handicapById } from '../core/handicap.ts';
import type { Move } from '../core/move.ts';
import { moveToUsi, usiToMove } from '../core/notation.ts';
import type { LobbyRoom, RoomBackend, RoomConfig, RoomData, RoomMove, Seat } from './types.ts';
import { SERVER_TIME, colorOfSeat, otherSeat, seatOf } from './types.ts';

/** 排除 0/O、1/I 這些在聊天軟體裡容易看錯的字元。 */
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
const STALE_MS = 24 * 60 * 60 * 1000;

export function generateRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join('');
}

export function normaliseRoomCode(text: string): string | null {
  // 接受直接貼上邀請連結
  const code = (/#\/r\/([A-Za-z0-9]{6})/.exec(text)?.[1] ?? text).trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

export const controlOf = (config: RoomConfig): TimeControl => ({
  mainMs: config.mainMs,
  byoyomiMs: config.byoyomiMs,
  incrementMs: config.incrementMs,
});

function sortedMoves(room: RoomData): RoomMove[] {
  const entries = Object.values(room.moves ?? {}).filter((move): move is RoomMove => !!move);
  return entries.sort((a, b) => a.i - b.i);
}

/** 這個手數上的宣言與和局。宣言不成立時棋局繼續。 */
function settleAt(room: RoomData, game: Game): void {
  const ply = game.moves.length;
  if (room.declared?.[seatOf(game.turn)] === ply) game.declare();
  if (room.draw?.sente === ply && room.draw.gote === ply) game.agreeDraw();
}

export interface RoomReplay {
  game: Game;
  clock: ClockState;
  /** 每手耗時（毫秒） */
  times: number[];
  /** 目前這一手從何時開始計時；尚未開始為 null */
  turnStartedAt: number | null;
}

/**
 * 從房間資料重演整盤棋與時鐘。任何客戶端在任何時刻（重新整理、斷線重連）都得到同一個結果。
 * 竄改出來的不合法資料判該方負；時間戳顯示超時的那一手不算，判超時負。
 */
export function replayRoom(room: RoomData): RoomReplay {
  const game = new Game(handicapById(room.config.handicap).sfen);
  const control = controlOf(room.config);
  let clock = initialClock(control);
  const times: number[] = [];
  let last = room.startedAt ?? null;
  const moves = sortedMoves(room);
  const expected = Math.max(room.n, moves.length);
  for (let ply = 0; ply < expected; ply++) {
    settleAt(room, game);
    if (game.result) break;
    const mover = game.turn;
    const entry = moves[ply];
    const move = entry?.i === ply ? usiToMove(entry.m) : null;
    if (!entry || move === null) {
      game.conclude(mover, 'resign');
      break;
    }
    const elapsed = last === null ? 0 : Math.max(0, entry.t - last);
    const next = spendTime(control, clock, mover, elapsed);
    if (!next) {
      game.conclude(mover, 'timeout');
      break;
    }
    if (!game.play(move)) {
      game.conclude(mover, 'resign');
      break;
    }
    clock = next;
    times.push(elapsed);
    last = entry.t;
  }
  settleAt(room, game);
  for (const seat of ['sente', 'gote'] as const) {
    if (room.resigned?.[seat]) game.conclude(colorOfSeat(seat), 'resign');
  }
  const bothJoined = Boolean(room.players.sente && room.players.gote);
  return { game, clock, times, turnStartedAt: bothJoined ? last : null };
}

export type JoinError = 'not-found' | 'unavailable';

export interface RoomView {
  code: string;
  room: RoomData;
  game: Game;
  clock: ClockState;
  times: number[];
  turnStartedAt: number | null;
  control: TimeControl;
  /** 我的座位；觀戰者為 null */
  seat: Seat | null;
  opponentOnline: boolean;
  opponentJoined: boolean;
  myTurn: boolean;
}

/** 走子方此刻是否已經超時（以伺服器時間計） */
export function isFlagged(view: RoomView, serverNow: number): boolean {
  if (view.game.result || view.turnStartedAt === null || !isTimed(view.control)) return false;
  const elapsed = serverNow - view.turnStartedAt;
  return readClock(view.control, view.clock, view.game.turn, elapsed).flagged;
}

/** 列出等待對手的公開房間 */
export async function listLobby(backend: RoomBackend): Promise<LobbyRoom[]> {
  await backend.signIn();
  const rooms = await backend.listRooms('newest');
  const now = Date.now() + backend.serverOffset();
  return Object.entries(rooms)
    .filter(([, room]) => {
      const seats = Object.keys(room.players ?? {}) as Seat[];
      const host = seats[0];
      return (
        room.config?.public &&
        seats.length === 1 &&
        !room.n &&
        // 房主關掉分頁時 onDisconnect 會把 presence 設成 false
        host !== undefined &&
        room.presence?.[host] !== false &&
        now - room.createdAt < 60 * 60 * 1000
      );
    })
    .map(([code, room]) => {
      const hostSeat = Object.keys(room.players)[0] as Seat;
      return {
        code,
        host: room.players[hostSeat]?.name ?? '?',
        hostSeat,
        config: room.config,
        createdAt: room.createdAt,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** 一場線上對局的完整生命週期，與 UI 無關。 */
export class RoomSession {
  private uid = '';
  private stopWatching: (() => void) | null = null;
  private current: RoomView | null = null;
  private following = false;
  private creatingRematch = false;
  private ended = false;

  constructor(
    private readonly backend: RoomBackend,
    private readonly onView: (view: RoomView | null, closed: boolean) => void,
  ) {}

  get view(): RoomView | null {
    return this.current;
  }

  serverNow(): number {
    return Date.now() + this.backend.serverOffset();
  }

  /** 開房。seat 決定房主坐先手（下手）或後手（上手）。 */
  async create(config: RoomConfig, name: string, seat: Seat): Promise<string> {
    this.uid = await this.backend.signIn();
    void this.sweepStale();
    let code = generateRoomCode();
    for (let tries = 0; tries < 5 && (await this.backend.read(code)); tries++) {
      code = generateRoomCode();
    }
    await this.backend.create(code, {
      createdAt: SERVER_TIME,
      config,
      n: 0,
      players: { [seat]: { uid: this.uid, name } },
    });
    await this.enter(code, seat);
    return code;
  }

  /** 加入房間。已經在房內（重新整理）就恢復座位；房間已滿就變成觀戰。 */
  async join(code: string, name: string): Promise<JoinError | null> {
    this.uid = await this.backend.signIn();
    const room = await this.backend.read(code);
    if (!room) return 'not-found';

    let seat = (['sente', 'gote'] as const).find((s) => room.players[s]?.uid === this.uid) ?? null;
    if (!seat) {
      const open = (['sente', 'gote'] as const).find((s) => !room.players[s]);
      if (open) {
        try {
          await this.backend.update(code, {
            [`players/${open}`]: { uid: this.uid, name },
            startedAt: SERVER_TIME,
          });
          seat = open;
        } catch {
          // 同時有人搶先入座：規則會拒絕寫入，退回觀戰
          seat = null;
        }
      }
    }
    await this.enter(code, seat);
    return null;
  }

  private async enter(code: string, seat: Seat | null): Promise<void> {
    this.stopWatching?.();
    this.following = false;
    this.creatingRematch = false;
    if (seat) await this.backend.markPresent(code, seat).catch(() => undefined);
    this.stopWatching = this.backend.watch(code, (room) => this.receive(code, seat, room));
  }

  private receive(code: string, seat: Seat | null, room: RoomData | null): void {
    if (this.ended) return;
    if (!room) {
      this.current = null;
      this.onView(null, true);
      return;
    }
    const replay = replayRoom(room);
    const opponent = seat ? otherSeat(seat) : null;
    const { game } = replay;
    this.current = {
      code,
      room,
      ...replay,
      control: controlOf(room.config),
      seat,
      opponentJoined: opponent ? Boolean(room.players[opponent]) : true,
      opponentOnline: opponent ? room.presence?.[opponent] !== false : true,
      myTurn:
        !!seat &&
        !game.result &&
        Boolean(room.players.sente && room.players.gote) &&
        seatOf(game.turn) === seat,
    };
    this.onView(this.current, false);
    void this.handleRematch(room, seat);
  }

  async play(move: Move): Promise<boolean> {
    const view = this.current;
    if (!view?.myTurn || isFlagged(view, this.serverNow())) return false;
    if (!view.game.position.isLegal(move)) return false;
    const index = view.game.moves.length;
    await this.backend.update(view.code, {
      [`moves/${index}`]: { i: index, m: moveToUsi(move), t: SERVER_TIME },
      n: index + 1,
    });
    return true;
  }

  async resign(): Promise<void> {
    const view = this.current;
    if (!view?.seat || view.game.result) return;
    await this.backend.update(view.code, { [`resigned/${view.seat}`]: true });
  }

  /** 入玉宣言；只有輪到自己且條件成立才會送出 */
  async declare(): Promise<void> {
    const view = this.current;
    if (!view?.myTurn || !view.game.canDeclare) return;
    if (isFlagged(view, this.serverNow())) return;
    await this.backend.update(view.code, { [`declared/${view.seat}`]: view.game.moves.length });
  }

  /** 提和，或同意對方的提和。對局繼續走下去，這次提和就失效。 */
  async offerDraw(): Promise<void> {
    const view = this.current;
    if (!view?.seat || view.game.result) return;
    await this.backend.update(view.code, { [`draw/${view.seat}`]: view.game.moves.length });
  }

  async requestRematch(): Promise<void> {
    const view = this.current;
    if (!view?.seat) return;
    await this.backend.update(view.code, { [`rematch/${view.seat}`]: true });
  }

  /** 雙方都按再戰時，由先手方開新房（交換先後手），另一方跟著 next 過去。 */
  private async handleRematch(room: RoomData, seat: Seat | null): Promise<void> {
    if (room.next && !this.following) {
      this.following = true;
      const nextSeat = seat ? otherSeat(seat) : null;
      try {
        if (await this.backend.read(room.next)) await this.enter(room.next, nextSeat);
        else this.following = false;
      } catch {
        this.following = false;
      }
      return;
    }
    const { sente, gote } = room.players;
    if (seat !== 'sente' || !sente || !gote || room.next || this.creatingRematch) return;
    if (!room.rematch?.sente || !room.rematch.gote) return;
    this.creatingRematch = true;
    const code = generateRoomCode();
    await this.backend.create(code, {
      createdAt: SERVER_TIME,
      startedAt: SERVER_TIME,
      config: { ...room.config, public: false },
      n: 0,
      players: { sente: gote, gote: sente },
    });
    if (this.current) await this.backend.update(this.current.code, { next: code });
  }

  /** 順手清掉一天以上的舊房間，失敗不影響遊戲 */
  private async sweepStale(): Promise<void> {
    try {
      const rooms = await this.backend.listRooms('oldest');
      const limit = this.serverNow() - STALE_MS;
      await Promise.allSettled(
        Object.entries(rooms)
          .filter(([, room]) => room.createdAt < limit)
          .map(([code]) => this.backend.remove(code)),
      );
    } catch {
      // 忽略
    }
  }

  /** 離開房間。還沒開打的房間直接刪除，不留垃圾資料。 */
  async leave(): Promise<void> {
    const view = this.current;
    this.ended = true;
    this.stopWatching?.();
    this.stopWatching = null;
    this.current = null;
    if (!view?.seat) return;
    const { code, seat, room } = view;
    try {
      if (!room.players[otherSeat(seat)]) await this.backend.remove(code);
      else await this.backend.update(code, { [`presence/${seat}`]: false });
    } catch {
      // 離線時無法清理，留給下一次 sweepStale
    }
  }
}
