const { test, expect } = require('@playwright/test');
const { signIn } = require('./helpers/auth');

test('вход через mock-BFF открывает мессенджер с кнопкой Join', async ({ page }) => {
  await page.goto('/');
  await signIn(page);
  await expect(page.getByText('Join').first()).toBeVisible();
});
