const { test, expect } = require('@playwright/test');
const { login, signIn, signInControl, userMenuButton } = require('./helpers/auth');
const { BOB, mockPeopleServer, openDirectChat } = require('./helpers/people');

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
  const server = await mockPeopleServer(page);
  await login(page);
  await openDirectChat(page, BOB);
  await expect(page.locator('.chat', { hasText: BOB.name })).toBeVisible();

  await userMenuButton(page).click();
  await page.getByRole('button', { name: 'Выйти' }).click();
  server.chats.length = 0; // у следующего пользователя чатов нет
  await signIn(page);

  await expect(userMenuButton(page)).toBeVisible();
  await expect(page.locator('.chat')).toHaveCount(0);
});

test('[UC-SESSION-04] сбой выхода: сообщение, остаёмся в мессенджере', async ({ page }) => {
  await login(page);
  await page.route('**/api/auth/logout', (route) => route.abort());

  await userMenuButton(page).click();
  await page.getByRole('button', { name: 'Выйти' }).click();

  await expect(page.getByRole('alert')).toHaveText('Не удалось выйти. Попробуйте снова.');
  await expect(signInControl(page)).toHaveCount(0);
});
