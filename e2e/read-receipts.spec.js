const { test, expect } = require('@playwright/test');
const { signIn, signInControl, userMenuButton } = require('./helpers/auth');

// Прочтение (FE-43): REST и WebSocket подменяются, как в realtime.spec.js (mock-BFF чатов и WS не имеет, FE-D13).
// Тест не помечен тегом UC-MSG-07: кейс planned, а тест на planned-кейс запрещён (scripts/check-state.js) до решения пользователя.
const BOB = { userId: 'u-bob', name: 'Боб Собеседник', avatarUrl: '', role: 'member' };
const bobMessage = (chatId, seq, body) => ({ chatId, seq, senderId: 'u-bob', clientId: `c-${chatId}-${seq}`, body, createdAt: '2026-10-17T10:00:00.000Z' });
const CHATS = [
  { id: 'g1', type: 'group', title: 'Команда', lastSeq: 2, lastMessage: bobMessage('g1', 2, 'Второе'), unreadCount: 2 },
  { id: 'g2', type: 'group', title: 'Друзья', lastSeq: 1, lastMessage: bobMessage('g2', 1, 'Привет'), unreadCount: 1 },
];
const dto = (chat) => ({ id: chat.id, type: 'group', title: chat.title, lastSeq: chat.lastSeq, members: [BOB] });

// Состояние «сервера»: chats — ответ GET /api/chats; reads — тела принятых POST /api/chats/:id/read.
const createServer = () => ({
  chats: CHATS.map((chat) => ({ ...chat })),
  messages: { g1: [bobMessage('g1', 1, 'Первое'), bobMessage('g1', 2, 'Второе')], g2: [bobMessage('g2', 1, 'Привет')] },
  reads: [],
});

const mockRest = async (page, server) => {
  await page.route('**/api/chats', (route) => route.fulfill({ json: server.chats }));
  await page.route('**/api/chats/*', (route) => route.fulfill({ json: dto(server.chats.find((chat) => route.request().url().endsWith(`/${chat.id}`))) }));
  await page.route('**/api/chats/*/messages**', (route) => {
    const chatId = new URL(route.request().url()).pathname.split('/')[3];
    route.fulfill({ json: { messages: server.messages[chatId], hasMore: false } });
  });
  await page.route('**/api/chats/*/read', (route) => {
    const chatId = new URL(route.request().url()).pathname.split('/')[3];
    server.reads.push({ chatId, ...route.request().postDataJSON() });
    route.fulfill({ status: 204 });
  });
};

const openApp = async (page, server) => {
  const sockets = [];
  await page.routeWebSocket(/\/ws$/, (ws) => sockets.push(ws));
  await mockRest(page, server);
  await page.goto('/');
  await expect(signInControl(page)).toBeVisible();
  const beforeLogin = sockets.length;
  await signIn(page);
  await expect(userMenuButton(page)).toBeVisible();
  await expect.poll(() => sockets.length).toBeGreaterThan(beforeLogin);
  return { send: (type, payload) => sockets[sockets.length - 1].send(JSON.stringify({ type, payload })) };
};

const chatRow = (page, title) => page.locator('.chat', { hasText: title });
const unreadBadge = (page, title) => chatRow(page, title).getByTestId('chat-unread');

test('открытие чата с лентой внизу отправляет POST read с max seq и убирает счётчик, другой чат не затронут', async ({ page }) => {
  const server = createServer();
  await openApp(page, server);
  await expect(unreadBadge(page, 'Команда')).toHaveText('2');

  await chatRow(page, 'Команда').click();

  await expect(unreadBadge(page, 'Команда')).toHaveCount(0);
  expect(server.reads).toEqual([{ chatId: 'g1', seq: 2 }]);
  await expect(unreadBadge(page, 'Друзья')).toHaveText('1');
});

test('новое сообщение в открытом чате у низа ленты тоже уходит в POST read', async ({ page }) => {
  const server = createServer();
  const socket = await openApp(page, server);
  await chatRow(page, 'Команда').click();
  await expect.poll(() => server.reads.length).toBe(1);

  socket.send('message.new', bobMessage('g1', 3, 'Третье'));

  await expect(page.locator('.dialog__message').last()).toContainText('Третье');
  await expect.poll(() => server.reads.at(-1)).toEqual({ chatId: 'g1', seq: 3 });
});

test('ошибка POST read не обнуляет счётчик', async ({ page }) => {
  const server = createServer();
  await openApp(page, server);
  let failed = 0;
  await page.route('**/api/chats/*/read', (route) => {
    failed += 1;
    route.fulfill({ status: 500, json: { error: { code: 'internal', message: 'x' } } });
  });

  await chatRow(page, 'Команда').click();

  await expect.poll(() => failed).toBe(1);
  await expect(page.locator('.dialog__message')).toHaveCount(2);
  await expect(unreadBadge(page, 'Команда')).toHaveText('2');
});

test('возвращение на вкладку сверяет список с сервером, открытый чат и его история не теряются', async ({ page }) => {
  const server = createServer();
  await openApp(page, server);
  await chatRow(page, 'Команда').click();
  await expect(page.locator('.dialog__message')).toHaveCount(2);

  server.chats.find((chat) => chat.id === 'g2').unreadCount = 5;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

  await expect(unreadBadge(page, 'Друзья')).toHaveText('5');
  await expect(page.locator('.dialog__message')).toHaveCount(2);
});
