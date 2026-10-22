const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
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
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const tokens = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles', 'tokens.css'), 'utf8');
  const start = tokens.indexOf('[data-theme="dark"] {');
  expect(start).toBeGreaterThan(-1);
  const dark = tokens.slice(start, tokens.indexOf('}', start));
  const token = (name) => {
    const match = dark.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
    if (!match) throw new Error(`token ${name} not found in dark block`);
    return match[1].trim();
  };
  // Значение токена приводим к вычисленному виду rgb(...) средствами браузера.
  const toRgb = (value) => page.evaluate((v) => {
    const probe = document.createElement('div');
    probe.style.color = v;
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).color;
    probe.remove();
    return rgb;
  }, value);
  const [cardBg, pageBg] = await Promise.all([
    card.evaluate((el) => getComputedStyle(el).backgroundColor),
    page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  ]);
  expect(cardBg).toBe(await toRgb(token('--color-surface')));
  expect(pageBg).toBe(await toRgb(token('--color-bg')));
  const titleColor = await page.locator('.login__title').evaluate((el) => getComputedStyle(el).color);
  expect(titleColor).toBe(await toRgb(token('--color-text')));
});
