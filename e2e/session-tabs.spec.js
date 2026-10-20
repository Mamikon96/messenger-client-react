const { test, expect } = require('@playwright/test');
const { login, signIn, submitCredentials, signInControl, sessionUserId, userMenuButton, MOCK_USER_PASSWORD } = require('./helpers/auth');

const OTHER_USER_LOGIN = 'bob';
const OTHER_USER_NAME = 'Bob Tester';

// Серверный чат g1 есть только у Alice; POST сообщения идёт на реальный mock-BFF ради проверки CSRF (устаревший токен → 403 csrf_invalid).
// Чатов в mock-BFF нет, поэтому прошедший проверку CSRF запрос подменяется ответом 201. Возвращает список принятых POST.
const CHAT = { id: 'g1', type: 'group', title: 'Secret room', lastSeq: 0, lastMessage: null, unreadCount: 0 };
const CHAT_DTO = { id: 'g1', type: 'group', title: 'Secret room', lastSeq: 0, members: [] };

const mockServer = async (page) => {
  const accepted = [];
  const sessionLogin = async () => (await (await page.request.get('/api/auth/session')).json()).user.login;
  await page.route('**/api/chats', async (route) => route.fulfill({ json: (await sessionLogin()) === 'alice' ? [CHAT] : [] }));
  await page.route('**/api/chats/g1', (route) => route.fulfill({ json: CHAT_DTO }));
  await page.route('**/api/chats/g1/messages**', async (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: { messages: [], hasMore: false } });
    const response = await route.fetch();
    if (response.status() === 403) return route.fulfill({ response });
    const data = route.request().postDataJSON();
    accepted.push(data);
    return route.fulfill({
      status: 201,
      json: { chatId: 'g1', seq: accepted.length, senderId: await sessionUserId(page), clientId: data.clientId, body: data.body, createdAt: '2026-10-15T10:01:00.000Z' },
    });
  });
  return accepted;
};

const send = async (page, text) => {
  await page.getByLabel('Сообщение').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
};

// Вкладка B того же браузерного контекста: выходит и входит заново (тем же или другим пользователем).
const reLoginInOtherTab = async (context, otherLogin = null) => {
  const other = await context.newPage();
  await other.goto('/');
  await userMenuButton(other).click();
  await other.getByRole('button', { name: 'Выйти' }).click();
  await expect(signInControl(other)).toBeVisible();
  if (otherLogin) await submitCredentials(other, otherLogin, MOCK_USER_PASSWORD);
  else await signIn(other);
  await expect(other.getByRole('button', { name: otherLogin ? OTHER_USER_NAME : 'Alice Tester' })).toBeVisible();
  return other;
};

const openChat = async (page) => {
  await page.locator('.chat', { hasText: 'Secret room' }).click();
  await expect(page.getByRole('log', { name: 'Сообщения' })).toBeVisible();
};

test('[UC-SESSION-09] в другой вкладке вошли заново тем же пользователем: действие в этой вкладке выполняется без ошибки', async ({ page, context }) => {
  const accepted = await mockServer(page);
  await login(page);
  await openChat(page);
  await reLoginInOtherTab(context);

  await send(page, 'После перевхода');

  const own = page.getByRole('article').last();
  await expect(own).toContainText('После перевхода');
  await expect(own.getByRole('img', { name: 'Отправлено' })).toBeVisible();
  await expect(own.getByRole('button', { name: 'Не отправлено. Повторить' })).toHaveCount(0);
  expect(accepted).toHaveLength(1);
  await expect(userMenuButton(page)).toBeVisible();
});

test('[UC-SESSION-09] в другой вкладке вошёл другой пользователь: в этой вкладке его имя и нет данных прежнего', async ({ page, context }) => {
  await mockServer(page);
  await login(page);
  await openChat(page);
  await reLoginInOtherTab(context, OTHER_USER_LOGIN);

  await send(page, 'Тайное сообщение');

  await expect(page.getByRole('button', { name: OTHER_USER_NAME })).toBeVisible();
  await expect(page.getByText('Secret room')).toHaveCount(0);
  // список чатов нового пользователя загружен заново, а не остался в «Загрузка чатов…»
  await expect(page.getByText('Чатов пока нет')).toBeVisible();
  await expect(page.getByText('Загрузка чатов…')).toHaveCount(0);
  await expect(page.getByText('Тайное сообщение')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Alice Tester' })).toHaveCount(0);
});
