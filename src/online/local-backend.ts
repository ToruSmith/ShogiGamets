import type { Patch, RoomBackend, RoomData, Seat } from './types.ts';

/**
 * 只存在於端對端測試版本（vite build --mode e2e）：用 localStorage 與 BroadcastChannel
 * 模擬伺服器，讓兩個分頁能真的對戰。正式版不會打包這個檔案。
 */
type Tree = Record<string, unknown>;

const channel = new BroadcastChannel('shogi-e2e');
const key = (code: string): string => `e2e-room-${code}`;
/** 分頁可能在不同行程；訊息直接帶完整內容，localStorage 只負責重新整理後的還原 */
const cache = new Map<string, string | null>();

function readRoom(code: string): RoomData | null {
  const raw = cache.has(code) ? cache.get(code) : localStorage.getItem(key(code));
  return raw ? (JSON.parse(raw) as RoomData) : null;
}

const listeners = new Set<(code: string) => void>();
channel.onmessage = (event: MessageEvent<{ code: string; raw: string | null }>) => {
  cache.set(event.data.code, event.data.raw);
  listeners.forEach((fn) => fn(event.data.code));
};

function writeRoom(code: string, room: RoomData | null): void {
  const raw = room ? JSON.stringify(room) : null;
  cache.set(code, raw);
  if (raw) localStorage.setItem(key(code), raw);
  else localStorage.removeItem(key(code));
  channel.postMessage({ code, raw });
  listeners.forEach((fn) => fn(code));
}

/** 把 SERVER_TIME 佔位值換成現在時間 */
function resolveTimes(value: unknown, now: number): unknown {
  if (value && typeof value === 'object') {
    if ((value as Tree)['.sv'] === 'timestamp') return now;
    return Object.fromEntries(
      Object.entries(value as Tree).map(([k, v]) => [k, resolveTimes(v, now)]),
    );
  }
  return value;
}

export class LocalBackend implements RoomBackend {
  private readonly uid =
    sessionStorage.getItem('e2e-uid') ??
    (() => {
      const id = crypto.randomUUID();
      sessionStorage.setItem('e2e-uid', id);
      return id;
    })();

  async signIn(): Promise<string> {
    return this.uid;
  }
  async read(code: string): Promise<RoomData | null> {
    return readRoom(code);
  }
  async create(code: string, room: Patch): Promise<void> {
    writeRoom(code, resolveTimes(room, Date.now()) as RoomData);
  }
  async update(code: string, patch: Patch): Promise<void> {
    const room = (readRoom(code) ?? {}) as unknown as Tree;
    const now = Date.now();
    for (const [path, value] of Object.entries(patch)) {
      const parts = path.split('/');
      const last = parts.pop() as string;
      let node = room;
      for (const part of parts) node = (node[part] ??= {}) as Tree;
      node[last] = resolveTimes(value, now);
    }
    writeRoom(code, room as unknown as RoomData);
  }
  watch(code: string, listener: (room: RoomData | null) => void): () => void {
    const handler = (changed: string): void => {
      if (changed === code) listener(readRoom(code));
    };
    listeners.add(handler);
    queueMicrotask(() => listener(readRoom(code)));
    return () => listeners.delete(handler);
  }
  async markPresent(code: string, seat: Seat): Promise<void> {
    await this.update(code, { [`presence/${seat}`]: true });
  }
  async remove(code: string): Promise<void> {
    writeRoom(code, null);
  }
  async listRooms(): Promise<Record<string, RoomData>> {
    const rooms: Record<string, RoomData> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i) ?? '';
      if (!name.startsWith('e2e-room-')) continue;
      const code = name.slice('e2e-room-'.length);
      const room = readRoom(code);
      if (room) rooms[code] = room;
    }
    return rooms;
  }
  serverOffset(): number {
    return 0;
  }
}
