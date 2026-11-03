import { defineConfig } from 'playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}/`, locale: 'zh-TW' },
  webServer: {
    // e2e 版用本機後端模擬 Firebase，兩個分頁可以真的線上對戰
    command: `npm run build:e2e && npx vite preview --mode e2e --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
