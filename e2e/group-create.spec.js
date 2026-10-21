const { test, expect } = require('@playwright/test');
const { login, MOCK_USER_NAME, sessionUserId } = require('./helpers/auth');

// Сервер чатов в памяти страницы: список пуст, POST /api/chats создаёт группу с владельцем-вошедшим.
// createStatus — статус ответа на создание (201 по умолчанию), createRequests — тела POST, createDelayMs — задержка ответа.
const mockGroupServer = async (page) => {
  const server = { createStatus: 201, createRequests: [], createDelayMs: 0 };
  await page.route(/\/api\/chats(\/|\?|$)/, async (route) => {
    const request = route.request();
    const parts = new URL(request.url()).pathname.split('/').filter(Boolean);
    if (parts.length === 2 && request.method() === 'GET') return route.fulfill({ json: [] });
    if (parts.length === 2 && request.method() === 'POST') {
      const body = request.postDataJSON();
      server.createRequests.push(body);
      if (server.createDelayMs) await new Promise((resolve) => setTimeout(resolve, server.createDelayMs));
      if (server.createStatus !== 201) return route.fulfill({ status: server.createStatus, json: { error: { code: 'validation_failed' } } });
      const meId = await sessionUserId(page);
      return route.fulfill({
        status: 201,
        json: { id: 'g-new', type: 'group', title: body.title.trim(), lastSeq: 0, members: [{ userId: meId, name: MOCK_USER_NAME, avatarUrl: '', role: 'owner' }] },
      });
    }
    return route.fulfill({ status: 404, json: { error: { code: 'not_found' } } });
  });
  return server;
};

const openForm = async (page) => {
  await page.getByRole('button', { name: 'Новая группа' }).click();
  return page.getByLabel('Название');
};

test('Новая группа: название создаёт группу, она открывается, форма закрывается', async ({ page }) => {
  const server = await mockGroupServer(page);
  await login(page);

  await (await openForm(page)).fill('  Команда  ');
  await page.getByRole('button', { name: 'Создать', exact: true }).click();

  await expect(page.locator('.dialog__header-title')).toHaveText('Команда');
  expect(server.createRequests).toEqual([{ type: 'group', title: 'Команда', memberIds: [] }]);
  await expect(page.locator('.chat._active')).toContainText('Команда');
  await expect(page.getByLabel('Название')).toHaveCount(0);
});

test('Новая группа: пустое название показывает ошибку в форме и не шлёт запрос', async ({ page }) => {
  const server = await mockGroupServer(page);
  await login(page);

  await (await openForm(page)).fill('   ');
  await page.getByRole('button', { name: 'Создать', exact: true }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'Введите название группы' })).toBeVisible();
  expect(server.createRequests).toEqual([]);
});

test('Новая группа: ошибка сервера показывается в форме, название сохраняется', async ({ page }) => {
  const server = await mockGroupServer(page);
  server.createStatus = 400;
  await login(page);

  await (await openForm(page)).fill('Команда');
  await page.getByRole('button', { name: 'Создать', exact: true }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'Название не подходит' })).toBeVisible();
  await expect(page.getByLabel('Название')).toHaveValue('Команда');
});

test('Новая группа: двойной клик создаёт одну группу', async ({ page }) => {
  const server = await mockGroupServer(page);
  server.createDelayMs = 500;
  await login(page);

  await (await openForm(page)).fill('Команда');
  await page.getByRole('button', { name: 'Создать', exact: true }).dblclick();

  await expect(page.locator('.dialog__header-title')).toHaveText('Команда');
  expect(server.createRequests).toHaveLength(1);
  await expect(page.locator('.chat', { hasText: 'Команда' })).toHaveCount(1);
});
