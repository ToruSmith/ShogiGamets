import { expect, test } from 'playwright/test';
import { clickSquare, expectMoves, pieceAt, playUsi, squarePoint, startLocal } from './helpers.ts';

test('首頁顯示所有模式', async ({ page }) => {
  await page.goto('./');
  for (const id of [
    'mode-ai',
    'mode-local',
    'mode-online',
    'mode-tsume',
    'mode-records',
    'mode-settings',
  ]) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
});

test('雙人同機：點選走子、悔棋', async ({ page }) => {
  await startLocal(page);
  await playUsi(page, '7g7f');
  await expect(pieceAt(page, 7, 6)).toHaveAttribute('data-piece', '0-1');
  await expect(page.getByText('▲７六歩')).toBeVisible();
  await expect(page.getByTestId('status')).toContainText('後手');
  await page.getByTestId('undo').click();
  await expectMoves(page, 0);
  await expect(pieceAt(page, 7, 7)).toHaveAttribute('data-piece', '0-1');
});

test('拖曳走子', async ({ page }) => {
  await startLocal(page);
  const from = await squarePoint(page, 2, 7);
  const to = await squarePoint(page, 2, 6);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  await expect(pieceAt(page, 2, 6)).toHaveAttribute('data-piece', '0-1');
});

test('升變選擇與打入', async ({ page }) => {
  await startLocal(page);
  await playUsi(page, '7g7f');
  await playUsi(page, '3c3d');
  await playUsi(page, '8h2b');
  await page.getByRole('button', { name: '成', exact: true }).click();
  await expect(pieceAt(page, 2, 2)).toHaveAttribute('data-piece', '0-14');
  await playUsi(page, '3a2b');
  await playUsi(page, 'B*5e');
  await expect(pieceAt(page, 5, 5)).toHaveAttribute('data-piece', '0-6');
  await expect(page.getByText('▲５五角打')).toBeVisible();
});

test('投了後可以復盤並分析', async ({ page }) => {
  await startLocal(page);
  await playUsi(page, '7g7f');
  await playUsi(page, '3c3d');
  await page.getByTestId('resign').click();
  await page.getByTestId('confirm-resign').click();
  await expect(page.locator('[data-result="resign"]')).toBeVisible();
  await page.getByTestId('review').click();
  await expect(page.getByTestId('ply')).toContainText('2');
  await page.getByTestId('prev').click();
  await expect(page.getByTestId('ply')).toContainText('1');
  await page.getByTestId('analyze').click();
  await expect(page.getByTestId('move-quality')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('先手勝率')).toBeVisible();
});

test('對電腦：電腦會回應', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('mode-ai').click();
  await page.getByRole('radio', { name: /入門/ }).click();
  await page.getByTestId('start-game').click();
  await playUsi(page, '7g7f');
  await expectMoves(page, 2);
  await expect(page.getByTestId('status')).toContainText('先手');
  // 重新整理後可以繼續
  await page.goto('./');
  await page.getByTestId('resume').click();
  await expectMoves(page, 2);
});

test('對電腦：電腦先走（執後手）', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('mode-ai').click();
  await page.getByRole('radio', { name: /入門/ }).click();
  await page.getByRole('radio', { name: /後手/ }).click();
  await page.getByTestId('start-game').click();
  await expectMoves(page, 1);
  // 後手在下方：盤面翻轉
  await clickSquare(page, 3, 3, true);
  await clickSquare(page, 3, 4, true);
  await expect(pieceAt(page, 3, 4)).toHaveAttribute('data-piece', '1-1');
});

test('切換成英文', async ({ page }) => {
  await page.goto('./#/settings');
  await page.getByTestId('locale').click();
  await page.getByRole('option', { name: 'English' }).click();
  await page.goto('./');
  await expect(page.getByTestId('mode-ai')).toContainText('Play the computer');
});

test('離線：Service Worker 會快取整個 App', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('mode-tsume')).toBeVisible();
  await page.getByTestId('mode-tsume').click();
  await expect(page.getByTestId('tsume-1')).toBeVisible();
  await context.setOffline(false);
});
