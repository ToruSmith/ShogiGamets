import type { Move } from './move.ts';
import { isDrop, moveTo } from './move.ts';
import type { Position } from './position.ts';
import { EMPTY } from './types.ts';

/**
 * 詰將棋求解：攻方每手都必須將軍，守方選最能拖延的應手。
 * 守方的合駒照實計算（不套用「無駄合」的例外），所以「N 手詰」是嚴格意義的：
 * 不論守方怎麼應，攻方都能在 N 手內將死。
 *
 * 用深度限制的 AND/OR 搜尋加上置換表；詰將棋題目都很短，這樣就夠快。
 */
export class MateSolver {
  /** key = 局面雜湊:剩餘手數，值 = 是否能詰 */
  private readonly table = new Map<string, boolean>();
  nodes = 0;

  constructor(
    private readonly position: Position,
    private readonly nodeLimit = 2_000_000,
  ) {}

  private key(depth: number): string {
    return `${this.position.repetitionKey}:${depth}`;
  }

  /** 走子方能將軍的合法手 */
  checks(): Move[] {
    const position = this.position;
    return position.legalMoves().filter((move) => {
      position.make(move);
      const check = position.inCheck();
      position.unmake();
      return check;
    });
  }

  /** 攻方在 depth 手（奇數）內能詰嗎？回傳一個成功的著手 */
  attack(depth: number): Move | null {
    if (depth <= 0) return null;
    const key = this.key(depth);
    const known = this.table.get(key);
    if (known === false) return null;
    for (const move of this.checks()) {
      if (++this.nodes > this.nodeLimit) throw new MateSearchAborted();
      this.position.make(move);
      const mated = this.defend(depth - 1);
      this.position.unmake();
      if (mated) {
        this.table.set(key, true);
        return move;
      }
    }
    this.table.set(key, false);
    return null;
  }

  /** 守方不論怎麼走，攻方都能在 depth 手內詰嗎？ */
  defend(depth: number): boolean {
    const key = this.key(depth);
    const known = this.table.get(key);
    if (known !== undefined) return known;
    const replies = this.position.legalMoves();
    let mated = true;
    if (replies.length > 0) {
      if (depth <= 0) mated = false;
      else {
        for (const reply of orderDefences(this.position, replies)) {
          if (++this.nodes > this.nodeLimit) throw new MateSearchAborted();
          this.position.make(reply);
          const ok = this.attack(depth - 1) !== null;
          this.position.unmake();
          if (!ok) {
            mated = false;
            break;
          }
        }
      }
    }
    this.table.set(key, mated);
    return mated;
  }

  /** 最短詰手數；maxDepth 內詰不到回傳 null */
  shortestMate(maxDepth: number): number | null {
    for (let depth = 1; depth <= maxDepth; depth += 2) {
      if (this.attack(depth) !== null) return depth;
    }
    return null;
  }

  /** 守方走完後（輪到攻方），最短還要幾手才詰 */
  remainingAfterDefence(maxDepth: number): number | null {
    for (let depth = 1; depth <= maxDepth; depth += 2) {
      if (this.attack(depth) !== null) return depth;
    }
    return null;
  }

  /** 所有能在 depth 手內詰的攻方著手（判斷玩家的著手是否正解用） */
  winningAttacks(depth: number): Move[] {
    return this.checks().filter((move) => {
      this.position.make(move);
      const ok = this.defend(depth - 1);
      this.position.unmake();
      return ok;
    });
  }

  /**
   * 守方最頑強的應手：讓剩餘詰手數最長；同樣長時優先不合駒（不打入）、再優先吃子。
   * 在攻方剛走完的局面呼叫。
   */
  bestDefence(maxDepth: number): Move | null {
    const position = this.position;
    let best: Move | null = null;
    let bestScore = -Infinity;
    for (const reply of position.legalMoves()) {
      position.make(reply);
      const length = this.remainingAfterDefence(maxDepth) ?? maxDepth + 2;
      position.unmake();
      const score =
        length * 4 + (isDrop(reply) ? 0 : 2) + (position.board[moveTo(reply)] !== EMPTY ? 1 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = reply;
      }
    }
    return best;
  }

  /** 主變化：攻方選最短詰的著手，守方選最頑強的應手 */
  mainLine(maxDepth: number): Move[] | null {
    const total = this.shortestMate(maxDepth);
    if (total === null) return null;
    const line: Move[] = [];
    let remaining = total;
    while (remaining > 0) {
      const attack = this.attack(remaining);
      if (attack === null) break;
      line.push(attack);
      this.position.make(attack);
      remaining--;
      const defence = this.bestDefence(remaining);
      if (defence === null) break;
      line.push(defence);
      this.position.make(defence);
      remaining = this.remainingAfterDefence(remaining) ?? 0;
    }
    for (let i = 0; i < line.length; i++) this.position.unmake();
    return line;
  }
}

export class MateSearchAborted extends Error {
  constructor() {
    super('詰み探索超過節點上限');
  }
}

/** 先試吃子與王的移動，比較快找到逃脫的應手（反證時能早點結束） */
function orderDefences(position: Position, moves: Move[]): Move[] {
  const scored = moves.map((move) => {
    let score = 0;
    if (!isDrop(move)) score += 2;
    if (position.board[moveTo(move)] !== EMPTY) score += 4;
    return { move, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((entry) => entry.move);
}
