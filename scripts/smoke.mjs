/**
 * 部署後的驗收：npm run smoke -- https://<專案>.pages.dev [--online] [--write]
 *
 *   不加參數：檢查頁面、標頭、manifest、Service Worker 與離線
 *   --online：Firebase 一定要設定好，並能匿名登入、讀大廳（沒設定就算失敗）
 *   --write ：另外真的開一間私人房間再刪掉，確認資料庫規則允許寫入（會寫進你的資料庫）
 *
 * 需要 Playwright 的 Chromium：npx playwright install chromium
 */
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const target = args.find((arg) => !arg.startsWith('--'));
const requireOnline = args.includes('--online') || args.includes('--write');
const write = args.includes('--write');
if (!target) {
  console.error('用法：npm run smoke -- https://<專案>.pages.dev [--online] [--write]');
  process.exit(2);
}
const base = new URL(target.endsWith('/') ? target : `${target}/`);

const results = [];
const pass = (name, detail = '') => results.push({ ok: true, name, detail });
const fail = (name, detail = '') => results.push({ ok: false, name, detail });
const warn = (name, detail = '') => results.push({ ok: null, name, detail });
const check = (condition, name, detail) => (condition ? pass(name, detail) : fail(name, detail));

/* ── 1. HTTP：頁面、標頭、manifest ── */
const home = await fetch(base, { redirect: 'follow' });
const html = await home.text();
check(home.ok && html.includes('id="root"'), '首頁回應 200', `HTTP ${home.status}`);
check(
  /no-cache/.test(home.headers.get('cache-control') ?? ''),
  '首頁不被快取（_headers）',
  home.headers.get('cache-control') ?? '沒有 Cache-Control',
);
check(home.headers.get('x-content-type-options') === 'nosniff', '安全標頭（_headers）');

const sw = await fetch(new URL('sw.js', base));
const swText = await sw.text();
check(sw.ok && swText.includes('caches.open'), 'sw.js 存在', `HTTP ${sw.status}`);
check(
  /no-cache/.test(sw.headers.get('cache-control') ?? ''),
  'sw.js 不被快取（_headers）',
  sw.headers.get('cache-control') ?? '沒有 Cache-Control',
);

const script = /src="\.?\/?(assets\/[^"]+\.js)"/.exec(html)?.[1];
if (script) {
  const asset = await fetch(new URL(script, base));
  check(
    asset.ok && /immutable/.test(asset.headers.get('cache-control') ?? ''),
    '資源長期快取（_headers）',
    asset.headers.get('cache-control') ?? '沒有 Cache-Control',
  );
} else fail('找到主程式檔', 'index.html 裡沒有 assets/*.js');

const manifest = await fetch(new URL('manifest.webmanifest', base));
let icons = [];
try {
  icons = (await manifest.json()).icons ?? [];
  pass('manifest 可讀', `${icons.length} 個圖示`);
} catch {
  fail('manifest 可讀', `HTTP ${manifest.status}`);
}
for (const icon of icons) {
  const response = await fetch(new URL(icon.src, base));
  check(response.ok, `圖示 ${icon.src}`, `HTTP ${response.status}`);
}

/* ── 2. 瀏覽器：畫面、Service Worker、離線、線上 ── */
// 在代理後面執行時（例如公司網路），讓瀏覽器也走 HTTPS_PROXY；Node 的 fetch 則用 NODE_USE_ENV_PROXY=1
const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
const proxy = proxyUrl
  ? (() => {
      const url = new URL(proxyUrl);
      return {
        server: `${url.protocol}//${url.host}`,
        ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
        ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
      };
    })()
  : undefined;
const browser = await chromium.launch(proxy ? { proxy } : {});
const context = await browser.newContext({ locale: 'zh-TW' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));

try {
  await page.goto(base.href);
  await page.getByTestId('mode-ai').waitFor({ timeout: 15_000 });
  pass('大廳畫面顯示');

  const active = await page.evaluate(async () => {
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => setTimeout(() => resolve(null), 15_000)),
    ]);
    return Boolean(registration?.active);
  });
  check(active, 'Service Worker 已啟用');

  if (active) {
    await page.reload();
    await page.evaluate(async () => navigator.serviceWorker.ready);
    await context.setOffline(true);
    await page.reload();
    await page.getByTestId('mode-tsume').click({ timeout: 10_000 });
    await page.getByTestId('tsume-1').waitFor({ timeout: 10_000 });
    pass('離線時可以重新整理並進入詰將棋');
    await context.setOffline(false);
  }

  await page.goto(new URL('#/online', base).href);
  const unavailable = page.getByTestId('online-unavailable');
  const configured = page.getByTestId('online-name');
  await Promise.race([
    unavailable.waitFor({ timeout: 15_000 }),
    configured.waitFor({ timeout: 15_000 }),
  ]);
  if (await unavailable.isVisible()) {
    (requireOnline ? fail : warn)(
      'Firebase 已設定',
      '這次建置沒有 VITE_FIREBASE_*；設定後要重新部署',
    );
  } else {
    pass('Firebase 已設定');
    const lobby = page.getByTestId('lobby').or(page.getByText('目前沒有等待對手的房間'));
    const problem = page.getByRole('alert');
    await Promise.race([
      lobby.waitFor({ timeout: 20_000 }),
      problem.waitFor({ timeout: 20_000 }),
    ]).catch(() => undefined);
    if (await problem.isVisible()) {
      fail('匿名登入並讀取大廳', (await problem.textContent()) ?? '');
    } else {
      check(
        await lobby.isVisible(),
        '匿名登入並讀取大廳',
        '確認已啟用匿名登入、已部署 database.rules.json',
      );
    }

    if (write) {
      await page.getByTestId('online-name').fill('smoke-test');
      await page.locator('#online-public').click(); // 不公開到大廳
      await page.getByTestId('create-room').click();
      const code = page.getByTestId('room-code');
      await code.waitFor({ timeout: 20_000 }).catch(() => undefined);
      const text = (await code.textContent().catch(() => null))?.trim();
      check(
        Boolean(text && /^[A-HJ-NP-Z2-9]{6}$/.test(text)),
        '開房間（資料庫規則允許寫入）',
        text ?? '沒有出現房間代碼',
      );
      // 離開還沒有對手的房間會刪掉它
      await page.goto(base.href);
      await page.waitForTimeout(1500);
    }
  }
} catch (error) {
  fail('瀏覽器檢查', String(error).split('\n')[0]);
} finally {
  await browser.close();
}

const relevant = errors.filter((text) => !/ERR_INTERNET_DISCONNECTED|net::ERR_FAILED/.test(text));
check(relevant.length === 0, '瀏覽器沒有錯誤訊息', relevant.slice(0, 3).join(' | '));

/* ── 報告 ── */
for (const { ok, name, detail } of results) {
  const mark = ok === true ? '✓' : ok === false ? '✗' : '!';
  console.log(`${mark} ${name}${detail ? `  (${detail})` : ''}`);
}
const failed = results.filter((result) => result.ok === false).length;
console.log(failed ? `\n${failed} 項失敗` : '\n全部通過');
process.exit(failed ? 1 : 0);
