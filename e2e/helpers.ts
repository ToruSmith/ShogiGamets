import type { Page } from 'playwright/test';
import { expect } from 'playwright/test';

/** 棋盤 SVG 的 viewBox 寬度（見 src/board/geometry.ts） */
const VIEW_W = 18 + 900 + 46;

/** 筋（1～9）與段（1～9）的螢幕座標；flipped 表示後手在下 */
export async function squarePoint(page: Page, file: number, rank: number, flipped = false) {
  const box = await page.locator('.board-svg').boundingBox();
  if (!box) throw new Error('找不到棋盤');
  const unit = box.width / VIEW_W;
  const column = flipped ? file - 1 : 9 - file;
  const row = flipped ? 9 - rank : rank - 1;
  return {
    x: box.x + (18 + (column + 0.5) * 100) * unit,
    y: box.y + (46 + (row + 0.5) * 109) * unit,
  };
}

export async function clickSquare(page: Page, file: number, rank: number, flipped = false) {
  const { x, y } = await squarePoint(page, file, rank, flipped);
  await page.mouse.click(x, y);
}

/** 用 USI 寫法走一步（7g7f），點選兩次 */
export async function playUsi(page: Page, usi: string, flipped = false) {
  const rank = (letter: string) => 'abcdefghi'.indexOf(letter) + 1;
  const drop = /^([PLNSGBR])\*(\d)([a-i])$/.exec(usi);
  if (drop) {
    const types: Record<string, number> = { P: 1, L: 2, N: 3, S: 4, G: 5, B: 6, R: 7 };
    await page.locator(`[data-hand-piece="${types[drop[1] as string]}"]:not([disabled])`).click();
    await clickSquare(page, Number(drop[2]), rank(drop[3] as string), flipped);
    return;
  }
  const match = /^(\d)([a-i])(\d)([a-i])(\+?)$/.exec(usi);
  if (!match) throw new Error(usi);
  await clickSquare(page, Number(match[1]), rank(match[2] as string), flipped);
  await clickSquare(page, Number(match[3]), rank(match[4] as string), flipped);
}

/** 第 square 格（0 = 9一）上的棋子 */
export const pieceAt = (page: Page, file: number, rank: number) =>
  page.locator(`[data-square="${(rank - 1) * 9 + (9 - file)}"]`);

export async function expectMoves(page: Page, count: number) {
  await expect(page.locator('ol[aria-label="棋譜"] li[data-ply]')).toHaveCount(count + 1);
}

export async function startLocal(page: Page) {
  await page.goto('./');
  await page.getByTestId('mode-local').click();
  await page.getByTestId('start-game').click();
  await expect(page.locator('.board-svg')).toBeVisible();
}
