import type { ShogiEngine } from './types.ts';
import type { UsiTransport } from './usi-engine.ts';
import { UsiEngine } from './usi-engine.ts';
import { UsiSession } from './usi.ts';

/** 把 Web Worker 包成 USI 通道。Worker 收送的是字串，一則訊息一行或多行。 */
export function workerTransport(create: () => Worker): UsiTransport {
  const worker = create();
  return {
    send: (line) => worker.postMessage(line),
    onLine: (listener) => {
      worker.onmessage = (event: MessageEvent<unknown>) => {
        for (const line of String(event.data).split('\n')) if (line) listener(line);
      };
    },
    terminate: () => worker.terminate(),
  };
}

/** 同一執行緒內的通道：測試，或瀏覽器不允許 Worker 時的備援 */
export function inlineTransport(): UsiTransport {
  let listener: (line: string) => void = () => undefined;
  let alive = true;
  const session = new UsiSession((line) => {
    if (alive) listener(line);
  });
  return {
    send: (line) =>
      // 非同步執行，讓畫面先更新
      setTimeout(() => {
        if (alive) session.handle(line);
      }, 0),
    onLine: (next) => (listener = next),
    terminate: () => {
      alive = false;
    },
  };
}

export type EngineKind = 'builtin' | 'yaneuraou';

/** YaneuraOu 的 Worker 腳本網址（USI over postMessage）。未設定時不提供此選項。 */
const YANEURAOU_URL: string | undefined = (
  import.meta as unknown as { env?: Record<string, string | undefined> }
).env?.VITE_YANEURAOU_URL;

export const availableEngines = (): EngineKind[] =>
  YANEURAOU_URL ? ['builtin', 'yaneuraou'] : ['builtin'];

export function createEngine(kind: EngineKind = 'builtin'): ShogiEngine {
  if (kind === 'yaneuraou' && YANEURAOU_URL) {
    const url = YANEURAOU_URL;
    return new UsiEngine('YaneuraOu', () => workerTransport(() => new Worker(url)));
  }
  return new UsiEngine('Builtin', () => {
    if (typeof Worker === 'undefined') return inlineTransport();
    try {
      return workerTransport(
        () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
      );
    } catch {
      return inlineTransport();
    }
  });
}
