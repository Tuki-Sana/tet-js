// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('スタート画面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?desktop=true');
  });

  test('タイトルとゲーム開始・チュートリアルボタンが表示される', async ({ page }) => {
    await expect(page.locator('#start-screen')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'テ◯リス' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ゲーム開始' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'チュートリアル' })).toBeVisible();
  });

  test('ゲーム開始で難易度選択画面に遷移する', async ({ page }) => {
    await page.getByRole('button', { name: 'ゲーム開始' }).click();
    await expect(page.locator('#difficulty-screen')).toBeVisible();
    await expect(page.locator('#start-screen')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'かんたん' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'スタート' })).toBeVisible();
  });

  test('チュートリアルでチュートリアル画面に遷移する', async ({ page }) => {
    await page.getByRole('button', { name: 'チュートリアル' }).click();
    await expect(page.locator('#tutorial-screen')).toBeVisible();
    await expect(page.locator('#start-screen')).not.toBeVisible();
    await expect(page.locator('#tutorial-canvas')).toBeVisible();
    await expect(page.getByRole('button', { name: 'スタート画面へ戻る' })).toBeVisible();
  });
});

test.describe('難易度選択 → ゲーム開始', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?desktop=true');
    await page.getByRole('button', { name: 'ゲーム開始' }).click();
  });

  test('戻るでスタート画面に戻る', async ({ page }) => {
    await page.getByRole('button', { name: '戻る' }).click();
    await expect(page.locator('#start-screen')).toBeVisible();
    await expect(page.locator('#difficulty-screen')).not.toBeVisible();
  });

  test('難易度を選んでスタートでゲーム画面になる', async ({ page }) => {
    await page.getByRole('button', { name: 'ふつう' }).click();
    await page.getByRole('button', { name: 'スタート' }).click();
    await expect(page.locator('#game-screen')).toBeVisible();
    await expect(page.locator('#difficulty-screen')).not.toBeVisible();
    await expect(page.locator('#game')).toBeVisible();
    await expect(page.locator('#score')).toHaveText(/\d+/);
  });
});

test.describe('ゲーム画面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?desktop=true');
    await page.getByRole('button', { name: 'ゲーム開始' }).click();
    await page.getByRole('button', { name: 'スタート' }).click();
  });

  test('スコア・レベル・NEXT パネルが表示される', async ({ page }) => {
    await expect(page.locator('#game-screen')).toBeVisible();
    await expect(page.locator('#score')).toBeVisible();
    await expect(page.locator('#level')).toHaveText('1');
    await expect(page.locator('#high-score')).toBeVisible();
    await expect(page.locator('#next-piece-1')).toBeVisible();
  });

  test('一時停止ボタンでポーズメニューが開く', async ({ page }) => {
    await page.getByRole('button', { name: '一時停止' }).click();
    await expect(page.locator('#pause-menu')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ゲーム再開' })).toBeVisible();
    await page.getByRole('button', { name: 'ゲーム再開' }).click();
    await expect(page.locator('#pause-menu')).not.toBeVisible();
  });

  test('メニューに戻るでスタート画面に戻る', async ({ page }) => {
    await page.getByRole('button', { name: '一時停止' }).click();
    await page.getByRole('button', { name: 'メニューに戻る' }).click();
    await expect(page.locator('#start-screen')).toBeVisible();
    await expect(page.locator('#game-screen')).not.toBeVisible();
  });
});

test.describe('チュートリアル', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?desktop=true');
    await page.getByRole('button', { name: 'チュートリアル' }).click();
  });

  test('ステップ表示とキャンバス・戻るボタンがある', async ({ page }) => {
    await expect(page.locator('#tutorial-screen')).toBeVisible();
    await expect(page.locator('#tutorial-step-indicator')).toBeVisible();
    await expect(page.locator('#tutorial-instruction')).toBeVisible();
    await expect(page.locator('#tutorial-canvas')).toBeVisible();
    await page.getByRole('button', { name: 'スタート画面へ戻る' }).click();
    await expect(page.locator('#start-screen')).toBeVisible();
  });
});
