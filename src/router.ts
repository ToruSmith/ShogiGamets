import { useSyncExternalStore } from 'react';

/** 雜湊路由：#/play、#/r/ABC234。部署在任何路徑下都不需要伺服器設定。 */
function current(): string[] {
  return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
}

let cache = current();
let cacheKey = location.hash;

function subscribe(listener: () => void): () => void {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

function snapshot(): string[] {
  if (location.hash !== cacheKey) {
    cacheKey = location.hash;
    cache = current();
  }
  return cache;
}

export function useRoute(): string[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function navigate(path: string): void {
  const hash = `#/${path.replace(/^\//, '')}`;
  if (location.hash === hash) return;
  location.hash = hash;
}

export function goBack(fallback = ''): void {
  if (history.length > 1) history.back();
  else navigate(fallback);
}
