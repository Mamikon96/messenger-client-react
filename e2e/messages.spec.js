const { test, expect } = require('@playwright/test');
const { login, signIn, userMenuButton } = require('./helpers/auth');
const { BOB, CAROL, mockPeopleServer, openDirectChat } = require('./helpers/people');

test('[UC-MSG-01] сообщение отправляется кнопкой и Enter, поле очищается', async ({ page }) => {
  await mockPeopleServer(page);
  await login(page);
  await openDirectChat(page, BOB);

  const input = page.getByLabel('Сообщение');
  await input.fill('Первое');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('log', { name: 'Сообщения' }).getByText('Первое')).toBeVisible();
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();

  await input.fill('Второе');
  await input.press('Enter');
  await expect(page.getByRole('log', { name: 'Сообщения' }).getByText('Второе')).toBeVisible();
  await expect(input).toHaveValue('');
});

test('[UC-MSG-03] сообщения не смешиваются между чатами', async ({ page }) => {
  await mockPeopleServer(page);
  await login(page);
  await openDirectChat(page, BOB);
  await page.getByLabel('Сообщение').fill('Только в A');
  await page.getByLabel('Сообщение').press('Enter');

  await openDirectChat(page, CAROL);

  await expect(page.getByRole('log', { name: 'Сообщения' }).getByText('Только в A')).toHaveCount(0);
});

test('[UC-SESSION-05] после выхода сообщения предыдущего пользователя не видны', async ({ page }) => {
  const server = await mockPeopleServer(page);
  await login(page);
  await openDirectChat(page, BOB);
  await page.getByLabel('Сообщение').fill('Секрет');
  await page.getByLabel('Сообщение').press('Enter');
  await expect(page.getByRole('log', { name: 'Сообщения' }).getByText('Секрет')).toBeVisible();

  await userMenuButton(page).click();
  await page.getByRole('button', { name: 'Выйти' }).click();
  server.chats.length = 0; // у следующего пользователя чатов нет
  await signIn(page);

  await expect(userMenuButton(page)).toBeVisible();
  await expect(page.getByText('Секрет')).toHaveCount(0);
});

test('[UC-MSG-02] Shift+Enter переносит строку, пустое сообщение и пробелы не отправляются', async ({ page }) => {
  await mockPeopleServer(page);
  await login(page);
  await openDirectChat(page, BOB);
  const input = page.getByLabel('Сообщение');
  const messages = page.getByRole('article');

  await input.fill('Строка 1');
  await input.press('Shift+Enter');
  await input.pressSequentially('Строка 2');
  await expect(input).toHaveValue('Строка 1\nСтрока 2');
  await expect(messages).toHaveCount(0);

  await input.fill('');
  await page.getByRole('button', { name: 'Send' }).click();
  await input.fill('   ');
  await page.getByRole('button', { name: 'Send' }).click();
  await input.press('Enter');
  await expect(messages).toHaveCount(0);
});

test('[UC-MSG-01] без выбранного чата и в пустом чате показан понятный текст', async ({ page }) => {
  await mockPeopleServer(page);
  await login(page);
  await expect(page.getByText('Чат не выбран')).toBeVisible();

  await openDirectChat(page, BOB);

  await expect(page.getByText('Сообщений пока нет')).toBeVisible();
  await expect(page.getByText('Чат не выбран')).toHaveCount(0);
  await page.getByLabel('Сообщение').fill('Первое');
  await page.getByLabel('Сообщение').press('Enter');
  await expect(page.getByText('Сообщений пока нет')).toHaveCount(0);
});
