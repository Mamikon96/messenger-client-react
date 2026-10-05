const { test, expect } = require('@playwright/test');

test('вход через mock-BFF открывает мессенджер с кнопкой Join', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Войти через Google' }).click();
  await expect(page.getByText('Join').first()).toBeVisible();
});
