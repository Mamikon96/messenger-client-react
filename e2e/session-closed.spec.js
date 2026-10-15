const { test, expect } = require('@playwright/test');
const { login, signIn, signInControl, userMenuButton } = require('./helpers/auth');

// popover после Join не закрывается сам (FE-03) — закрываем кликом по оверлею
const createChat = async (page, title) => {
  // пока идёт загрузка списка, ответ сервера заменил бы созданный чат
  await expect(page.getByText('Загрузка чатов…')).toHaveCount(0);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('input[name="title"]').fill(title);
  await page.locator('input[name="name"]').fill('Mock');
  await page.locator('.join-form').getByRole('button', { name: 'Join' }).click();
  await page.locator('.overlay').click({ position: { x: 5, y: 5 } });
};

const SESSION_CLOSED = 'Сессия завершена. Войдите снова.';

// Выход «в другой вкладке»: второй браузерный контекст с теми же cookie вызывает POST /api/auth/logout,
// как это сделал бы человек в другом окне (для сервера разницы нет). Первая страница об этом не знает.
const closeSessionElsewhere = async ({ browser, context, baseURL }) => {
  const other = await browser.newContext({ baseURL, storageState: await context.storageState() });
  try {
    const session = await other.request.get('/api/auth/session');
    expect(session.status()).toBe(200);
    const { csrfToken } = await session.json();
    const logout = await other.request.post('/api/auth/logout', { headers: { 'X-CSRF-Token': csrfToken } });
    expect(logout.status()).toBe(204);
  } finally {
    await other.close();
  }
};

test('[UC-SESSION-06] сессию закрыли в другой вкладке: следующее действие возвращает на экран входа с сообщением', async ({ page, browser, context, baseURL }) => {
  await login(page);
  await createChat(page, 'Secret room');
  await closeSessionElsewhere({ browser, context, baseURL });

  // До первого запроса страница не знает, что сессия закрыта.
  await expect(userMenuButton(page)).toBeVisible();
  await userMenuButton(page).click();
  await page.getByRole('button', { name: 'Выйти' }).click();

  await expect(signInControl(page)).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(SESSION_CLOSED);
  await expect(page.getByRole('status')).toBeFocused();
  await expect(page.getByText('Не удалось выйти')).toHaveCount(0);
  await expect(userMenuButton(page)).toHaveCount(0);
});

test('[UC-SESSION-06] после нового входа сообщения о закрытой сессии и чатов прежней сессии нет', async ({ page, browser, context, baseURL }) => {
  await login(page);
  await createChat(page, 'Secret room');
  await closeSessionElsewhere({ browser, context, baseURL });
  await userMenuButton(page).click();
  await page.getByRole('button', { name: 'Выйти' }).click();
  await expect(page.getByRole('status')).toHaveText(SESSION_CLOSED);

  await signIn(page);

  await expect(userMenuButton(page)).toBeVisible();
  await expect(page.getByText('Secret room')).toHaveCount(0);
  // обычный выход после нового входа: сообщения о закрытой сессии нет
  await userMenuButton(page).click();
  await page.getByRole('button', { name: 'Выйти' }).click();
  await expect(signInControl(page)).toBeVisible();
  await expect(page.getByText(SESSION_CLOSED)).toHaveCount(0);
});

test('[UC-SESSION-06] сессию закрыли, загрузка чатов не удалась: «Повторить» возвращает на экран входа с сообщением', async ({ page, browser, context, baseURL }) => {
  await page.route('**/api/chats', (route) => route.fulfill({ status: 500, json: { error: { code: 'internal' } } }));
  await login(page);
  await expect(page.getByText('Не удалось загрузить чаты.')).toBeVisible();
  await closeSessionElsewhere({ browser, context, baseURL });
  await page.unroute('**/api/chats');

  await page.getByRole('button', { name: 'Повторить' }).click();

  await expect(signInControl(page)).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(SESSION_CLOSED);
  await expect(page.getByRole('status')).toBeFocused();
  await expect(userMenuButton(page)).toHaveCount(0);

  // после нового входа ответ прерванной загрузки не оставляет в списке ошибку
  await signIn(page);
  await expect(page.getByText('Чатов пока нет')).toBeVisible();
  await expect(page.getByText('Не удалось загрузить чаты.')).toHaveCount(0);
});
