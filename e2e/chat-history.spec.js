const { test, expect } = require('@playwright/test');
const { login, sessionUserId } = require('./helpers/auth');

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
  await page.route('**/api/chats/*/messages**', async (route) => {
    if (route.request().method() === 'POST') {
      const { clientId, body } = route.request().postDataJSON();
      const chatId = new URL(route.request().url()).pathname.split('/')[3];
      const senderId = await sessionUserId(page);
      return route.fulfill({ status: 201, json: { ...message(chatId, 3, senderId, body), clientId } });
    }
    const id = new URL(route.request().url()).pathname.split('/')[3];
    requests.messages.push(id);
    if (messagesHandler) return messagesHandler(route, id);
    return route.fulfill({
      json: {
        messages: id === 'g1'
          ? [message('g1', 1, 'u-bob', 'Привет, команда'), message('g1', 2, 'u-bob', 'Как дела')]
          : [message('d1', 1, 'u-bob', 'Привет, личка')],
        hasMore: false,
      },
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
      await route.fulfill({ json: { messages: [message('g1', 1, 'u-bob', 'Привет, команда')], hasMore: false } });
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
      : route.fulfill({ json: { messages: [message('g1', 1, 'u-bob', 'Привет, команда')], hasMore: false } })),
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
  await expect(page.locator('.dialog__message').last().getByRole('img', { name: 'Отправлено' })).toBeVisible();
});

// Длинная история группы g1: сообщения 1..100, страница — 50; сервер отдаёт последние до `before` (не включая).
const longHistoryHandler = ({ failOlder = () => false, total = 100 } = {}) => (route) => {
  const before = Number(new URL(route.request().url()).searchParams.get('before') ?? total + 1);
  if (before <= 51 && failOlder()) return route.fulfill({ status: 500, json: { error: { code: 'internal' } } });
  const older = Array.from({ length: total }, (_, i) => i + 1).filter((seq) => seq < before);
  const seqs = older.slice(-50);
  return route.fulfill({ json: { messages: seqs.map((seq) => message('g1', seq, 'u-bob', `Сообщение ${seq}`)), hasMore: older.length > seqs.length } });
};

// Пузырь сообщения по номеру (в группе внутри ещё имя автора, поэтому точное совпадение текста не подходит).
const bubble = (page, seq) => page.locator('.dialog__message').filter({ hasText: new RegExp(`Сообщение ${seq}$`) });

const openLongHistory = async (page, options = {}) => {
  const requests = await mockServer(page, { messagesHandler: longHistoryHandler(options) });
  await login(page);
  await page.locator('.chat', { hasText: 'Команда' }).click();
  await expect(bubble(page, options.total ?? 100)).toBeVisible();
  return requests;
};

test('[UC-MSG-04] длинная история: лента открывается внизу, прокрутка вверх подгружает старые без прыжка позиции', async ({ page }) => {
  await openLongHistory(page);
  const log = page.getByRole('log', { name: 'Сообщения' });
  await expect(page.locator('.dialog__message')).toHaveCount(50);

  await log.evaluate((el) => { el.scrollTop = 0; });

  await expect(page.locator('.dialog__message')).toHaveCount(100);
  const anchor = bubble(page, 51);
  // Сообщение 51 было самым верхним: после подкачки остаётся у верхнего края окна, а не уезжает в начало истории.
  const offset = await anchor.evaluate((el) => el.getBoundingClientRect().top - el.closest('[role="log"]').getBoundingClientRect().top);
  expect(Math.abs(offset)).toBeLessThan(80);
  expect(await log.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});

test('[UC-MSG-04] конец истории: после подкачки неполной страницы новых запросов при прокрутке вверх нет', async ({ page }) => {
  const requests = await openLongHistory(page, { total: 75 });
  const log = page.getByRole('log', { name: 'Сообщения' });

  await log.evaluate((el) => { el.scrollTop = 0; });
  await expect(page.locator('.dialog__message')).toHaveCount(75);
  const calls = requests.messages.length;
  await log.evaluate((el) => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')); });

  // Дымовая проверка: отрицательный результат нельзя дождаться; точная проверка остановки — в unit-тестах Dialog.
  await page.waitForTimeout(300);
  expect(requests.messages).toHaveLength(calls);
  await expect(page.getByText('Загрузка старых сообщений…')).toHaveCount(0);
});

test('[UC-MSG-04] сбой подкачки: сообщение и «Повторить», после которого старые сообщения появляются', async ({ page }) => {
  let fail = true;
  await openLongHistory(page, { failOlder: () => fail });
  const log = page.getByRole('log', { name: 'Сообщения' });

  await log.evaluate((el) => { el.scrollTop = 0; });
  await expect(page.getByText('Не удалось загрузить старые сообщения.')).toBeVisible();
  await expect(page.locator('.dialog__message')).toHaveCount(50);

  fail = false;
  await page.getByRole('button', { name: 'Повторить' }).click();

  await expect(page.locator('.dialog__message')).toHaveCount(100);
  await expect(page.getByText('Не удалось загрузить старые сообщения.')).toHaveCount(0);
});
