import type { HandicapId } from '../core/handicap.ts';
import type { Color } from '../core/types.ts';
import { GOTE, SENTE } from '../core/types.ts';

export type Seat = 'sente' | 'gote';

export const seatOf = (color: Color): Seat => (color === SENTE ? 'sente' : 'gote');
export const colorOfSeat = (seat: Seat): Color => (seat === 'sente' ? SENTE : GOTE);
export const otherSeat = (seat: Seat): Seat => (seat === 'sente' ? 'gote' : 'sente');

/** Realtime Database 的伺服器時間佔位值。Firebase SDK 的 serverTimestamp() 就是這個物件。 */
export const SERVER_TIME = { '.sv': 'timestamp' } as const;
export type ServerTime = typeof SERVER_TIME;

export interface RoomConfig {
  handicap: HandicapId;
  mainMs: number;
  byoyomiMs: number;
  incrementMs: number;
  /** 出現在大廳的公開房間 */
  public: boolean;
}

export interface RoomPlayer {
  uid: string;
  name: string;
}

export interface RoomMove {
  /** 第幾手，從 0 起算 */
  i: number;
  /** USI 寫法 */
  m: string;
  /** 伺服器時間戳 */
  t: number;
}

/**
 * Realtime Database 上一個房間的資料。
 * 勝負不在資料庫裡：每個客戶端都從 moves 與時間戳重演出同樣的結果，
 * 所以沒有人能「寫入自己贏了」。唯一能寫的結局是自己認輸。
 */
export interface RoomData {
  createdAt: number;
  /** 雙方到齊的時間，第一手的耗時從這裡算起 */
  startedAt?: number;
  config: RoomConfig;
  n: number;
  players: Partial<Record<Seat, RoomPlayer>>;
  moves?: Record<string, RoomMove> | (RoomMove | null)[];
  resigned?: Partial<Record<Seat, boolean>>;
  presence?: Partial<Record<Seat, boolean>>;
  rematch?: Partial<Record<Seat, boolean>>;
  next?: string;
}

/** 寫入時可以用 SERVER_TIME 代替數字的欄位 */
export type Patch = Record<string, unknown>;

export interface LobbyRoom {
  code: string;
  host: string;
  hostSeat: Seat;
  config: RoomConfig;
  createdAt: number;
}

/** 線上對戰需要的後端能力。正式環境是 Firebase，測試與 e2e 用記憶體版。 */
export interface RoomBackend {
  signIn(): Promise<string>;
  read(code: string): Promise<RoomData | null>;
  create(code: string, room: Patch): Promise<void>;
  /** 多路徑原子更新，路徑相對於房間 */
  update(code: string, patch: Patch): Promise<void>;
  watch(code: string, listener: (room: RoomData | null) => void): () => void;
  /** 標記上線，並在斷線時自動標記離線 */
  markPresent(code: string, seat: Seat): Promise<void>;
  remove(code: string): Promise<void>;
  /** 最新（大廳用）或最舊（清理用）的數個房間 */
  listRooms(which: 'newest' | 'oldest'): Promise<Record<string, RoomData>>;
  /** 伺服器時間減本機時間 */
  serverOffset(): number;
}
