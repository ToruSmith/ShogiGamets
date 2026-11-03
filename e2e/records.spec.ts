import { expect, test } from 'playwright/test';

const KIF = `手合割：平手
先手：甲
後手：乙
手数----指手---------消費時間--
   1 ７六歩(77)   ( 0:03/00:00:03)
   2 ３四歩(33)   ( 0:05/00:00:05)
   3 ２二角成(88) ( 0:01/00:00:04)
   4 同　銀(31)   ( 0:02/00:00:07)
   5 投了
まで4手で後手の勝ち
`;

test('匯入 KIF 後進入復盤', async ({ page }) => {
  await page.goto('./#/records');
  await page.getByTestId('import-text').fill(KIF);
  await page.getByTestId('import-button').click();
  await expect(page.getByTestId('ply')).toContainText('4');
  await expect(page.getByText('△同　銀')).toBeVisible();
  await page.goto('./#/records');
  await expect(page.getByTestId('records')).toContainText('甲');
});

test('匯入 SFEN', async ({ page }) => {
  await page.goto('./#/records');
  await page.getByTestId('import-text').fill('position startpos moves 7g7f 3c3d 2g2f');
  await page.getByTestId('import-button').click();
  await expect(page.getByTestId('ply')).toContainText('3');
});

test('壞掉的棋譜顯示錯誤', async ({ page }) => {
  await page.goto('./#/records');
  await page.getByTestId('import-text').fill('position startpos moves 7g7f 7g7e');
  await page.getByTestId('import-button').click();
  await expect(page.getByTestId('import-error')).toContainText('第 2 手');
});
