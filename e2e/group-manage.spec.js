const { test, expect } = require('@playwright/test');
const { login, MOCK_USER_NAME, sessionUserId } = require('./helpers/auth');
const { BOB } = require('./helpers/people');

// Сервер группы в памяти страницы: список из одной группы, карточка, история, PATCH названия и DELETE участника.
// meRole — роль вошедшего; title/members — текущее состояние (меняется ответами сервера); patchRequests — тела PATCH,
// deleteRequests — id удалённых; patchStatus и deleteStatus — статус ответа (по умолчанию успех).
const mockGroupServer = async (page, { meRole = 'owner' } = {}) => {
  const server = { meRole, title: 'Команда', bobIn: true, patchRequests: [], deleteRequests: [], patchStatus: 200, deleteStatus: 204 };
  let meIdPromise;
  const getMeId = () => (meIdPromise ||= sessionUserId(page));
  const dto = async () => ({
    id: 'g1',
    type: 'group',
    title: server.title,
    lastSeq: 0,
    members: [
      { userId: await getMeId(), name: MOCK_USER_NAME, avatarUrl: '', role: server.meRole },
      ...(server.bobIn ? [{ userId: BOB.id, name: BOB.name, avatarUrl: '', role: server.meRole === 'owner' ? 'member' : 'owner' }] : []),
    ],
  });
  const fail = (route, status) => route.fulfill({ status, json: { error: { code: 'x' } } });

  await page.route(/\/api\/chats(\/|\?|$)/, async (route) => {
    const request = route.request();
    const method = request.method();
    const parts = new URL(request.url()).pathname.split('/').filter(Boolean);
    if (parts.length === 2) return route.fulfill({ json: [{ id: 'g1', type: 'group', title: server.title, lastSeq: 0, lastMessage: null, unreadCount: 0 }] });
    if (parts.length === 3 && method === 'GET') return route.fulfill({ json: await dto() });
    if (parts.length === 3 && method === 'PATCH') {
      server.patchRequests.push(request.postDataJSON().title);
      if (server.patchStatus !== 200) return fail(route, server.patchStatus);
      server.title = request.postDataJSON().title;
      return route.fulfill({ json: await dto() });
    }
    if (parts[3] === 'messages') return route.fulfill({ json: { messages: [], hasMore: false } });
    if (parts[3] === 'members' && method === 'DELETE') {
      server.deleteRequests.push(parts[4]);
      if (server.deleteStatus !== 204) return fail(route, server.deleteStatus);
      if (parts[4] === BOB.id) server.bobIn = false;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ status: 404, json: { error: { code: 'not_found' } } });
  });
  return server;
};

const openGroup = async (page) => {
  await login(page);
  await page.locator('.chat', { hasText: 'Команда' }).click();
  await expect(page.locator('.dialog__header-title')).toHaveText('Команда');
  await expect(page.locator('.dialog__header-meta')).not.toHaveText('');
};

const manageButton = (page) => page.getByRole('button', { name: 'Управление группой', exact: true });
const modal = (page) => page.getByRole('dialog', { name: 'Управление группой' });

const openManage = async (page) => {
  await manageButton(page).click();
  await expect(modal(page)).toBeVisible();
};

test('owner: «Сохранить» переименовывает группу в шапке и в списке чатов', async ({ page }) => {
  const server = await mockGroupServer(page);
  await openGroup(page);
  await openManage(page);

  await modal(page).getByLabel('Название группы').fill('  Новая команда  ');
  await modal(page).getByRole('button', { name: 'Сохранить' }).click();

  await expect(page.locator('.dialog__header-title')).toHaveText('Новая команда');
  await expect(page.locator('.chat', { hasText: 'Новая команда' })).toBeVisible();
  expect(server.patchRequests).toEqual(['Новая команда']);
});

test('owner: «Убрать <имя>» убирает участника, число участников уменьшается', async ({ page }) => {
  const server = await mockGroupServer(page);
  await openGroup(page);
  await expect(page.locator('.dialog__header-meta')).toHaveText('2 участника');
  await openManage(page);

  await modal(page).getByRole('button', { name: `Убрать ${BOB.name}`, exact: true }).click();

  await expect(page.locator('.dialog__header-meta')).toHaveText('1 участник');
  await expect(modal(page).getByRole('button', { name: `Убрать ${BOB.name}` })).toHaveCount(0);
  expect(server.deleteRequests).toEqual([BOB.id]);
  await expect(modal(page).getByRole('button', { name: 'Выйти из группы' })).toHaveCount(0);
});

test('не owner: «Выйти из группы» убирает чат из списка и сбрасывает активный чат', async ({ page }) => {
  const server = await mockGroupServer(page, { meRole: 'member' });
  await openGroup(page);
  await openManage(page);
  await expect(modal(page).getByLabel('Название группы')).toHaveCount(0);
  await expect(modal(page).getByRole('button', { name: /^Убрать/ })).toHaveCount(0);

  await modal(page).getByRole('button', { name: 'Выйти из группы' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.chat', { hasText: 'Команда' })).toHaveCount(0);
  await expect(page.getByText('Чат не выбран')).toBeVisible();
  expect(server.deleteRequests).toEqual([await sessionUserId(page)]);
});

test('окно: Esc закрывает его и возвращает фокус на «Управление группой»', async ({ page }) => {
  await mockGroupServer(page);
  await openGroup(page);

  await openManage(page);
  await page.keyboard.press('Escape');

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(manageButton(page)).toBeFocused();
});

for (const [status, text] of [
  [403, 'Переименовать может только владелец группы.'],
  [404, 'Группа не найдена.'],
  [400, 'Название не подходит. Измените его и повторите.'],
  [500, 'Не удалось сохранить название.'],
]) {
  test(`переименование: ошибка ${status} показывает «${text}»`, async ({ page }) => {
    const server = await mockGroupServer(page);
    server.patchStatus = status;
    await openGroup(page);
    await openManage(page);

    await modal(page).getByLabel('Название группы').fill('Другое');
    await modal(page).getByRole('button', { name: 'Сохранить' }).click();

    await expect(modal(page).getByRole('alert').filter({ hasText: text })).toBeVisible();
    await expect(page.locator('.dialog__header-title')).toHaveText('Команда');
  });
}

for (const [status, text] of [
  [403, 'Убирать участников может только владелец группы.'],
  [404, 'Группа или участник не найдены.'],
  [500, 'Не удалось убрать участника.'],
]) {
  test(`убрать участника: ошибка ${status} показывает «${text}»`, async ({ page }) => {
    const server = await mockGroupServer(page);
    server.deleteStatus = status;
    await openGroup(page);
    await openManage(page);

    await modal(page).getByRole('button', { name: `Убрать ${BOB.name}`, exact: true }).click();

    await expect(modal(page).getByRole('alert').filter({ hasText: text })).toBeVisible();
    await expect(page.locator('.dialog__header-meta')).toHaveText('2 участника');
  });
}

test('выход: ошибка 403 показывает «Владелец не может выйти из группы.», чат остаётся', async ({ page }) => {
  const server = await mockGroupServer(page, { meRole: 'member' });
  server.deleteStatus = 403;
  await openGroup(page);
  await openManage(page);

  await modal(page).getByRole('button', { name: 'Выйти из группы' }).click();

  await expect(modal(page).getByRole('alert').filter({ hasText: 'Владелец не может выйти из группы.' })).toBeVisible();
  await expect(page.locator('.dialog__header-title')).toHaveText('Команда');
});
