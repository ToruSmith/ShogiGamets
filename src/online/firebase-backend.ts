import type { Database } from 'firebase/database';
import { firebaseConfig } from './firebase-config.ts';
import type { Patch, RoomBackend, RoomData, Seat } from './types.ts';

type DatabaseModule = typeof import('firebase/database');

/**
 * Firebase SDK 只在進入線上對戰時才以動態 import 載入（Vite 會切成獨立的檔案），
 * 單機、AI 與詰將棋完全不需要網路，首頁也不必背著 Firebase 的體積。
 */
export class FirebaseBackend implements RoomBackend {
  private sdk: DatabaseModule | null = null;
  private db: Database | null = null;
  private uid: string | null = null;
  private offset = 0;

  async signIn(): Promise<string> {
    if (this.uid) return this.uid;
    const [{ initializeApp, getApps }, sdk, { getAuth, signInAnonymously }] = await Promise.all([
      import('firebase/app'),
      import('firebase/database'),
      import('firebase/auth'),
    ]);
    const app = getApps()[0] ?? initializeApp(firebaseConfig);
    this.sdk = sdk;
    this.db = sdk.getDatabase(app);
    sdk.onValue(sdk.ref(this.db, '.info/serverTimeOffset'), (snapshot) => {
      this.offset = Number(snapshot.val()) || 0;
    });
    const credential = await signInAnonymously(getAuth(app));
    this.uid = credential.user.uid;
    return this.uid;
  }

  private get api(): { sdk: DatabaseModule; db: Database } {
    if (!this.sdk || !this.db) throw new Error('尚未登入');
    return { sdk: this.sdk, db: this.db };
  }

  private target(path: string) {
    const { sdk, db } = this.api;
    return sdk.ref(db, path);
  }

  async read(code: string): Promise<RoomData | null> {
    const snapshot = await this.api.sdk.get(this.target(`rooms/${code}`));
    return snapshot.exists() ? (snapshot.val() as RoomData) : null;
  }

  create(code: string, room: Patch): Promise<void> {
    return this.api.sdk.set(this.target(`rooms/${code}`), room);
  }

  update(code: string, patch: Patch): Promise<void> {
    return this.api.sdk.update(this.target(`rooms/${code}`), patch);
  }

  watch(code: string, listener: (room: RoomData | null) => void): () => void {
    return this.api.sdk.onValue(this.target(`rooms/${code}`), (snapshot) =>
      listener(snapshot.exists() ? (snapshot.val() as RoomData) : null),
    );
  }

  async markPresent(code: string, seat: Seat): Promise<void> {
    const { sdk } = this.api;
    const target = this.target(`rooms/${code}/presence/${seat}`);
    await sdk.onDisconnect(target).set(false);
    await sdk.set(target, true);
  }

  remove(code: string): Promise<void> {
    return this.api.sdk.remove(this.target(`rooms/${code}`));
  }

  async listRooms(which: 'newest' | 'oldest'): Promise<Record<string, RoomData>> {
    const { sdk } = this.api;
    const limit = which === 'newest' ? sdk.limitToLast(30) : sdk.limitToFirst(10);
    const query = sdk.query(this.target('rooms'), sdk.orderByChild('createdAt'), limit);
    const snapshot = await sdk.get(query);
    return (snapshot.val() as Record<string, RoomData> | null) ?? {};
  }

  serverOffset(): number {
    return this.offset;
  }
}
