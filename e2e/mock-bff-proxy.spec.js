const { test, expect } = require('@playwright/test');

// Dev-сервер (порт 3100) проксирует /api и /mock-provider на mock-BFF.
test('fetch /api/auth/session доходит до mock-BFF: без сессии 401', async ({ request }) => {
  expect((await request.get('/api/auth/session')).status()).toBe(401);
});

test('навигация на start проходит вход через mock-BFF и возвращает на /', async ({ page }) => {
  await page.goto('/api/auth/github/start');
  await expect(page).toHaveURL(/\/$/);
  const session = await page.request.get('/api/auth/session');
  expect(session.status()).toBe(200);
  expect((await session.json()).user.provider).toBe('github');
});

test('навигация на start неизвестного провайдера отдаёт 404 от mock-BFF', async ({ page }) => {
  const response = await page.goto('/api/auth/unknown/start');
  expect(response.status()).toBe(404);
});
