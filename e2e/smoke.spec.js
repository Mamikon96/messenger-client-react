const { test, expect } = require('@playwright/test');

test('приложение загружается и показывает кнопку Join', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Join').first()).toBeVisible();
});
