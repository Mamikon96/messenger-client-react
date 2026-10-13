const { test, expect } = require('@playwright/test');
const { login, signIn, signInControl, userMenuButton } = require('./helpers/auth');

test('[UC-SESSION-03] выход через меню пользователя: экран входа, сессия на сервере закрыта', async ({ page }) => {
  await login(page);

  await userMenuButton(page).click();
  await page.getByRole('button', { name: 'Выйти' }).click();

  await expect(signInControl(page)).toBeVisible();
  await expect(userMenuButton(page)).toHaveCount(0);
  expect((await page.request.get('/api/auth/session')).status()).toBe(401);
});

test('[UC-SESSION-03] после выхода перезагрузка показывает экран входа', async ({ page }) => {
  await login(page);
  await userMenuButton(page).click();
  await page.getByRole('button', { name: 'Выйти' }).click();
  await expect(signInControl(page)).toBeVisible();

  await page.reload();

  await expect(signInControl(page)).toBeVisible();
});

test('[UC-SESSION-05] после выхода чаты предыдущего пользователя не видны', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('input[name="title"]').fill('Secret room');
  await page.locator('input[name="name"]').fill('Mock');
  await page.locator('.join-form').getByRole('button', { name: 'Join' }).click();
  // popover после Join не закрывается сам (FE-03) — закрываем кликом по оверлею
  await page.locator('.overlay').click({ position: { x: 5, y: 5 } });
  await expect(page.getByText('Secret room')).toBeVisible();

  await userMenuButton(page).click();
  await page.getByRole('button', { name: 'Выйти' }).click();
  await signIn(page);

  await expect(userMenuButton(page)).toBeVisible();
  await expect(page.getByText('Secret room')).toHaveCount(0);
});

test('[UC-SESSION-04] сбой выхода: сообщение, остаёмся в мессенджере', async ({ page }) => {
  await login(page);
  await page.route('**/api/auth/logout', (route) => route.abort());

  await userMenuButton(page).click();
  await page.getByRole('button', { name: 'Выйти' }).click();

  await expect(page.getByRole('alert')).toHaveText('Не удалось выйти. Попробуйте снова.');
  await expect(signInControl(page)).toHaveCount(0);
});
