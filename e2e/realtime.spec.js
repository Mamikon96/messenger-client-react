const { test, expect } = require('@playwright/test');
const { signIn, signInControl, userMenuButton } = require('./helpers/auth');

// WebSocket приложения подменяется через routeWebSocket (mock-BFF без WS, FE-D13). Путь /ws занят и HMR-сокетом dev-сервера,
// поэтому подменяются оба: HMR-сокет остаётся «молчащим», а сокет приложения отличается тем, что открывается после входа.
const BOB = { userId: 'u-bob', name: 'Боб Собеседник', avatarUrl: '', role: 'member' };
const first = { chatId: 'g1', seq: 1, senderId: 'u-bob', clientId: 'c-g1-1', body: 'Привет, команда', createdAt: '2026-10-15T10:00:00.000Z' };
const CHATS = [
  { id: 'g1', type: 'group', title: 'Команда', lastSeq: 1, lastMessage: first, unreadCount: 0 },
  { id: 'g2', type: 'group', title: 'Друзья', lastSeq: 0, lastMessage: null, unreadCount: 0 },
];
const dto = (chat) => ({ id: chat.id, type: 'group', title: chat.title, lastSeq: chat.lastSeq, members: [BOB] });

// Состояние «сервера» меняется по ходу теста: chats — ответ GET /api/chats, messages — история по чатам (since фильтрует).
const createServer = () => ({
  chats: CHATS.map((chat) => ({ ...chat })),
  messages: { g1: [first], g2: [] },
});

const mockRest = async (page, server) => {
  await page.route('**/api/chats', (route) => route.fulfill({ json: server.chats }));
  await page.route('**/api/chats/*', (route) => route.fulfill({ json: dto(server.chats.find((chat) => route.request().url().endsWith(`/${chat.id}`))) }));
  await page.route('**/api/chats/*/messages**', (route) => {
    const url = new URL(route.request().url());
    const chatId = url.pathname.split('/')[3];
    const since = Number(url.searchParams.get('since') ?? 0);
    route.fulfill({ json: server.messages[chatId].filter((m) => m.seq > since) });
  });
};

// Подключает подмену сокетов, открывает приложение и входит; возвращает управление сокетом приложения.
const openApp = async (page, server = createServer()) => {
  const sockets = [];
  await page.routeWebSocket(/\/ws$/, (ws) => sockets.push(ws));
  await mockRest(page, server);
  await page.goto('/');
  await expect(signInControl(page)).toBeVisible();
  const beforeLogin = sockets.length;
  await signIn(page);
  await expect(userMenuButton(page)).toBeVisible();
  await expect.poll(() => sockets.length).toBeGreaterThan(beforeLogin);
  const appSockets = () => sockets.slice(beforeLogin);
  const current = () => appSockets()[appSockets().length - 1];
  return {
    appSocketCount: () => appSockets().length,
    send: (type, payload) => current().send(JSON.stringify({ type, payload })),
    close: (code) => current().close({ code, reason: 'test' }),
  };
};

const message = (chatId, seq, body) => ({ chatId, seq, senderId: 'u-bob', clientId: `c-${chatId}-${seq}`, body, createdAt: '2026-10-17T10:00:00.000Z' });

test('[UC-MSG-06] сообщение от другого человека появляется в открытом чате и в списке без перезагрузки, в неоткрытом растёт счётчик', async ({ page }) => {
  const socket = await openApp(page);
  await page.locator('.chat', { hasText: 'Команда' }).click();
  await expect(page.locator('.dialog__message')).toHaveCount(1);

  socket.send('message.new', message('g1', 2, 'Новость из сокета'));

  await expect(page.locator('.dialog__message')).toHaveCount(2);
  await expect(page.locator('.dialog__message').last()).toContainText('Новость из сокета');
  await expect(page.locator('.chat', { hasText: 'Команда' }).locator('.chat__last-message')).toHaveText('Новость из сокета');
  await expect(page.locator('.chat', { hasText: 'Команда' }).getByTestId('chat-unread')).toHaveCount(0);

  socket.send('message.new', message('g2', 1, 'Привет, друзья'));
  await expect(page.locator('.chat', { hasText: 'Друзья' }).getByTestId('chat-unread')).toHaveText('1');
  socket.send('message.new', message('g2', 2, 'Как дела?'));
  await expect(page.locator('.chat', { hasText: 'Друзья' }).getByTestId('chat-unread')).toHaveText('2');
  await expect(page.locator('.chat', { hasText: 'Друзья' }).locator('.chat__last-message')).toHaveText('Как дела?');

  socket.send('message.new', message('g2', 2, 'Как дела?'));
  socket.send('message.new', message('g2', 3, 'Третье'));
  await expect(page.locator('.chat', { hasText: 'Друзья' }).getByTestId('chat-unread')).toHaveText('3');
  await expect(page.locator('.chat', { hasText: 'Друзья' }).locator('.chat__last-message')).toHaveText('Третье');
});

test('вытеснение лимитом вкладок (4008): баннер с кнопкой «Подключиться», по клику сокет открывается снова', async ({ page }) => {
  const socket = await openApp(page);
  await expect(page.getByText('Соединение занято в другой вкладке')).toHaveCount(0);

  socket.close(4008);

  await expect(page.getByText('Соединение занято в другой вкладке')).toBeVisible();
  const countBefore = socket.appSocketCount();

  await page.getByRole('button', { name: 'Подключиться' }).click();

  await expect(page.getByText('Соединение занято в другой вкладке')).toHaveCount(0);
  await expect.poll(() => socket.appSocketCount()).toBe(countBefore + 1);
});

test('[UC-MSG-09] после обрыва связи пропущенные сообщения появляются сами: по порядку, без дублей, список чатов обновлён', async ({ page }) => {
  const server = createServer();
  const socket = await openApp(page, server);
  await page.locator('.chat', { hasText: 'Команда' }).click();
  await expect(page.locator('.dialog__message')).toHaveCount(1);
  const countBefore = socket.appSocketCount();

  // Пока связи нет, другой пользователь пишет в открытый чат и в неоткрытый.
  const missed = [message('g1', 2, 'Пропущено раз'), message('g1', 3, 'Пропущено два')];
  server.messages.g1.push(...missed);
  server.chats[0] = { ...server.chats[0], lastSeq: 3, lastMessage: missed[1], unreadCount: 2 };
  server.messages.g2.push(message('g2', 1, 'Привет, друзья'), message('g2', 2, 'Вы тут?'));
  server.chats[1] = { ...server.chats[1], lastSeq: 2, lastMessage: server.messages.g2[1], unreadCount: 2 };
  socket.close(1006);

  await expect.poll(() => socket.appSocketCount()).toBe(countBefore + 1);

  await expect(page.locator('.dialog__message')).toHaveCount(3);
  await expect(page.locator('.dialog__message').nth(1)).toContainText('Пропущено раз');
  await expect(page.locator('.dialog__message').nth(2)).toContainText('Пропущено два');
  await expect(page.locator('.chat', { hasText: 'Команда' }).locator('.chat__last-message')).toHaveText('Пропущено два');
  await expect(page.locator('.chat', { hasText: 'Команда' }).getByTestId('chat-unread')).toHaveCount(0);
  await expect(page.locator('.chat', { hasText: 'Друзья' }).locator('.chat__last-message')).toHaveText('Вы тут?');
  await expect(page.locator('.chat', { hasText: 'Друзья' }).getByTestId('chat-unread')).toHaveText('2');

  // Повторное событие того же сообщения дублей не создаёт.
  socket.send('message.new', missed[1]);
  await expect(page.locator('.dialog__message')).toHaveCount(3);
});
