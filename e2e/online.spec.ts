import { expect, test } from 'playwright/test';
import { pieceAt, playUsi } from './helpers.ts';

test('兩個分頁線上對戰：開房、加入、走子、認輸', async ({ context }) => {
  const host = await context.newPage();
  const guest = await context.newPage();

  await host.goto('./#/online');
  await host.getByTestId('online-name').fill('Alice');
  await host.getByRole('radio', { name: /先手/ }).click();
  await host.getByTestId('create-room').click();
  await expect(host.getByTestId('waiting')).toBeVisible();
  const code = (await host.getByTestId('room-code').textContent())?.trim() ?? '';
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

  // 大廳看得到這個房間
  await guest.goto('./#/online');
  await expect(guest.getByTestId('lobby')).toContainText('Alice');

  // 同一個瀏覽器的分頁共用 localStorage：訪客先填自己的名字，再用代碼加入
  await guest.getByTestId('online-name').fill('Bob');
  await guest.getByRole('tab', { name: '加入' }).click();
  await guest.getByTestId('room-code-input').fill(code.toLowerCase());
  await guest.getByTestId('join-room').click();
  await expect(host.getByTestId('waiting')).toBeHidden();
  await expect(guest.getByTestId('name-0')).toHaveText('Alice');

  await playUsi(host, '7g7f');
  await expect(pieceAt(guest, 7, 6)).toHaveAttribute('data-piece', '0-1');
  // 後手在下方，盤面是翻轉的
  await playUsi(guest, '3c3d', true);
  await expect(pieceAt(host, 3, 4)).toHaveAttribute('data-piece', '1-1');

  await guest.getByTestId('resign').click();
  await guest.getByTestId('confirm-resign').click();
  await expect(host.locator('[data-result="resign"]')).toBeVisible();
  await expect(host.getByText('你贏了')).toBeVisible();

  // 再戰：交換先後手
  await host.getByTestId('again').click();
  await guest.getByTestId('again').click();
  await expect(guest.getByTestId('status')).toContainText('先手');
  await expect(guest.getByTestId('name-0')).toHaveText('Bob');
});

test('邀請連結：新訪客先輸入名字', async ({ browser }) => {
  // 不同的瀏覽器環境看不到彼此的本機後端，所以這裡只測名字表單與找不到房間的訊息
  const page = await (await browser.newContext()).newPage();
  await page.goto('./#/r/ABCDEF');
  await page.getByTestId('join-name').fill('Carol');
  await page.getByTestId('join-confirm').click();
  await expect(page.getByRole('alert')).toContainText('找不到');
});
