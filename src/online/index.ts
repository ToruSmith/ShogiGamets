import { firebaseConfigured } from './firebase-config.ts';
import type { RoomBackend } from './types.ts';

const mode = (import.meta as unknown as { env?: { MODE?: string } }).env?.MODE;
const useLocal = mode === 'e2e';

/** 這個版本能不能線上對戰（沒有設定 Firebase 時不行） */
export const onlineAvailable: boolean = useLocal || firebaseConfigured;

let backend: Promise<RoomBackend> | null = null;

export function roomBackend(): Promise<RoomBackend> {
  backend ??= useLocal
    ? import('./local-backend.ts').then(({ LocalBackend }) => new LocalBackend())
    : import('./firebase-backend.ts').then(({ FirebaseBackend }) => new FirebaseBackend());
  return backend;
}
