const { test, expect } = require('@playwright/test');

// Вход полной навигацией через mock-BFF (фейковый провайдер подтверждает сразу).
const providers = [
  { provider: 'google', button: 'Войти через Google' },
  { provider: 'github', button: 'Войти через GitHub' },
];

for (const { provider, button } of providers) {
  test(`вход через ${provider}: экран входа → мессенджер, сессия принадлежит провайдеру`, async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Войти через Google' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Войти через GitHub' })).toBeVisible();

    await page.getByRole('link', { name: button }).click();

    await expect(page.getByText('Join').first()).toBeVisible();
    await expect(page.getByRole('link', { name: button })).toHaveCount(0);
    const session = await page.request.get('/api/auth/session');
    expect((await session.json()).user.provider).toBe(provider);
  });
}

test('после перезагрузки сессия сохраняется и вход не показывается', async ({ page }) => {
  await page.goto('/api/auth/github/start');
  await page.goto('/');
  await expect(page.getByText('Join').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Войти через GitHub' })).toHaveCount(0);
});

test('сбой проверки сессии: сообщение и «Повторить» восстанавливает работу', async ({ page }) => {
  let fail = true;
  await page.route('**/api/auth/session', (route) => (fail ? route.abort() : route.fallback()));
  await page.goto('/');
  await expect(
    page.getByText('Не удалось проверить сессию. Проверьте соединение и попробуйте снова.')
  ).toBeVisible();

  fail = false;
  await page.getByRole('button', { name: 'Повторить' }).click();
  await expect(page.getByRole('link', { name: 'Войти через Google' })).toBeVisible();
});

const errors = [
  { code: 'access_denied', text: 'Вход отменён' },
  { code: 'provider_error', text: 'Ошибка провайдера' },
  { code: 'invalid_state', text: 'Попытка входа устарела' },
  { code: 'something_else', text: 'Не удалось войти' },
];

for (const { code, text } of errors) {
  test(`ошибка OAuth ${code}: сообщение на экране входа, адрес очищен`, async ({ page }) => {
    await page.goto(`/?auth_error=${code}`);
    await expect(page.getByRole('alert')).toHaveText(text);
    await expect(page.getByRole('link', { name: 'Войти через Google' })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });
}

test('после ошибки повторный вход через провайдера проходит', async ({ page }) => {
  await page.goto('/?auth_error=access_denied');
  await page.getByRole('link', { name: 'Войти через GitHub' }).click();
  await expect(page.getByText('Join').first()).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('клик по провайдеру показывает «Переход…», остальные кнопки неактивны', async ({ page }) => {
  // 204: браузер не уходит со страницы, поэтому состояние ожидания перехода можно проверить.
  await page.route('**/api/auth/google/start', (route) => route.fulfill({ status: 204 }));
  await page.goto('/');
  await page.getByRole('link', { name: 'Войти через Google' }).click();
  await expect(page.getByRole('link', { name: /Переход…/ })).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('link', { name: 'Войти через GitHub' })).toHaveAttribute('aria-disabled', 'true');
});

test('экран входа в тёмной теме: фон и текст из токенов', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const card = page.locator('.login__card');
  await expect(card).toBeVisible();
  const [bg, pageBg] = await Promise.all([
    card.evaluate((el) => getComputedStyle(el).backgroundColor),
    page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  ]);
  expect(bg).not.toBe('rgb(255, 255, 255)');
  expect(bg).not.toBe(pageBg);
});

