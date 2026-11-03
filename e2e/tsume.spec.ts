import { expect, test } from 'playwright/test';
import { playUsi } from './helpers.ts';

test('解開一手詰並記錄', async ({ page }) => {
  await page.goto('./#/tsume/1');
  // 第 1 題：G*8b
  await playUsi(page, 'G*8b');
  await expect(page.getByTestId('tsume-status')).toHaveAttribute('data-state', 'solved');
  await page.goto('./#/tsume');
  await expect(page.getByTestId('solved-count')).toContainText('已解 1');
});

test('錯的著手會被退回', async ({ page }) => {
  await page.goto('./#/tsume/13');
  // 不將軍的著手
  await playUsi(page, '7c6b');
  await expect(page.getByTestId('tsume-status')).toHaveAttribute('data-state', 'wrong');
  await page.getByTestId('tsume-answer').click();
  await expect(page.getByTestId('tsume-reveal')).toContainText('８三金打');
});

test('三手詰：守方會應手', async ({ page }) => {
  await page.goto('./#/tsume/13');
  await playUsi(page, 'G*8c');
  await expect(page.getByTestId('tsume-status')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('ol li[data-ply]')).toHaveCount(0);
  await playUsi(page, 'R*9a');
  await expect(page.getByTestId('tsume-status')).toHaveAttribute('data-state', 'solved');
});
