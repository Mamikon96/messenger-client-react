const { test, expect, request } = require('@playwright/test');

// Контракт auth API (.ai/memory/frontend/auth-contract.md) против mock-BFF.
// Ручной запуск: `npm run mock-bff` и `MOCK_BFF_URL=http://localhost:3200 npx playwright test e2e/mock-bff.contract.spec.js`.
// Без MOCK_BFF_URL пропускается: в приёмку mock-BFF подключает FE-11.
const baseURL = process.env.MOCK_BFF_URL;

test.skip(!baseURL, 'MOCK_BFF_URL не задан: mock-BFF не запущен');

let api;

test.beforeEach(async () => {
  api = await request.newContext({ baseURL, maxRedirects: 0 });
});

test.afterEach(async () => {
  await api.dispose();
});

// Проходит вход через фейкового провайдера: start → провайдер → callback.
async function signIn(provider) {
  const start = await api.get(`/api/auth/${provider}/start`);
  expect(start.status()).toBe(302);
  const authorize = await api.get(start.headers().location);
  expect(authorize.status()).toBe(302);
  return api.get(authorize.headers().location);
}

test('start: неизвестный провайдер — 404', async () => {
  expect((await api.get('/api/auth/unknown/start')).status()).toBe(404);
});

test('start: редирект на провайдера со state', async () => {
  for (const provider of ['google', 'github']) {
    const res = await api.get(`/api/auth/${provider}/start`);
    expect(res.status()).toBe(302);
    expect(new URL(res.headers().location, baseURL).searchParams.get('state')).toBeTruthy();
  }
});

test('session: без сессии — 401', async () => {
  expect((await api.get('/api/auth/session')).status()).toBe(401);
});

test('callback: успех — 302 на / и cookie сессии HttpOnly; Secure; SameSite=Lax', async () => {
  const res = await signIn('google');
  expect(res.status()).toBe(302);
  expect(res.headers().location).toBe('/');
  const cookie = res.headers()['set-cookie'];
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/Secure/i);
  expect(cookie).toMatch(/SameSite=Lax/i);
});

test('session: после входа — user из четырёх полей и csrfToken', async () => {
  await signIn('github');
  const res = await api.get('/api/auth/session');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Object.keys(body.user).sort()).toEqual(['avatarUrl', 'id', 'name', 'provider']);
  expect(body.user.provider).toBe('github');
  expect(typeof body.csrfToken).toBe('string');
  expect(body.csrfToken).not.toBe('');
});

test('callback: чужой state — /?auth_error=invalid_state, сессии нет', async () => {
  const res = await api.get('/api/auth/google/callback?code=x&state=forged');
  expect(res.status()).toBe(302);
  expect(res.headers().location).toBe('/?auth_error=invalid_state');
  expect((await api.get('/api/auth/session')).status()).toBe(401);
});

test('callback: отказ у провайдера — /?auth_error=access_denied', async () => {
  const res = await api.get('/api/auth/google/callback?error=access_denied');
  expect(res.headers().location).toBe('/?auth_error=access_denied');
});

test('callback: ошибка провайдера — /?auth_error=provider_error', async () => {
  const res = await api.get('/api/auth/github/callback?error=server_error');
  expect(res.headers().location).toBe('/?auth_error=provider_error');
});

test('logout: без сессии — 401', async () => {
  expect((await api.post('/api/auth/logout')).status()).toBe(401);
});

test('logout: без CSRF-заголовка или с неверным — 403, сессия жива', async () => {
  await signIn('google');
  expect((await api.post('/api/auth/logout')).status()).toBe(403);
  expect((await api.post('/api/auth/logout', { headers: { 'X-CSRF-Token': 'wrong' } })).status()).toBe(403);
  expect((await api.get('/api/auth/session')).status()).toBe(200);
});

test('logout: с верным CSRF — 2xx, затем session отвечает 401', async () => {
  await signIn('google');
  const { csrfToken } = await (await api.get('/api/auth/session')).json();
  const res = await api.post('/api/auth/logout', { headers: { 'X-CSRF-Token': csrfToken } });
  expect(res.status()).toBeGreaterThanOrEqual(200);
  expect(res.status()).toBeLessThan(300);
  expect((await api.get('/api/auth/session')).status()).toBe(401);
});

test('прочие /api/*: без сессии — 401', async () => {
  expect((await api.get('/api/chats')).status()).toBe(401);
});

test('callback: state одноразовый', async () => {
  const start = await api.get('/api/auth/google/start');
  const { searchParams } = new URL(start.headers().location, baseURL);
  const url = `/api/auth/google/callback?code=x&state=${searchParams.get('state')}`;
  expect((await api.get(url)).headers().location).toBe('/');
  expect((await api.get(url)).headers().location).toBe('/?auth_error=invalid_state');
});

test('callback: state, выданный для другого провайдера, — invalid_state', async () => {
  const start = await api.get('/api/auth/google/start');
  const state = new URL(start.headers().location, baseURL).searchParams.get('state');
  const res = await api.get(`/api/auth/github/callback?code=x&state=${state}`);
  expect(res.headers().location).toBe('/?auth_error=invalid_state');
});

test('callback: неизвестный код ошибки провайдера — provider_error', async () => {
  for (const error of ['constructor', 'toString', 'whatever']) {
    const res = await api.get(`/api/auth/google/callback?error=${error}`);
    expect(res.headers().location).toBe('/?auth_error=provider_error');
  }
});

test('cookie сессии живёт 7 дней, logout её сбрасывает', async () => {
  const res = await signIn('google');
  expect(res.headers()['set-cookie']).toMatch(/Max-Age=604800/);
  const { csrfToken } = await (await api.get('/api/auth/session')).json();
  const out = await api.post('/api/auth/logout', { headers: { 'X-CSRF-Token': csrfToken } });
  expect(out.headers()['set-cookie']).toMatch(/Max-Age=0/);
  expect((await api.post('/api/auth/logout', { headers: { 'X-CSRF-Token': csrfToken } })).status()).toBe(401);
});

test('прочие изменяющие /api/*: с сессией без CSRF — 403', async () => {
  await signIn('google');
  for (const method of ['post', 'put', 'patch', 'delete']) {
    expect((await api[method]('/api/chats')).status()).toBe(403);
  }
});

test('фейковый провайдер: мусор в state не роняет сервер, неизвестный провайдер — 404', async () => {
  const bad = await api.get('/mock-provider/google/authorize?state=a%0d%0aX:1');
  expect(bad.status()).toBe(302);
  expect(bad.headers().location).not.toMatch(/[\r\n]/);
  expect((await api.get('/mock-provider/nope/authorize?state=a')).status()).toBe(404);
  expect((await api.get('/api/auth/session')).status()).toBe(401);
});
