/** localStorage 包一層：私密模式或被封鎖時不讓程式壞掉 */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? ({ ...fallbackObject(fallback), ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function fallbackObject<T>(value: T): object {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function loadRaw<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 空間不足或被封鎖：放棄儲存，不影響遊戲
  }
}
