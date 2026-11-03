/// <reference lib="webworker" />
import { UsiSession } from './usi.ts';

// 內建引擎的 Worker：收發的都是 USI 文字行，和 YaneuraOu 的 Worker 一樣
const session = new UsiSession((line) => postMessage(line));
addEventListener('message', (event: MessageEvent<string>) => {
  for (const line of String(event.data).split('\n')) if (line.trim()) session.handle(line);
});
