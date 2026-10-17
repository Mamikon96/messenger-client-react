const { test, expect } = require('@playwright/test');
const { login, sessionUserId } = require('./helpers/auth');

// Серверный чат g1 с одним сообщением Боба; POST /api/chats/g1/messages мокается через page.route.
const BOB = { userId: 'u-bob', name: 'Боб Собеседник', avatarUrl: '', role: 'member' };
const history = [{ chatId: 'g1', seq: 1, senderId: 'u-bob', clientId: 'c-g1-1', body: 'Привет, команда', createdAt: '2026-10-15T10:00:00.000Z' }];
const CHAT = { id: 'g1', type: 'group', title: 'Команда', lastSeq: 1, lastMessage: history[0], unreadCount: 0 };
const CHAT_DTO = { id: 'g1', type: 'group', title: 'Команда', lastSeq: 1, members: [BOB] };

// postHandler(route, request) отвечает на отправку; возвращает список полученных POST-тел.
const mockServer = async (page, postHandler) => {
  const posts = [];
  await page.route('**/api/chats', (route) => route.fulfill({ json: [CHAT] }));
  await page.route('**/api/chats/*', (route) => route.fulfill({ json: CHAT_DTO }));
  await page.route('**/api/chats/*/messages**', (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: history });
    const data = route.request().postDataJSON();
    posts.push(data);
    return postHandler(route, data);
  });
  return posts;
};

const created = async (page, data, seq = 2) => ({
  status: 201,
  json: { chatId: 'g1', seq, senderId: await sessionUserId(page), clientId: data.clientId, body: data.body, createdAt: '2026-10-15T10:01:00.000Z' },
});

const openChat = async (page) => {
  await login(page);
  await page.locator('.chat', { hasText: 'Команда' }).click();
  await expect(page.locator('.dialog__message')).toHaveCount(1);
};

const messages = (page) => page.locator('.dialog__message');
const own = (page) => messages(page).last();

// Прокручивает время приложения, пока не появится красный треугольник: автоповторы идут с паузой 1/2/4 с.
const waitFailed = async (page) => {
  const retry = own(page).getByRole('button', { name: 'Не отправлено. Повторить' });
  await expect.poll(async () => {
    await page.clock.runFor(1000);
    return retry.count();
  }, { timeout: 15000 }).toBe(1);
  return retry;
};

// Сценарий UC-MSG-05; activate нажимает на красный треугольник мышью или с клавиатуры.
const runRetryScenario = async (page, activate) => {
  await page.clock.install();
  let online = false;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const posts = await mockServer(page, async (route, data) => {
    if (!online) return route.abort('failed');
    await gate;
    return route.fulfill(await created(page, data));
  });
  await openChat(page);

  await page.getByLabel('Сообщение').fill('Нужно доставить');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(own(page)).toContainText('Нужно доставить');
  await expect(own(page).getByRole('img', { name: 'Отправляется' })).toBeVisible();

  const retry = await waitFailed(page);
  await expect(retry).toBeVisible();
  await expect(own(page).getByRole('img', { name: 'Отправляется' })).toHaveCount(0);

  online = true;
  const attempts = posts.length;
  await activate(retry);
  await expect(own(page).getByRole('img', { name: 'Отправляется' })).toBeVisible();
  await expect(own(page).getByRole('button', { name: 'Не отправлено. Повторить' })).toHaveCount(0);
  release();

  await expect(own(page).getByRole('img', { name: 'Отправлено' })).toBeVisible();
  await expect(messages(page)).toHaveCount(2);
  await expect(messages(page).filter({ hasText: 'Нужно доставить' })).toHaveCount(1);
  expect(new Set(posts.map((post) => post.clientId)).size).toBe(1);
  expect(posts.length).toBe(attempts + 1);
};

test('[UC-MSG-05] обрыв связи: часы → красный треугольник → часы → галочка, нажатие мышью, сообщение одно', async ({ page }) => {
  await runRetryScenario(page, (retry) => retry.click());
  await expect(messages(page)).toHaveCount(2);
});

test('[UC-MSG-05] красный треугольник повторяет отправку с клавиатуры (Enter)', async ({ page }) => {
  await runRetryScenario(page, async (retry) => {
    await retry.focus();
    await page.keyboard.press('Enter');
  });
  await expect(own(page).getByRole('img', { name: 'Отправлено' })).toBeVisible();
});

test('[UC-MSG-08] длиннее 4000 символов: счётчик «N / 4000», Send и Enter не отправляют, после сокращения уходит', async ({ page }) => {
  const posts = await mockServer(page, async (route, data) => route.fulfill(await created(page, data)));
  await openChat(page);
  const field = page.getByLabel('Сообщение');

  await field.fill('а'.repeat(4001));
  await expect(page.getByText('4001 / 4000')).toBeVisible();
  await page.getByRole('button', { name: 'Send' }).click();
  await field.press('Enter');
  await expect(messages(page)).toHaveCount(1);
  expect(posts).toHaveLength(0);
  await expect(field).toHaveValue('а'.repeat(4001));

  await field.fill('а'.repeat(4000));
  await expect(page.getByText(/\/ 4000/)).toHaveCount(0);
  await field.press('Enter');

  await expect(messages(page)).toHaveCount(2);
  await expect(own(page).getByRole('img', { name: 'Отправлено' })).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(posts[0].body).toBe('а'.repeat(4000));
});
