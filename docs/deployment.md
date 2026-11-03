# 部署手冊：GitHub、Firebase、Cloudflare Pages

照順序做，總共約 30 分鐘。每一步都寫了「要做什麼」和「為什麼」，最後有驗收與疑難排解。
各平台的選單名稱偶爾會改版，找不到時用頁面上的搜尋，或找意思相近的按鈕。

## 全貌：三個平台各管什麼

```
你推送程式 ──▶ GitHub ──┬──▶ GitHub Actions：跑測試（CI）
                        └──▶ Cloudflare Pages：npm run build，把 dist/ 發佈到 <專案>.pages.dev
                                     │
玩家的瀏覽器 ◀── 靜態檔案 ────────────┘
     │
     └── 只有線上對戰 ──▶ Firebase：匿名登入 + Realtime Database（房間與棋步）
```

- **GitHub**：存程式碼，每次推送跑 CI，也是 Cloudflare 取得程式的來源。
- **Cloudflare Pages**：建置並託管網站。這個 App 沒有自己的伺服器，全部是靜態檔案。
- **Firebase**：只給線上對戰用，負責「誰是誰」（匿名登入）和「房間裡發生了什麼」（資料庫）。
  單機、對電腦、詰將棋、復盤完全不會連到 Firebase。

建議順序：GitHub → Firebase → Cloudflare Pages → 驗收。Firebase 也可以放到最後：
沒有設定時網站照常運作，只有線上對戰顯示「尚未設定」。

---

## 一、GitHub

### 1-1 建立 `main` 並設為預設分支

目前儲存庫只有 `feature/core-rules` 和 `claude/shogi-game-development-pk7w2c`。後者是在前者之上往下做的，
包含全部歷史，所以直接從它建立 `main` 就好，不需要合併。

1. 打開 <https://github.com/ToruSmith/ShogiGamets/branches>，按 **New branch**。
2. 名稱填 `main`，來源（Source）選 `claude/shogi-game-development-pk7w2c`，建立。
3. 到 **Settings → General → Default branch**，按切換圖示，選 `main`，確認。

> 為什麼：Cloudflare Pages 需要一個「正式版分支」，推送到它才會更新正式網址；其他分支會變成預覽網址。
> 預設分支則決定別人打開儲存庫時看到哪一版、PR 預設要合併到哪裡。

也可以在本機用指令建立：

```bash
git fetch origin
```

```bash
git push origin origin/claude/shogi-game-development-pk7w2c:refs/heads/main
```

### 1-2 確認 CI

打開 **Actions** 分頁，`CI` 應該已經有綠色勾勾（這條分支的最近兩次推送都通過了）。
建立 `main` 之後，推送到 `main` 也會跑一次。

CI 做的事：`npm ci` → 型別檢查 → 排版檢查 → 120 個單元測試 → 建置 → 檢查 `sw.js` →
安裝 Chromium → 18 個端對端測試。失敗時會上傳 `test-results` 方便看截圖。

### 1-3（建議）保護 `main`

**Settings → Rules → Rulesets → New ruleset → New branch ruleset**：

- Target：`main`
- 勾 **Require a pull request before merging**（之後的修改都走 PR）
- 勾 **Require status checks to pass**，加入 `check`（CI 的工作名稱）
- 勾 **Block force pushes**

> 為什麼：Cloudflare 會在每次推送 `main` 時自動上線。加上規則後，測試沒過的程式不會被合併，也就不會上線。

GitHub 這邊**不需要設定任何 Secrets**：Firebase 設定填在 Cloudflare，CI 測試用的是本機模擬後端。

---

## 二、Firebase

### 2-1 建立專案

1. 打開 <https://console.firebase.google.com/>，**建立專案**（Create a project）。
2. 專案名稱例如 `shogigamets`。下面會出現專案 ID（例如 `shogigamets-1a2b3`），記下來，之後會用到。
3. Google Analytics 可以關掉，這個 App 用不到。

免費的 Spark 方案就夠用：Realtime Database 允許同時 100 個連線、1 GB 儲存、每月 10 GB 下載。
一盤棋只有幾 KB，同時 100 個連線約等於 50 盤同時進行的對局。

### 2-2 啟用匿名登入

**建構（Build）→ Authentication → 開始使用 → 登入方式（Sign-in method）→ 匿名（Anonymous）→ 啟用 → 儲存**。

> 為什麼：資料庫規則用 `auth.uid` 判斷「這一手是不是輪到你」「這個座位是不是你的」。
> 匿名登入讓每個玩家不用註冊就有一個穩定的 uid（存在瀏覽器裡，重新整理也一樣），
> 所以斷線重連能回到自己的座位。

接著在 **Authentication → 設定（Settings）→ 授權網域（Authorized domains）** 新增
`<你的 Pages 專案名稱>.pages.dev`（以及之後的自訂網域）。匿名登入本身不檢查這個清單，
但之後如果加入其他登入方式就需要，先加好比較不會忘。

### 2-3 建立 Realtime Database

1. **建構 → Realtime Database → 建立資料庫**。
2. 位置選 **新加坡（asia-southeast1）**，離台灣最近，延遲最低。
3. 安全規則先選 **鎖定模式**（下一步會換成這個專案的規則）。
4. 建立後，資料頁最上方會顯示資料庫網址，例如
   `https://shogigamets-1a2b3-default-rtdb.asia-southeast1.firebasedatabase.app`。記下來。

### 2-4 部署資料庫規則

規則在儲存庫的 `database.rules.json`。兩種方式擇一：

**方式 A：在網頁上貼上（最簡單）**

1. Realtime Database → **規則（Rules）** 分頁。
2. 把 `database.rules.json` 的內容全部貼上，取代原本的內容，按 **發布**。

**方式 B：用指令（之後改規則比較方便）**

```bash
npx firebase-tools login
```

```bash
npx firebase-tools deploy --only database --project <你的專案 ID>
```

> 為什麼規則這麼重要：Firebase 的網頁設定會出現在每個訪客的瀏覽器裡，任何人都能拿來直接讀寫資料庫。
> 真正擋住作弊的是規則：
>
> - 只有輪到的那一方能寫下一手，棋步只能附加、不能改寫，時間戳必須等於伺服器時間。
> - 資料庫裡沒有「勝負」欄位：勝負由雙方從棋步重演得出，沒辦法寫入「我贏了」。
> - 規則裡的 `.indexOn: ["createdAt"]` 讓大廳能依開房時間查詢。
>
> 規則沒部署時，線上對戰會出現 `PERMISSION_DENIED`。

### 2-5 註冊網頁應用程式，取得設定值

1. 左上角齒輪 → **專案設定 → 一般 → 你的應用程式 → 網頁（`</>` 圖示）**。
2. 暱稱隨意（例如 `shogi-web`），**不要**勾 Firebase Hosting（網站放在 Cloudflare）。
3. 畫面會顯示一段 `firebaseConfig`，對應到這些環境變數：

| `firebaseConfig` 欄位 | 環境變數                     | 範例                                                                          |
| --------------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| `apiKey`              | `VITE_FIREBASE_API_KEY`      | `AIzaSy...`                                                                   |
| `authDomain`          | `VITE_FIREBASE_AUTH_DOMAIN`  | `shogigamets-1a2b3.firebaseapp.com`                                           |
| `databaseURL`         | `VITE_FIREBASE_DATABASE_URL` | `https://shogigamets-1a2b3-default-rtdb.asia-southeast1.firebasedatabase.app` |
| `projectId`           | `VITE_FIREBASE_PROJECT_ID`   | `shogigamets-1a2b3`                                                           |
| `appId`               | `VITE_FIREBASE_APP_ID`       | `1:1234567890:web:abcdef...`                                                  |

`storageBucket`、`messagingSenderId` 用不到，可以不填。

> 如果設定裡沒有 `databaseURL`：先註冊應用程式、後建資料庫時常會這樣。直接用 2-3 記下的資料庫網址。
> 網址的地區一定要和資料庫一致，填成 `firebaseio.com` 的舊格式會連不上新加坡的資料庫。

### 2-6（選用）在本機試線上對戰

複製 `.env.example` 成 `.env.local`，填入上面的值，然後：

```bash
npm run dev
```

用兩個不同的瀏覽器（或一般視窗加無痕視窗）打開，一個開房、一個用代碼加入。
`.env.local` 已列在 `.gitignore`，不會被推上去。

### 2-7（選用）API 金鑰限制

Firebase 的 API 金鑰本來就是公開的，安全靠規則。若想再限制只能從你的網站使用：
Google Cloud Console → **API 和服務 → 憑證** → 找到這把金鑰 → **應用程式限制：HTTP 參照網址**，
加入 `https://<專案>.pages.dev/*`、`https://*.<專案>.pages.dev/*`（預覽網址）與自訂網域。
加錯會讓線上對戰登入失敗，所以建議先上線確認正常，再加限制。

---

## 三、Cloudflare Pages

### 3-1 建立 Pages 專案並連接 GitHub

1. 打開 <https://dash.cloudflare.com/> → **Workers 和 Pages（Workers & Pages）→ 建立（Create）**。
2. 選 **Pages** 分頁 → **匯入現有的 Git 存放庫（Import an existing Git repository）**。
   （若畫面預設在 Workers，找「要部署 Pages？」之類的連結切過去。）
3. 第一次會要求連接 GitHub 帳號並安裝 Cloudflare 的 GitHub App：建議選
   **Only select repositories**，只勾 `ShogiGamets`。
4. 選擇 `ToruSmith/ShogiGamets`，按 **開始設定**。

### 3-2 建置設定

| 欄位                  | 值                                                   |
| --------------------- | ---------------------------------------------------- |
| 專案名稱              | 例如 `shogigamets`，網址會是 `shogigamets.pages.dev` |
| 正式版分支            | `main`                                               |
| 框架預設（Framework） | `None`（選 `React (Vite)` 也可以，值相同）           |
| 建置指令              | `npm run build`                                      |
| 建置輸出目錄          | `dist`                                               |
| 根目錄                | 留空                                                 |

展開 **環境變數（Environment variables）**，加入 2-5 的五個 `VITE_FIREBASE_*`。
可以順便加 `NODE_VERSION` = `22`（Cloudflare 會讀 `.nvmrc`，這只是保險）。

按 **儲存並部署**。第一次建置約 1～2 分鐘，完成後會給你 `https://<專案>.pages.dev`。

> 為什麼環境變數填在這裡：Vite 會在**建置時**把 `import.meta.env.VITE_*` 直接寫進 JavaScript。
> 所以：
>
> - 變數要在建置前設好；**改了變數之後必須重新部署**才會生效
>   （**部署（Deployments）→ 最新一次 → 重試部署（Retry deployment）**）。
> - 這些值最後會出現在公開的 JS 裡。這對 Firebase 網頁設定沒問題，但**不要**把真正的祕密
>   （例如管理員金鑰）放進 `VITE_` 開頭的變數。

### 3-3 正式版與預覽

- 推送到 `main` → 更新正式網址。
- 推送到其他分支 → 產生預覽網址，例如 `https://<雜湊>.<專案>.pages.dev`，可以先看效果再合併。
- **環境變數分「正式版」和「預覽」兩組**，在 **設定 → 變數和祕密** 切換。
  預覽也想測線上對戰，兩組都要填；如果怕預覽版和正式版共用同一個資料庫，可以另建一個 Firebase 專案給預覽用。

### 3-4 這個專案已經幫你處理好的

- **不需要轉址設定**：路由用網址雜湊（`#/play`、`#/r/ABC234`），伺服器永遠只送 `index.html`。
- **快取標頭**：`public/_headers` 讓 `index.html` 與 `sw.js` 每次都向伺服器確認（部署新版能馬上拿到），
  `assets/` 裡帶雜湊的檔案快取一年。這份設定已經用 Cloudflare 官方的 `wrangler pages dev` 在本機驗證過。
- **離線**：`sw.js` 在建置時產生，列出這次所有檔案。玩家第一次開啟後，之後離線也能玩（線上對戰除外）。

### 3-5（選用）自訂網域

Pages 專案 → **自訂網域（Custom domains）→ 設定自訂網域**，輸入例如 `shogi.example.com`。
網域在 Cloudflare 管理時會自動加 DNS 記錄；不在的話照畫面指示加一筆 CNAME 指向 `<專案>.pages.dev`。
加好之後記得回 Firebase 的授權網域（2-2）與 API 金鑰限制（2-7）補上這個網域。

---

## 四、驗收

在本機的儲存庫目錄執行（第一次需要安裝瀏覽器）：

```bash
npm ci
```

```bash
npx playwright install chromium
```

```bash
npm run smoke -- https://<專案>.pages.dev --online --write
```

| 旗標       | 檢查內容                                                                             |
| ---------- | ------------------------------------------------------------------------------------ |
| （不加）   | 首頁、`_headers`、manifest 與圖示、Service Worker、斷網後重新整理                    |
| `--online` | Firebase 一定要有設定，並能匿名登入、讀取大廳                                        |
| `--write`  | 真的開一間**不公開**的房間再離開（房間會被刪除），確認規則允許寫入。會寫進你的資料庫 |

全部是 `✓` 就完成了。再用兩支手機（或手機加電腦）實際下一盤線上對戰確認。

### 疑難排解

| 現象                                                         | 原因與處理                                                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 線上對戰顯示「尚未設定」                                     | 建置時沒有 `VITE_FIREBASE_*`。確認變數填在正確的環境（正式版／預覽），然後**重新部署**。               |
| `auth/api-key-not-valid`                                     | API 金鑰填錯或多了空白。                                                                               |
| `auth/operation-not-allowed` 或 `admin-restricted-operation` | 匿名登入沒有啟用（2-2）。                                                                              |
| `auth/requests-from-referer-...-are-blocked`                 | API 金鑰的網址限制沒有包含目前網域（2-7）。                                                            |
| `PERMISSION_DENIED`                                          | 資料庫規則沒有發布（2-4），或還是預設的鎖定規則。                                                      |
| 大廳一直「載入中」                                           | `databaseURL` 地區不對，或網路擋了 `firebasedatabase.app`。用 2-3 的網址。                             |
| Cloudflare 建置失敗                                          | 看建置記錄。常見是建置指令或輸出目錄填錯；Node 版本可用 `NODE_VERSION=22` 指定。                       |
| 部署後還看到舊版                                             | 頁面走網路優先，重新整理一次就是新版。仍是舊版時，確認 `sw.js` 的回應標頭是 `no-cache`（驗收會檢查）。 |
| 驗收顯示 `_headers` 沒生效                                   | 確認 `dist/_headers` 有產生（`public/` 的檔案會原樣複製），並且網址打的是 Pages 網域。                 |

---

## 之後的日常

- **改程式**：開分支 → 推送（CI 跑測試、Cloudflare 產生預覽網址）→ 開 PR → 合併到 `main` 自動上線。
- **改資料庫規則**：改 `database.rules.json`，先跑 `npm test`（`tests/online.test.ts` 會用新規則逐條驗證），
  再用 2-4 的方式發布。規則和程式要一起相容：先發布能同時接受新舊版本的規則，再部署程式。
- **換 Firebase 專案**：只要改 Cloudflare 的環境變數並重新部署，再把規則發布到新專案。
- **回到舊版**：Cloudflare Pages → 部署 → 找到舊的那次 → **回復（Rollback）**，幾秒內生效。
- **用量**：Firebase Console → Realtime Database → **使用量**；接近 100 個同時連線時再考慮升級 Blaze 方案。
