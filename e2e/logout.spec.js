const { test, expect } = require('@playwright/test');

const login = async (page) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Войти через Google' }).click();
  await expect(page.getByRole('button', { name: 'Mock google user' })).toBeVisible();
};

test('выход через меню пользователя: экран входа, сессия на сервере закрыта', async ({ page }) => {
  await login(page);

  await page.getByRole('button', { name: 'Mock google user' }).click();
  await page.getByRole('button', { name: 'Выйти' }).click();

  await expect(page.getByRole('link', { name: 'Войти через Google' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mock google user' })).toHaveCount(0);
  expect((await page.request.get('/api/auth/session')).status()).toBe(401);
});

test('после выхода перезагрузка показывает экран входа', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Mock google user' }).click();
  await page.getByRole('button', { name: 'Выйти' }).click();
  await expect(page.getByRole('link', { name: 'Войти через Google' })).toBeVisible();

  await page.reload();

  await expect(page.getByRole('link', { name: 'Войти через Google' })).toBeVisible();
});

test('после выхода чаты предыдущего пользователя не видны', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('input[name="title"]').fill('Secret room');
  await page.locator('input[name="name"]').fill('Mock');
  await page.locator('.join-form').getByRole('button', { name: 'Join' }).click();
  // popover после Join не закрывается сам (FE-03) — закрываем кликом по оверлею
  await page.locator('.overlay').click({ position: { x: 5, y: 5 } });
  await expect(page.getByText('Secret room')).toBeVisible();

  await page.getByRole('button', { name: 'Mock google user' }).click();
  await page.getByRole('button', { name: 'Выйти' }).click();
  await page.getByRole('link', { name: 'Войти через Google' }).click();

  await expect(page.getByRole('button', { name: 'Mock google user' })).toBeVisible();
  await expect(page.getByText('Secret room')).toHaveCount(0);
});

test('сбой выхода: сообщение, остаёмся в мессенджере', async ({ page }) => {
  await login(page);
  await page.route('**/api/auth/logout', (route) => route.abort());

  await page.getByRole('button', { name: 'Mock google user' }).click();
  await page.getByRole('button', { name: 'Выйти' }).click();

  await expect(page.getByRole('alert')).toHaveText('Не удалось выйти. Попробуйте снова.');
  await expect(page.getByRole('link', { name: 'Войти через Google' })).toHaveCount(0);
});
