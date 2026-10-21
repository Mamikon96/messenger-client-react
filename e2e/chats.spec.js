const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');
const { BOB, CAROL, mockPeopleServer, openDirectChat } = require('./helpers/people');

test('[UC-CHAT-02] выбор чата открывает его диалог и подсвечивает его в списке', async ({ page }) => {
  await mockPeopleServer(page);
  await login(page);
  await openDirectChat(page, BOB);
  await openDirectChat(page, CAROL);

  await page.locator('.chat', { hasText: BOB.name }).click();
  await expect(page.locator('.dialog__header-title')).toHaveText(BOB.name);
  await expect(page.locator('.chat._active')).toHaveCount(1);
  await expect(page.locator('.chat._active')).toContainText(BOB.name);

  await page.locator('.chat', { hasText: CAROL.name }).click();
  await expect(page.locator('.dialog__header-title')).toHaveText(CAROL.name);
  await expect(page.locator('.chat._active')).toContainText(CAROL.name);
});

const message = (chatId, seq, body) => ({
  chatId,
  seq,
  senderId: 'u-bob',
  clientId: `c-${chatId}-${seq}`,
  body,
  createdAt: '2026-10-15T10:00:00.000Z',
});

const SERVER_CHATS = [
  { id: 'g1', type: 'group', title: 'Команда', lastSeq: 5, lastMessage: message('g1', 5, 'Всем привет'), unreadCount: 3 },
  {
    id: 'd1',
    type: 'direct',
    title: null,
    lastSeq: 2,
    lastMessage: message('d1', 2, 'Как дела?'),
    unreadCount: 0,
    peer: { id: 'u-bob', name: 'Боб Собеседник', avatarUrl: '' },
  },
  { id: 'g2', type: 'group', title: 'Тихий чат', lastSeq: 0, lastMessage: null, unreadCount: 0 },
];

test('[UC-CHAT-03] чаты с сервера: порядок сервера, имя собеседника у direct, число непрочитанных только при > 0', async ({ page }) => {
  await page.route('**/api/chats', (route) => route.fulfill({ json: SERVER_CHATS }));
  await login(page);

  const chats = page.locator('.chat');
  await expect(chats).toHaveCount(3);
  await expect(chats.nth(0)).toContainText('Команда');
  await expect(chats.nth(0)).toContainText('Всем привет');
  await expect(chats.nth(0).locator('.chat__unread')).toHaveText('3');
  await expect(chats.nth(1)).toContainText('Боб Собеседник');
  await expect(chats.nth(1)).toContainText('Как дела?');
  await expect(chats.nth(1).locator('.chat__unread')).toHaveCount(0);
  await expect(chats.nth(2)).toContainText('Тихий чат');
  await expect(chats.nth(2).locator('.chat__unread')).toHaveCount(0);
  await expect(page.getByText('Загрузка чатов…')).toHaveCount(0);
  await expect(page.getByText('Чатов пока нет')).toHaveCount(0);
});

test('[UC-CHAT-03] пока список загружается, виден индикатор «Загрузка чатов…»', async ({ page }) => {
  let release;
  const released = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/chats', async (route) => {
    await released;
    await route.fulfill({ json: SERVER_CHATS });
  });
  await login(page);

  await expect(page.getByText('Загрузка чатов…')).toBeVisible();
  release();
  await expect(page.locator('.chat')).toHaveCount(3);
  await expect(page.getByText('Загрузка чатов…')).toHaveCount(0);
});

test('[UC-CHAT-03] сбой загрузки: сообщение и «Повторить», после которого список загружается', async ({ page }) => {
  let fail = true;
  await page.route('**/api/chats', (route) => (fail ? route.fulfill({ status: 500, json: { error: { code: 'internal' } } }) : route.fulfill({ json: SERVER_CHATS })));
  await login(page);

  await expect(page.getByText('Не удалось загрузить чаты.')).toBeVisible();
  await expect(page.locator('.chat')).toHaveCount(0);

  fail = false;
  await page.getByRole('button', { name: 'Повторить' }).click();

  await expect(page.locator('.chat')).toHaveCount(3);
  await expect(page.getByText('Не удалось загрузить чаты.')).toHaveCount(0);
});

test('[UC-CHAT-03] пустой список: «Чатов пока нет»', async ({ page }) => {
  await login(page);

  await expect(page.getByText('Чатов пока нет')).toBeVisible();
  await expect(page.locator('.chat')).toHaveCount(0);
});

test('[UC-CHAT-02] карточка чата без блока «Members» и доступна с клавиатуры: фокус и открытие по Enter', async ({ page }) => {
  await page.route('**/api/chats', (route) => route.fulfill({ json: SERVER_CHATS }));
  await login(page);

  const first = page.getByRole('button', { name: /^Команда/ });
  await expect(page.locator('button.chat')).toHaveCount(3);
  await expect(page.getByText('Members')).toHaveCount(0);

  await first.focus();
  await expect(first).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(first).toHaveClass(/_active/);
  await expect(first).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.dialog__header-title')).toHaveText('Команда');
});
