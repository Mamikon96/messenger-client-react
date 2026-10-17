const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');

const message = (chatId, seq, senderId, body) => ({
  chatId,
  seq,
  senderId,
  clientId: `c-${chatId}-${seq}`,
  body,
  createdAt: '2026-10-15T10:00:00.000Z',
});

const SERVER_CHATS = [
  { id: 'g1', type: 'group', title: 'Команда', lastSeq: 2, lastMessage: message('g1', 2, 'u-bob', 'Как дела'), unreadCount: 0 },
  {
    id: 'd1',
    type: 'direct',
    title: null,
    lastSeq: 1,
    lastMessage: message('d1', 1, 'u-bob', 'Привет, личка'),
    unreadCount: 0,
    peer: { id: 'u-bob', name: 'Боб Собеседник', avatarUrl: '' },
  },
];

const GROUP_DTO = {
  id: 'g1',
  type: 'group',
  title: 'Команда',
  lastSeq: 2,
  members: [
    { userId: 'u-alice', name: 'Alice Tester', avatarUrl: '', role: 'owner' },
    { userId: 'u-bob', name: 'Боб Собеседник', avatarUrl: '', role: 'member' },
  ],
};

const DIRECT_DTO = {
  id: 'd1',
  type: 'direct',
  title: null,
  lastSeq: 1,
  members: [{ userId: 'u-bob', name: 'Боб Собеседник', avatarUrl: '', role: 'member' }],
};

// Сообщения чатов: g1 — от Боба, d1 — от Боба; мок-сервер отдаёт чаты и историю.
const mockServer = async (page, { messagesHandler } = {}) => {
  const requests = { chat: [], messages: [] };
  await page.route('**/api/chats', (route) => route.fulfill({ json: SERVER_CHATS }));
  await page.route('**/api/chats/*', (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop();
    requests.chat.push(id);
    return route.fulfill({ json: id === 'g1' ? GROUP_DTO : DIRECT_DTO });
  });
  await page.route('**/api/chats/*/messages**', (route) => {
    const id = new URL(route.request().url()).pathname.split('/')[3];
    requests.messages.push(id);
    if (messagesHandler) return messagesHandler(route, id);
    return route.fulfill({
      json: id === 'g1'
        ? [message('g1', 1, 'u-bob', 'Привет, команда'), message('g1', 2, 'u-bob', 'Как дела')]
        : [message('d1', 1, 'u-bob', 'Привет, личка')],
    });
  });
  return requests;
};

test('[UC-CHAT-02] открытие группы с сервера: название, история и имя автора чужих сообщений', async ({ page }) => {
  await mockServer(page);
  await login(page);

  await page.locator('.chat', { hasText: 'Команда' }).click();

  await expect(page.locator('.dialog__header-title')).toHaveText('Команда');
  await expect(page.locator('.dialog__message')).toHaveCount(2);
  await expect(page.locator('.dialog__message').first()).toContainText('Привет, команда');
  await expect(page.locator('.dialog__message').first()).toContainText('Боб Собеседник');
});

test('[UC-CHAT-02] у direct-чата заголовок — имя собеседника, имя автора у сообщений не дублируется', async ({ page }) => {
  await mockServer(page);
  await login(page);

  await page.locator('.chat', { hasText: 'Боб Собеседник' }).click();

  await expect(page.locator('.dialog__header-title')).toHaveText('Боб Собеседник');
  await expect(page.locator('.dialog__message')).toHaveCount(1);
  await expect(page.locator('.dialog__message')).toHaveText('Привет, личка');
});

test('[UC-CHAT-02] пока история грузится, виден индикатор «Загрузка сообщений…»', async ({ page }) => {
  let release;
  const released = new Promise((resolve) => { release = resolve; });
  await mockServer(page, {
    messagesHandler: async (route) => {
      await released;
      await route.fulfill({ json: [message('g1', 1, 'u-bob', 'Привет, команда')] });
    },
  });
  await login(page);

  await page.locator('.chat', { hasText: 'Команда' }).click();
  await expect(page.getByText('Загрузка сообщений…')).toBeVisible();
  release();

  await expect(page.locator('.dialog__message')).toHaveCount(1);
  await expect(page.getByText('Загрузка сообщений…')).toHaveCount(0);
});

test('[UC-CHAT-02] сбой загрузки истории: сообщение и «Повторить», после которого сообщения загружаются', async ({ page }) => {
  let fail = true;
  await mockServer(page, {
    messagesHandler: (route) => (fail
      ? route.fulfill({ status: 500, json: { error: { code: 'internal' } } })
      : route.fulfill({ json: [message('g1', 1, 'u-bob', 'Привет, команда')] })),
  });
  await login(page);

  await page.locator('.chat', { hasText: 'Команда' }).click();
  await expect(page.getByText('Не удалось загрузить сообщения.')).toBeVisible();
  await expect(page.locator('.dialog__message')).toHaveCount(0);

  fail = false;
  await page.getByRole('button', { name: 'Повторить' }).click();

  await expect(page.locator('.dialog__message')).toHaveCount(1);
  await expect(page.getByText('Не удалось загрузить сообщения.')).toHaveCount(0);
});

test('[UC-CHAT-02] повторное открытие загруженного чата не делает новых запросов', async ({ page }) => {
  const requests = await mockServer(page);
  await login(page);

  await page.locator('.chat', { hasText: 'Команда' }).click();
  await expect(page.locator('.dialog__message')).toHaveCount(2);
  await page.locator('.chat', { hasText: 'Боб Собеседник' }).click();
  await expect(page.locator('.dialog__message')).toHaveCount(1);
  await page.locator('.chat', { hasText: 'Команда' }).click();

  await expect(page.locator('.dialog__message')).toHaveCount(2);
  expect(requests.chat.filter((id) => id === 'g1')).toHaveLength(1);
  expect(requests.messages.filter((id) => id === 'g1')).toHaveLength(1);
});

test('[UC-MSG-01] отправка в серверном чате после загрузки истории добавляет сообщение в конец', async ({ page }) => {
  await mockServer(page);
  await login(page);

  await page.locator('.chat', { hasText: 'Команда' }).click();
  await expect(page.locator('.dialog__message')).toHaveCount(2);
  await page.getByLabel('Сообщение').fill('Моё');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.locator('.dialog__message')).toHaveCount(3);
  await expect(page.locator('.dialog__message').last()).toHaveText('Моё');
});
