/**
 * 與引擎實作無關的介面。UI 與賽後分析只依賴這裡，
 * 內建引擎（ai/worker.ts）和 YaneuraOu 都透過 UsiEngine 接上來。
 */
export interface EngineInfo {
  depth: number;
  /** 走子方角度的分數（centipawn）；詰み時為 null */
  scoreCp: number | null;
  /** 幾手詰：正數代表走子方能詰，負數代表被詰 */
  mate: number | null;
  nodes: number;
  /** USI 寫法的預想手順 */
  pv: string[];
}

export interface EngineSearch {
  /** 起始局面 SFEN 與之後的棋步（USI 寫法） */
  sfen: string;
  moves: string[];
  movetimeMs?: number;
  depth?: number;
  /** 0～20，USI 的 SkillLevel 選項（YaneuraOu 也支援） */
  skill?: number;
}

export interface EngineResult {
  /** USI 棋步，或 'resign'（無棋可走）、'win'（宣言勝） */
  bestMove: string;
  info: EngineInfo | null;
}

export interface ShogiEngine {
  readonly name: string;
  search(request: EngineSearch, onInfo?: (info: EngineInfo) => void): Promise<EngineResult>;
  /** 中止進行中的搜尋；等待中的 Promise 以 CancelledError 結束 */
  cancel(): void;
  dispose(): void;
}

export class CancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'CancelledError';
  }
}
