const { test, expect } = require('@playwright/test');
const { signIn } = require('./helpers/auth');

test('вход через mock-BFF открывает мессенджер с полем поиска людей', async ({ page }) => {
  await page.goto('/');
  await signIn(page);
  await expect(page.getByLabel('Поиск людей')).toBeVisible();
});
