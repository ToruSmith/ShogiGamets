# 架構說明

寫給之後要維護這個專案的人。

## 依賴方向

```
views/ board/ components/  ──▶  state/  ──▶  core/
                                  │           ▲
                                  ├──▶ ai/ ───┤
                                  └──▶ online/┘
```

- `core/` 是純邏輯，不碰 DOM、網路或儲存，Node 與瀏覽器都能跑。規則有疑問就看這裡。
- `ai/` 只依賴 `core/`，同時跑在 Worker 和測試裡。
- `online/session.ts` 只認得 `RoomBackend` 介面；Firebase、e2e 用的本機後端、測試用的規則資料庫都實作它。
- `state/` 把上面三者組成「一盤棋」：`LocalMatch`（對電腦、雙人同機）與 `OnlineMatch` 實作同一個
  `MatchController` 介面，對局畫面不分模式。
- 畫面只透過 `useStore(controller.store)` 讀狀態、呼叫 `play` / `resign` / `undo`，不直接改棋局。

## 一盤棋就是一串棋步

`Game` 的狀態完全由起始 SFEN 與 `moves` 決定。悔棋、復盤、接續上一盤、線上斷線重連都是重演同一串棋步。
持時間也一樣：`core/clock.ts` 的 `replayClock` 從每手耗時算出時鐘狀態。

## 棋盤元件

`board/ShogiBoard.tsx` 收一個 `Position` 和合法手清單，自己處理選取、拖曳與升變選擇，走好之後呼叫 `onMove`。

動畫靠「棋子身分」：`trackIdentity` 依上一個局面與最後一手，算出每格棋子的 id。同一個 id 的 `<g>`
在 React 裡不會重建，換了 `transform` 就由 CSS transition 滑過去；新的 id（打入）播放落下動畫，
升變的那一枚播放翻面動畫。跳到不相連的局面（悔棋、復盤跳手）時，位置沒變的棋子保留 id，其餘重新分配。

棋子漸層只定義一次（`Piece.tsx` 的 `KomaDefs`，放在 App 最外層），每枚棋子都引用它。

## AI

```
LocalMatch / analyzeGame ─▶ ShogiEngine 介面 ─▶ UsiEngine ─▶ Worker（USI 文字行）─▶ UsiSession ─▶ Engine
```

- `ai/types.ts`：與實作無關的 `ShogiEngine` 介面。
- `ai/usi-engine.ts`：任何 USI 引擎的主執行緒端。取消時直接終止 Worker（內建引擎是同步搜尋，收不到 `stop`），
  下次搜尋自動重建；`cancel()` 之前送出、還在排隊的搜尋也會一併作廢。
- `ai/usi.ts`、`ai/worker.ts`：內建引擎的 USI 外殼。
- `ai/engine.ts`：搜尋本體。搜尋路徑記在 `line` 堆疊上，時間到拋出例外時用它把局面還原。
- `ai/movegen.ts`：靜止搜尋用的吃子產生器。走法表和 `core/position.ts` 的相同，`tests/engine.test.ts` 會比對。
- 難度在 `ai/levels.ts`。調評估權重後請用自我對弈確認，直覺常常是錯的。

## 詰將棋

`core/mate.ts` 是深度限制的 AND/OR 搜尋加置換表。守方的合駒照實計算（不套用「無駄合」的例外），
所以「N 手詰」是嚴格的：不論守方怎麼應，攻方都能在 N 手內將死。

題庫由 `scripts/generate-tsume.ts` 產生：在角落或邊緣隨機擺出局面，留下「最短正好 N 手、第一手唯一、
開局時後手沒有被將軍」的題目。種子固定，重跑會得到同樣的題庫。

## 線上對戰

資料模型在 `online/types.ts`，規則在 `database.rules.json`。

- 開房：`createdAt` 為伺服器時間。第二位玩家入座時同時寫入 `startedAt`，第一手的耗時從這裡算。
- 走子：`moves/<i> = { i, m: 'USI', t: 伺服器時間 }` 與 `n = i + 1` 同一次寫入。規則依 `n` 的奇偶與手合
  （駒落ち由上手先走）判斷輪到誰。
- 超時：畫面每 250ms 用伺服器時間（`.info/serverTimeOffset`）檢查一次，雙方從同一份時間戳得到同樣的結論。
- 再戰：雙方都按下後，由先手方開新房（交換先後手）並寫入 `next`，另一方跟過去。
- 大廳：`listRooms('newest')` 讀最新 30 個房間，只列出公開、只有一人、還沒開始的房間。

## 常見的修改

**新增語言**：在 `src/i18n/` 複製 `en.ts`，加進 `i18n/index.ts` 的 `LOCALES` 與 `DICTIONARIES`。
少翻任何一個 key，TypeScript 都會報錯。

**新增持時間選項**：在 `state/presets.ts` 的 `TIME_PRESETS` 加一筆，再補上翻譯 `time.<id>`。

**新增駒落ち**：在 `core/handicap.ts` 加 SFEN 與 KIF 名稱，在 `database.rules.json` 的 `config/handicap`
允許清單加上 id，再補翻譯 `handicap.<id>`。

**裝飾字型缺字**：毛筆字與棋子字型都只含用到的字。要加字時編輯 `scripts/fetch-fonts.sh` 的字表後重新執行。

**換 Firebase 專案**：只要改環境變數 `VITE_FIREBASE_*`，並把 `database.rules.json` 部署到新專案。

**換成 YaneuraOu**：設定 `VITE_YANEURAOU_URL`，見 README。
