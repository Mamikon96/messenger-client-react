const { test, expect } = require('@playwright/test');

// Dev-сервер (порт 3100) проксирует /api на mock-BFF.
test('fetch /api/auth/session доходит до mock-BFF: без сессии 401', async ({ request }) => {
  expect((await request.get('/api/auth/session')).status()).toBe(401);
});

test('вход по паролю через прокси: cookie сессии ставится на origin dev-сервера', async ({ page }) => {
  const res = await page.request.post('/api/auth/login', { data: { login: 'alice', password: 'correct-horse-1' } });
  expect(res.status()).toBe(200);
  const session = await page.request.get('/api/auth/session');
  expect(session.status()).toBe(200);
  expect((await session.json()).user.login).toBe('alice');
});
