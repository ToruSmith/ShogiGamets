# CLAUDE.md

給在這個儲存庫工作的 Claude（與人類維護者）的規則。設計細節見 `docs/architecture.md`，部署手冊見 `docs/deployment.md`。

## 專案

將棋 PWA：對電腦、雙人同機、線上對戰、詰將棋、復盤與賽後分析、KIF／SFEN 匯入匯出、駒落ち。

- **獨立專案**：不與其他棋類專案共用程式碼、Firebase 專案或部署設定。
- 預設語言是繁體中文，介面文字一律走 `src/i18n/`，`zh-TW.ts` 與 `en.ts` 都要加。

## 技術

React 19、Vite、TypeScript（strict）、Tailwind CSS 4、shadcn/ui（只用在外圍介面）、Firebase Realtime Database + 匿名登入、Cloudflare Pages。Node 22（`.nvmrc`）。

## 指令

- `npm run dev`：開發伺服器（<http://localhost:5173/>）
- `npm run check`：typecheck + format:check + test + build
- `npm test`：單元測試（node:test + tsx）
- `npm run test:e2e`：Playwright 端對端測試（第一次要 `npx playwright install chromium`）
- `npm run smoke -- <網址> [--online] [--write]`：部署後驗收
- `npm run generate:tsume`：重新產生詰將棋題庫（`src/core/tsume-data.ts`，不要手動編輯）
- `npm run format`：Prettier 排版，不手動調整

改完程式後 `npm run check` 與 `npm run test:e2e` 都要通過。

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
- 相對 import 一律寫副檔名（`./game.ts`）；shadcn 元件用 `@/` 別名。
- `.prettierignore` 列出的 `core/position.ts`、`game.ts`、`move.ts`、`notation.ts`、`types.ts` 維持原排版，修改時不要整檔重排。

## 不變式

- 一盤棋完全由起始 SFEN 與 `moves` 決定；持時間也由每手耗時重演（`core/clock.ts`）。
- 走法表在 `core/position.ts` 與 `ai/movegen.ts` 各有一份，`tests/engine.test.ts` 會比對，改一邊要改另一邊。
- 線上：棋步只能附加，`moves/<i>` 與 `n` 同一次寫入，時間戳必須是伺服器時間（`t === now`）；勝負與超時不寫入資料庫，由重演得出。
- 駒落ち由上手（後手）先走，規則用 `n` 的奇偶與 `config/handicap` 判斷輪到誰。
- 改 `database.rules.json` 時，同時在 `tests/online.test.ts` 加上正反兩面的測試，並提醒維護者部署規則。
  `tests/helpers/rules-db.ts` 只檢查寫入規則（`.read` 的查詢條件測不到），大改後要用 `npm run smoke -- <網址> --online --write` 或 Rules Playground 確認。

## 規則

- 已實作：二步、打步詰、行き所のない駒、千日手（同一局面第四次，和局）、連續王手千日手（將軍方負）。
- 已知缺口：**沒有入玉宣言與持將棋**。`GameEnd` 的 `declaration`、i18n 與 KIF 輸出都預留了，但沒有任何流程會產生它，雙方都入玉時只能靠認輸或超時結束。

## 部署

推送到 `main` 由 Cloudflare Pages 建置（`npm run build`，輸出 `dist`）；其他分支產生預覽網址。Firebase 設定走 `VITE_FIREBASE_*` 環境變數。
Service Worker 由 `vite.config.ts` 產生，快取名稱以 `shogi-` 開頭，清快取時只能動自己的前綴。

## 密鑰

不提交任何密鑰或 `.env.local`。Firebase 網頁設定只透過環境變數注入。
