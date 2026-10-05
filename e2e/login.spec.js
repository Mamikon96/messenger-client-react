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
