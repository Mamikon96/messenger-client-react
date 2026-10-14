const { test, expect } = require('@playwright/test');
const { MOCK_USER_LOGIN, MOCK_USER_PASSWORD, signInControl, submitCredentials, userMenuButton } = require('./helpers/auth');

// Логин уникален в пределах прогона: mock-BFF живёт весь прогон, а тесты идут параллельно.
const uniqueLogin = () => `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

test('[UC-AUTH-12] вход по логину и паролю: мессенджер с именем пользователя, экрана входа нет', async ({ page }) => {
  await page.goto('/');

  await submitCredentials(page, MOCK_USER_LOGIN, MOCK_USER_PASSWORD);

  await expect(userMenuButton(page)).toBeVisible();
  await expect(signInControl(page)).toHaveCount(0);
  await expect(page.getByLabel('Пароль')).toHaveCount(0);
});

test('[UC-AUTH-12] регистр букв в логине не важен', async ({ page }) => {
  await page.goto('/');

  await submitCredentials(page, MOCK_USER_LOGIN.toUpperCase(), MOCK_USER_PASSWORD);

  await expect(userMenuButton(page)).toBeVisible();
});

test('[UC-AUTH-13] регистрация: только логин и пароль, после неё мессенджер с придуманным сервером именем', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Регистрация' }).click();

  await expect(page.getByRole('tab', { name: 'Регистрация' })).toHaveAttribute('aria-selected', 'true');
  // В форме только логин и пароль: Playwright считает textbox и поле пароля, поэтому полей ровно два.
  const form = page.getByRole('tabpanel', { name: 'Регистрация' });
  await expect(form.getByRole('textbox')).toHaveCount(2);
  await expect(form.getByLabel('Логин')).toHaveCount(1);
  await expect(form.getByLabel('Пароль')).toHaveCount(1);
  await page.getByLabel('Логин').fill(uniqueLogin());
  await page.getByLabel('Пароль').fill('correct-horse-1');
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();

  await expect(page.getByLabel('Пароль')).toHaveCount(0);
  const session = await page.request.get('/api/auth/session');
  expect(session.status()).toBe(200);
  const { user } = await session.json();
  expect(typeof user.name).toBe('string');
  expect(user.name.trim()).not.toBe('');
  await expect(page.getByRole('button', { name: user.name })).toBeVisible();
});
