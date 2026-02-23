// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('ゲームオーバー', () => {
  test('ブロックを積み上げるとゲームオーバーモーダルが表示される', async ({ page }) => {
    await page.goto('/?desktop=true');
    await page.getByRole('button', { name: 'ゲーム開始' }).click();
    await page.getByRole('button', { name: 'スタート' }).click();

    await expect(page.locator('#game')).toBeVisible();
    await page.locator('#game').click();
    // 落下を連打して早く積み上げ、ゲームオーバーを待つ
    const gameOver = page.locator('#game-over');
    await Promise.race([
      gameOver.waitFor({ state: 'visible', timeout: 45000 }),
      (async () => {
        for (let i = 0; i < 400; i++) {
          await page.keyboard.press('s');
          await page.keyboard.press('s');
          await page.keyboard.press('s');
          await page.keyboard.press('s');
          if (await gameOver.isVisible()) return;
          await page.waitForTimeout(80);
        }
      })(),
    ]);

    await expect(page.locator('#game-over')).toBeVisible();
    await expect(page.locator('#final-score')).toBeVisible();
    await expect(page.getByRole('button', { name: '再挑戦' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'メニューに戻る' })).toBeVisible();
  }, { timeout: 60000 });
});
