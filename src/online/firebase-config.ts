/**
 * Firebase 網頁設定，建置時從環境變數讀入（Cloudflare Pages 的「環境變數」或本機 .env）。
 * 這些值會出現在每個訪客的瀏覽器裡，本來就不是祕密；資料安全由 database.rules.json 把關。
 * 沒有設定時，線上對戰會顯示「尚未設定」，其他模式不受影響。
 */
type Env = Record<string, string | undefined>;
const env: Env = (import.meta as unknown as { env?: Env }).env ?? {};

const entries = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

/** 只保留有設定的欄位 */
export const firebaseConfig: Record<string, string> = Object.fromEntries(
  Object.entries(entries).filter((entry): entry is [string, string] => Boolean(entry[1])),
);

export const firebaseConfigured = Boolean(entries.apiKey && entries.databaseURL);
