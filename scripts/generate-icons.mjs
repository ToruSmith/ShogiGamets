/**
 * 產生 PWA 圖示：node scripts/generate-icons.mjs
 * 以 public/icons/icon.svg 為底，用 Playwright 的 Chromium 輸出 PNG（字型取自棋子字型子集）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const font = fs
  .readFileSync(path.join(root, 'src/assets/fonts/piece-mincho.woff2'))
  .toString('base64');

const svg = (maskable) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="w" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="#f7e3ae"/><stop offset="0.55" stop-color="#ecc983"/><stop offset="1" stop-color="#d4a55a"/>
    </linearGradient>
    <style>@font-face{font-family:K;src:url(data:font/woff2;base64,${font})}</style>
  </defs>
  <rect width="512" height="512" rx="${maskable ? 0 : 96}" fill="#1b2233"/>
  <g transform="translate(256 270) scale(${maskable ? 0.72 : 0.9})">
    <path d="M0 -210 L150 -140 L190 200 L-190 200 L-150 -140 Z" transform="translate(10 16)" fill="#000" opacity="0.35"/>
    <path d="M0 -210 L150 -140 L190 200 L-190 200 L-150 -140 Z" fill="url(#w)" stroke="#8a6331" stroke-width="6" stroke-linejoin="round"/>
    <text x="0" y="95" text-anchor="middle" font-family="K" font-weight="800" font-size="250" fill="#1d140b">将</text>
  </g>
</svg>`;

const out = path.join(root, 'public/icons');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon.svg'), svg(false));
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable.png', 512, true],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg(maskable).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(out, name), omitBackground: true });
}
await browser.close();
