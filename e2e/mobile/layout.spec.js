// @ts-check
/** Pixel 5 プロジェクト専用（playwright.config.js の testMatch）。デスクトップ用 #game ではなくモバイル盤を検証する */
const { test, expect } = require('@playwright/test');

test.describe('モバイルレイアウト', () => {
  test('ゲーム開始後にモバイル盤とモバイル HUD が表示される', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'ゲーム開始' }).click();
    await page.getByRole('button', { name: 'スタート' }).click();

    await expect(page.locator('#game-screen')).toBeVisible();
    await expect(page.locator('.game-layout-mobile')).toBeVisible();
    await expect(page.locator('#mobile-game')).toBeVisible();
    await expect(page.locator('#mobile-score')).toBeVisible();
    await expect(page.locator('#mobile-level')).toHaveText('1');
    await expect(page.locator('#game')).toBeHidden();
  });

  test('一時停止でポーズメニューが開く', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'ゲーム開始' }).click();
    await page.getByRole('button', { name: 'スタート' }).click();

    await page.getByRole('button', { name: '一時停止' }).click();
    await expect(page.locator('#pause-menu')).toBeVisible();
    await page.getByRole('button', { name: 'ゲーム再開' }).click();
    await expect(page.locator('#pause-menu')).not.toBeVisible();
  });
});
