import fs from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

/**
 * 產生離線用的 Service Worker：把這次建置輸出的所有檔案列進預先快取清單，
 * 版本號用內容雜湊，部署新版時舊快取會被清掉。開發伺服器不註冊 SW。
 */
function serviceWorker(): Plugin {
  return {
    name: 'shogi-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const publicFiles = fs
        .readdirSync('public', { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name !== '_headers')
        .map((entry) =>
          path
            .relative('public', path.join(entry.parentPath, entry.name))
            .split(path.sep)
            .join('/'),
        );
      const files = [
        ...Object.keys(bundle).filter((name) => !name.endsWith('.map')),
        ...publicFiles,
      ];
      const assets = ['./', ...files.map((name) => `./${name}`)];
      const version = String(
        files.reduce(
          (hash, name) =>
            (Math.imul(hash, 31) + [...name].reduce((h, c) => h + c.charCodeAt(0), 0)) | 0,
          7,
        ),
      );
      const template = fs.readFileSync(path.resolve('src/pwa/sw.js'), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template
          .replace('__VERSION__', `${version}-${Date.now().toString(36)}`)
          .replace('__ASSETS__', JSON.stringify(assets)),
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), tailwindcss(), serviceWorker()],
  resolve: { alias: { '@': path.resolve('src') } },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    outDir: mode === 'e2e' ? 'dist-e2e' : 'dist',
    chunkSizeWarningLimit: 900,
  },
  preview: { port: 4173, strictPort: true },
}));
