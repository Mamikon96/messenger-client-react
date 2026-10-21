const { test, expect } = require('@playwright/test');
const { login, MOCK_USER_NAME, sessionUserId } = require('./helpers/auth');
const { BOB, CAROL } = require('./helpers/people');

// Сервер группы в памяти страницы: список из одной группы, карточка, история и приглашение.
// meRole — роль вошедшего; members — id приглашённых; postRequests — тела POST members; postStatus — статус ответа
// (204 по умолчанию; 409 добавляет участника, как сервер), postDelayMs — задержка ответа.
const mockGroupServer = async (page, { meRole = 'owner', initial = [] } = {}) => {
  const server = { meRole, members: [...initial], postRequests: [], postStatus: 204, postDelayMs: 0 };
  const people = [BOB, CAROL];
  let meIdPromise;
  const getMeId = () => (meIdPromise ||= sessionUserId(page));
  const dto = async () => ({
    id: 'g1',
    type: 'group',
    title: 'Команда',
    lastSeq: 0,
    members: [
      { userId: await getMeId(), name: MOCK_USER_NAME, avatarUrl: '', role: server.meRole },
      ...server.members.map((id) => ({ userId: id, name: people.find((p) => p.id === id).name, avatarUrl: '', role: 'member' })),
    ],
  });

  await page.route(/\/api\/(users|chats)(\/|\?|$)/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[1] === 'users') {
      const q = url.searchParams.get('q');
      return route.fulfill({ json: people.filter(({ name }) => name.toLowerCase().includes(q.toLowerCase())) });
    }
    if (parts.length === 2) return route.fulfill({ json: [{ id: 'g1', type: 'group', title: 'Команда', lastSeq: 0, lastMessage: null, unreadCount: 0 }] });
    if (parts.length === 3) return route.fulfill({ json: await dto() });
    if (parts[3] === 'messages') return route.fulfill({ json: { messages: [], hasMore: false } });
    if (parts[3] === 'members' && request.method() === 'POST') {
      const { userId } = request.postDataJSON();
      server.postRequests.push(userId);
      if (server.postDelayMs) await new Promise((resolve) => setTimeout(resolve, server.postDelayMs));
      if (server.postStatus === 204 || server.postStatus === 409) {
        if (!server.members.includes(userId)) server.members.push(userId);
      }
      if (server.postStatus === 204) return route.fulfill({ status: 204 });
      return route.fulfill({ status: server.postStatus, json: { error: { code: server.postStatus === 409 ? 'already_member' : 'x' } } });
    }
    return route.fulfill({ status: 404, json: { error: { code: 'not_found' } } });
  });
  return server;
};

const openGroup = async (page) => {
  await login(page);
  await page.locator('.chat', { hasText: 'Команда' }).click();
  await expect(page.locator('.dialog__header-title')).toHaveText('Команда');
};

const inviteButton = (page) => page.getByRole('button', { name: 'Пригласить', exact: true });
const inviteAction = (page, person) => page.getByRole('button', { name: `Пригласить ${person.name}`, exact: true });

const invitedAction = (page, person) => page.getByRole('button', { name: `Пригласить ${person.name}: уже в чате`, exact: true });

const openInvite = async (page, query) => {
  await inviteButton(page).click();
  await page.getByRole('dialog').getByLabel('Поиск людей').fill(query);
};

test('[UC-CHAT-01] owner: «Пригласить» открывает окно, действие строки добавляет человека, число участников растёт', async ({ page }) => {
  const server = await mockGroupServer(page);
  await openGroup(page);
  await expect(page.locator('.dialog__header-meta')).toHaveText('1 участник');

  await openInvite(page, 'Боб');
  const dialog = page.getByRole('dialog', { name: 'Пригласить в группу' });
  await expect(dialog).toBeVisible();
  await inviteAction(page, BOB).click();

  await expect(invitedAction(page, BOB)).toBeDisabled();
  expect(server.postRequests).toEqual([BOB.id]);
  await expect(page.locator('.dialog__header-meta')).toHaveText('2 участника');
});

test('[UC-CHAT-01] участники группы в результатах поиска — «уже в чате», кнопка недоступна', async ({ page }) => {
  await mockGroupServer(page, { initial: [BOB.id] });
  await openGroup(page);

  await openInvite(page, 'Боб');

  await expect(invitedAction(page, BOB)).toBeDisabled();
});

test('[UC-CHAT-02] не owner кнопку «Пригласить» не видит', async ({ page }) => {
  await mockGroupServer(page, { meRole: 'member' });
  await openGroup(page);
  await expect(page.locator('.dialog__header-meta')).toHaveText('1 участник');

  await expect(inviteButton(page)).toHaveCount(0);
});

test('[UC-CHAT-01] окно: Esc закрывает его и возвращает фокус на «Пригласить»', async ({ page }) => {
  await mockGroupServer(page);
  await openGroup(page);

  await inviteButton(page).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByLabel('Поиск людей')).toBeFocused();
  await page.keyboard.press('Escape');

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(inviteButton(page)).toBeFocused();
});

test('[UC-CHAT-01] двойной клик по «Пригласить <имя>» шлёт один запрос', async ({ page }) => {
  const server = await mockGroupServer(page);
  server.postDelayMs = 500;
  await openGroup(page);

  await openInvite(page, 'Боб');
  await inviteAction(page, BOB).dblclick();

  await expect(invitedAction(page, BOB)).toBeDisabled();
  expect(server.postRequests).toHaveLength(1);
});

test('[UC-CHAT-01] 409 already_member считается успехом', async ({ page }) => {
  const server = await mockGroupServer(page);
  server.postStatus = 409;
  await openGroup(page);

  await openInvite(page, 'Боб');
  await inviteAction(page, BOB).click();

  await expect(invitedAction(page, BOB)).toBeDisabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

for (const [status, text] of [
  [403, 'Приглашать может только владелец группы.'],
  [404, 'Группа или человек не найдены.'],
  [400, 'В группе не больше 100 участников.'],
  [500, 'Не удалось пригласить.'],
]) {
  test(`[UC-CHAT-01] ошибка ${status} показывает «${text}»`, async ({ page }) => {
    const server = await mockGroupServer(page);
    server.postStatus = status;
    await openGroup(page);

    await openInvite(page, 'Боб');
    await inviteAction(page, BOB).click();

    await expect(page.getByRole('alert').filter({ hasText: text })).toBeVisible();
    await expect(inviteAction(page, BOB)).toBeEnabled();
  });
}
