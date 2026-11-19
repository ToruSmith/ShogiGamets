# AGENTS.md

給在這個儲存庫工作的 AI 工程師（Claude、Codex、Cursor、Gemini 等）與人類維護者的規則。
`CLAUDE.md` 只是引用這個檔案，規則以這裡為準。

## 先讀什麼

1. 這個檔案：規則、不變式、不能做的事。
2. [`docs/architecture.md`](docs/architecture.md)：設計理由與「常見的修改」。部署與 Firebase 操作見 [`docs/deployment.md`](docs/deployment.md)。
3. 要動到的那一層的程式；每個檔案開頭的註解說明了它負責什麼。

文件分工：`README.md` 給開發者與部署者，`docs/player-guide.md` 給玩家，`SECURITY.md` 是安全設計與回報方式，
`THIRD_PARTY_NOTICES.md` 是第三方授權。改了玩家看得到的行為，要同步更新玩家指南。

## 專案

將棋 PWA：對電腦、雙人同機、線上對戰、詰將棋、復盤與賽後分析、KIF／SFEN 匯入匯出、駒落ち。
正式網址 <https://shtoruogigamets.pages.dev/>（Cloudflare Pages 專案名稱是 `shtoruogigamets`）。

- **獨立專案**：不與其他棋類專案共用程式碼、Firebase 專案或部署設定。手談棋館（QiguanGamets）只放連結。
- 預設語言是繁體中文，介面文字一律走 `src/i18n/`，`zh-TW.ts` 與 `en.ts` 都要加。
- 程式碼沒有採用開源授權，著作權由作者保留。新增依賴或素材時，同步更新 `THIRD_PARTY_NOTICES.md`。

## 技術

React 19、Vite、TypeScript（strict）、Tailwind CSS 4、shadcn/ui（只用在外圍介面）、Firebase Realtime Database + 匿名登入、Cloudflare Pages。Node 22（`.nvmrc`）。

## 指令

| 指令                                           | 用途                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| `npm run dev`                                  | 開發伺服器（<http://localhost:5173/>）                              |
| `npm run check`                                | typecheck + format:check + test + build                             |
| `npm test`                                     | 單元測試（node:test + tsx）                                         |
| `npm run test:e2e`                             | Playwright 端對端測試（第一次要 `npx playwright install chromium`） |
| `npm run smoke -- <網址> [--online] [--write]` | 部署後驗收                                                          |
| `npm run generate:tsume`                       | 重新產生詰將棋題庫（`src/core/tsume-data.ts`，不要手動編輯）        |
| `npm run format`                               | Prettier 排版，不手動調整                                           |

改完程式後 `npm run check` 與 `npm run test:e2e` 都要通過。CI（`.github/workflows/ci.yml`）在每次推送都會跑；
`health.yml` 每週檢查正式網站、Firebase 連線與安全公告。

## 分層

```
views/ board/ components/  ──▶  state/  ──▶  core/
                                  │           ▲
                                  ├──▶ ai/ ───┤
                                  └──▶ online/┘
```

- `core/` 是純邏輯，不碰 DOM、網路或儲存。規則有疑問就看這裡。
- `ai/` 只依賴 `core/`；Worker 內講 USI 協定，主執行緒的 `UsiEngine` 也只認 USI。
- `online/session.ts` 只認得 `RoomBackend` 介面；Firebase 只在 `online/firebase-backend.ts`。
- 畫面只透過 `useStore(controller.store)` 讀狀態、呼叫 `play`／`resign`／`undo`，不直接改棋局。
- 儲存只經過 `platform/storage.ts`。
- 相對 import 一律寫副檔名（`./game.ts`）；shadcn 元件用 `@/` 別名。
- `.prettierignore` 列出的 `core/position.ts`、`game.ts`、`move.ts`、`notation.ts`、`types.ts` 維持原排版，修改時不要整檔重排。
- 不使用 `dangerouslySetInnerHTML`；名字等資料來自資料庫，一律當文字顯示。

## 不變式

- 一盤棋完全由起始 SFEN 與 `moves` 決定；持時間也由每手耗時重演（`core/clock.ts`）。
- 走法表在 `core/position.ts` 與 `ai/movegen.ts` 各有一份，`tests/engine.test.ts` 會比對，改一邊要改另一邊。
- 線上：棋步只能附加，`moves/<i>` 與 `n` 同一次寫入，時間戳必須是伺服器時間（`t === now`）；勝負與超時不寫入資料庫，由重演得出。
- 駒落ち由上手（後手）先走，規則用 `n` 的奇偶與 `config/handicap` 判斷輪到誰。
- 改 `database.rules.json` 時，同時在 `tests/online.test.ts` 加上正反兩面的測試。規則要由維護者到 Firebase Console
  手動發布（`docs/deployment.md` 的 2-4），PR 說明裡要寫清楚「需要發布規則」以及先後順序。
  `tests/helpers/rules-db.ts` 只檢查寫入規則（`.read` 的查詢條件測不到），大改後要用 `npm run smoke -- <網址> --online --write` 或 Rules Playground 確認。

## 規則

- 已實作：二步、打步詰、行き所のない駒、千日手（同一局面第四次，和局）、連續王手千日手（將軍方負）。
- 入玉宣言採 CSA 27 點法（`core/declaration.ts`）：先手 28 點、後手 27 點，敵陣內玉以外 10 枚以上，玉在敵陣且未被將軍。
- 持將棋以提和處理：雙人同機當場同意，線上由雙方在同一手提和；對電腦沒有提和。

## 部署

推送到 `main` 由 Cloudflare Pages 建置（`npm run build`，輸出 `dist`）；其他分支產生預覽網址
（`https://<分支名稱>.shtoruogigamets.pages.dev/`，斜線換成 `-`；預覽版沒有設定 Firebase）。
Firebase 設定走 `VITE_FIREBASE_*` 環境變數。回應標頭在 `public/_headers`。
Service Worker 由 `vite.config.ts` 產生，快取名稱以 `shogi-` 開頭，清快取時只能動自己的前綴。

## 升級相依套件

升級後跑 `npm run check` 與 `npm run test:e2e`，再更新 `THIRD_PARTY_NOTICES.md` 的版本號。
升級 `firebase` 時，合併後到 Actions 手動執行一次 `Health`（會實際匿名登入並讀大廳）。

## 密鑰

不提交任何密鑰或 `.env.local`。Firebase 網頁設定只透過環境變數注入。

## 不做的事

註冊登入、跨遊戲戰績、自由輸入的聊天、廣告與追蹤程式。
