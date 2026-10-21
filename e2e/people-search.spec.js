const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');
const { BOB, CAROL, mockPeopleServer, searchField, writeButton, openDirectChat } = require('./helpers/people');

const people = (page) => page.getByRole('heading', { name: 'Люди' });

test('[UC-CHAT-01] запрос короче 2 символов не ищет и не показывает блок «Люди»', async ({ page }) => {
  const server = await mockPeopleServer(page);
  await login(page);

  await searchField(page).fill('Б');
  await searchField(page).fill(' Б ');
  // запрос уходит после паузы ввода (debounce 300 мс): ждём дольше, прежде чем утверждать, что его не было
  await page.waitForTimeout(500);

  await expect(people(page)).toHaveCount(0);
  expect(server.searches).toEqual([]);
});

test('[UC-CHAT-01] поиск показывает найденных людей, «Написать» создаёт direct-чат и открывает его', async ({ page }) => {
  const server = await mockPeopleServer(page);
  await login(page);
  await expect(page.getByText('Чатов пока нет')).toBeVisible();

  await searchField(page).fill('Боб');
  await expect(people(page)).toBeVisible();
  await expect(writeButton(page, BOB.name)).toBeVisible();
  await expect(writeButton(page, CAROL.name)).toHaveCount(0);
  await writeButton(page, BOB.name).click();

  await expect(page.locator('.dialog__header-title')).toHaveText(BOB.name);
  expect(server.createRequests).toEqual([{ type: 'direct', userId: BOB.id }]);
  await expect(page.locator('.chat', { hasText: BOB.name })).toHaveCount(1);
  await expect(page.locator('.chat._active')).toContainText(BOB.name);
});

test('[UC-CHAT-01] чат, открытый пока список чатов грузится, не пропадает после ответа списка', async ({ page }) => {
  const server = await mockPeopleServer(page);
  server.listDelayMs = 1500;
  await login(page);
  await expect(page.getByText('Загрузка чатов…')).toBeVisible();

  await searchField(page).fill('Боб');
  await writeButton(page, BOB.name).click();
  await expect(page.locator('.dialog__header-title')).toHaveText(BOB.name);
  await expect(page.getByText('Загрузка чатов…')).toHaveCount(0);

  await expect(page.locator('.chat', { hasText: BOB.name })).toHaveCount(1);
  await expect(page.locator('.chat._active')).toContainText(BOB.name);
  await expect(page.locator('.dialog__header-title')).toHaveText(BOB.name);
});

test('[UC-CHAT-01] «Написать» человеку с существующим чатом открывает его без дубля и без потери последнего сообщения', async ({ page }) => {
  const lastMessage = { chatId: 'd1', seq: 2, senderId: BOB.id, clientId: 'c-d1-2', body: 'Как дела?', createdAt: '2026-10-15T10:00:00.000Z' };
  const server = await mockPeopleServer(page, {
    chats: [{ id: 'd1', type: 'direct', title: null, lastSeq: 2, lastMessage, unreadCount: 1, peer: BOB }],
  });
  server.messages.d1 = [lastMessage];
  await login(page);
  await expect(page.locator('.chat')).toHaveCount(1);

  await searchField(page).fill('Боб');
  await writeButton(page, BOB.name).click();

  await expect(page.locator('.chat._active')).toContainText(BOB.name);
  await expect(page.locator('.chat')).toHaveCount(1);
  await expect(page.locator('.chat', { hasText: 'Как дела?' })).toHaveCount(1);
  await expect(page.locator('.dialog__header-title')).toHaveText(BOB.name);
});

test('[UC-CHAT-01] никого не найдено: «Никого не найдено»', async ({ page }) => {
  await mockPeopleServer(page);
  await login(page);

  await searchField(page).fill('Яяя');

  await expect(page.getByRole('status').filter({ hasText: 'Никого не найдено' })).toHaveCount(1);
  await expect(page.locator('.people-search__status', { hasText: 'Никого не найдено' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Написать/ })).toHaveCount(0);
});

test('[UC-CHAT-01] сбой поиска: сообщение об ошибке', async ({ page }) => {
  await mockPeopleServer(page);
  await page.route('**/api/users**', (route) => route.fulfill({ status: 500, json: { error: { code: 'internal' } } }));
  await login(page);

  await searchField(page).fill('Боб');

  await expect(page.getByRole('alert')).toHaveText('Не удалось выполнить поиск.');
});

test('[UC-CHAT-01] пользователь недоступен (404): понятное сообщение, чат не создан', async ({ page }) => {
  const server = await mockPeopleServer(page);
  server.createStatus = 404;
  await login(page);

  await searchField(page).fill('Боб');
  await writeButton(page, BOB.name).click();

  await expect(page.getByRole('alert')).toHaveText('Пользователь недоступен');
  await expect(page.locator('.chat')).toHaveCount(0);
  await expect(page.getByText('Чат не выбран')).toBeVisible();
});

test('[UC-CHAT-01] открыть второй чат из поиска: оба в списке, активен последний', async ({ page }) => {
  await mockPeopleServer(page);
  await login(page);

  await openDirectChat(page, BOB);
  await openDirectChat(page, CAROL);

  await expect(page.locator('.chat')).toHaveCount(2);
  await expect(page.locator('.chat._active')).toContainText(CAROL.name);
});
