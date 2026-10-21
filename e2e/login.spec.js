const { test, expect } = require('@playwright/test');
const { login, signInControl } = require('./helpers/auth');

test('[UC-SESSION-01] после перезагрузки сессия сохраняется и вход не показывается', async ({ page }) => {
  await login(page);
  await page.reload();
  await expect(page.getByLabel('Поиск людей')).toBeVisible();
  await expect(signInControl(page)).toHaveCount(0);
});

test('[UC-SESSION-02] сбой проверки сессии: сообщение и «Повторить» восстанавливает работу', async ({ page }) => {
  let fail = true;
  await page.route('**/api/auth/session', (route) => (fail ? route.abort() : route.fallback()));
  await page.goto('/');
  await expect(
    page.getByText('Не удалось проверить сессию. Проверьте соединение и попробуйте снова.')
  ).toBeVisible();

  fail = false;
  await page.getByRole('button', { name: 'Повторить' }).click();
  await expect(signInControl(page)).toBeVisible();
});

test('[UC-THEME-04] экран входа в тёмной теме: фон и текст из токенов', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const card = page.locator('.login__card');
  await expect(card).toBeVisible();
  const [bg, pageBg] = await Promise.all([
    card.evaluate((el) => getComputedStyle(el).backgroundColor),
    page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  ]);
  expect(bg).not.toBe('rgb(255, 255, 255)');
  expect(bg).not.toBe(pageBg);
});

