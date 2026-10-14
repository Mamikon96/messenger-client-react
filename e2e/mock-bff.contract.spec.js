const { test, expect, request } = require('@playwright/test');

// Контракт auth API (.ai/memory/auth-contract.md) против mock-BFF.
// Ручной запуск: `npm run mock-bff` и `MOCK_BFF_URL=http://localhost:3334 npx playwright test e2e/mock-bff.contract.spec.js`.
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

test('session: без сессии — 401 unauthorized в формате ошибки', async () => {
  const res = await api.get('/api/auth/session');
  expect(res.status()).toBe(401);
  await expectError(res, 401, 'unauthorized');
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

test('logout: без сессии — 401 unauthorized', async () => {
  const res = await api.post('/api/auth/logout');
  expect(res.status()).toBe(401);
  await expectError(res, 401, 'unauthorized');
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

test('прочие /api/*: без сессии — 401 unauthorized', async () => {
  const res = await api.get('/api/chats');
  expect(res.status()).toBe(401);
  await expectError(res, 401, 'unauthorized');
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

// ---- Вход и регистрация по паролю (docs/auth-password-spec.md §2.1–2.3, §3, §4.1–4.2, §5) ----

const PASSWORD = 'correct-horse-1';
const SESSION_KEYS = ['avatarUrl', 'firstName', 'id', 'lastName', 'login', 'name'];
let loginCounter = 0;
const uniqueLogin = () => `user.${Date.now().toString(36)}-${(loginCounter += 1)}`;

const register = (data) => api.post('/api/auth/register', { data });
const login = (data) => api.post('/api/auth/login', { data });
const sidOf = (res) => /mock_session=([^;]+)/.exec(res.headers()['set-cookie'])[1];

// Тело ошибки читается как текст и проверяется до разбора: пустое тело, не-JSON
// или ответ без объекта error падают подписанной проверкой. label — какой случай упал.
async function expectError(res, status, code, details, label = '') {
  expect(res.status(), label).toBe(status);
  expect(res.headers()['content-type'] ?? '', `${label} Content-Type`).toMatch(/^application\/json/);
  const text = await res.text();
  expect(text, `${label} тело ошибки пустое`).not.toBe('');
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${label} тело ошибки не JSON: ${text}`);
  }
  const { error, ...rest } = body ?? {};
  expect(rest, label).toEqual({});
  const isObject = error !== null && typeof error === 'object' && !Array.isArray(error);
  expect(isObject, `${label} нет объекта error`).toBe(true);
  expect(Object.keys(error).sort(), label).toEqual(
    details ? ['code', 'details', 'message'] : ['code', 'message'],
  );
  expect(error.code, label).toBe(code);
  expect(typeof error.message, label).toBe('string');
  if (details) expect(error.details, label).toEqual(details);
}

test('register: 201, SessionUser из шести полей, csrfToken и cookie сессии', async () => {
  const name = uniqueLogin();
  const res = await register({ login: name, password: PASSWORD });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(Object.keys(body.user).sort()).toEqual(SESSION_KEYS);
  expect(body.user.login).toBe(name);
  expect(body.user.avatarUrl).toBe('');
  expect(body.user.firstName).toBeTruthy();
  expect(body.user.name).toBe(`${body.user.firstName} ${body.user.lastName}`.trim());
  expect(typeof body.csrfToken).toBe('string');
  expect(body.csrfToken).not.toBe('');
  const session = await (await api.get('/api/auth/session')).json();
  expect(session).toEqual(body);
});

test('register: имя берётся из фиксированного списка, пять регистраций подряд — разные имена', async () => {
  const known = ['Сонный Енот', 'Дерзкая Выдра', 'Весёлый Барсук', 'Хитрая Лиса', 'Смелый Ёж'];
  const names = [];
  for (let i = 0; i < 5; i += 1) {
    const res = await register({ login: uniqueLogin(), password: PASSWORD });
    names.push((await res.json()).user.name);
  }
  names.forEach((name) => expect(known).toContain(name));
  expect(new Set(names).size).toBe(5);
});

test('register: логин нормализуется (trim + нижний регистр), занятость — после нормализации', async () => {
  const name = uniqueLogin().toUpperCase();
  const first = await register({ login: `  ${name}  `, password: PASSWORD });
  expect(first.status()).toBe(201);
  expect((await first.json()).user.login).toBe(name.toLowerCase());
  await expectError(await register({ login: name.toLowerCase(), password: PASSWORD }), 409, 'login_taken');
  await expectError(await register({ login: 'ALICE', password: PASSWORD }), 409, 'login_taken');
});

test('register: 400 validation_failed с details по полям', async () => {
  const long = 'a'.repeat(33);
  const cases = [
    [{}, [{ field: 'login', code: 'required' }, { field: 'password', code: 'required' }]],
    [{ login: '   ', password: '' }, [{ field: 'login', code: 'required' }, { field: 'password', code: 'required' }]],
    [{ login: 123, password: PASSWORD }, [{ field: 'login', code: 'required' }]],
    [{ login: uniqueLogin(), password: 123 }, [{ field: 'password', code: 'required' }]],
    [{ login: 'ab', password: PASSWORD }, [{ field: 'login', code: 'invalid_format' }]],
    [{ login: 'bad login!', password: PASSWORD }, [{ field: 'login', code: 'invalid_format' }]],
    [{ login: long, password: PASSWORD }, [{ field: 'login', code: 'too_long' }]],
    [{ login: `!${long}`, password: PASSWORD }, [{ field: 'login', code: 'too_long' }]],
    [{ login: '', password: PASSWORD }, [{ field: 'login', code: 'required' }]],
    [{ login: uniqueLogin(), password: 'short' }, [{ field: 'password', code: 'too_short' }]],
    [{ login: uniqueLogin(), password: 'абвгдa' }, [{ field: 'password', code: 'too_short' }]],
    [{ login: uniqueLogin(), password: 'x'.repeat(257) }, [{ field: 'password', code: 'too_long' }]],
    [{ login: uniqueLogin(), password: 'password1234' }, [{ field: 'password', code: 'too_common' }]],
    [{ login: uniqueLogin(), password: 'PassWord1234' }, [{ field: 'password', code: 'too_common' }]],
    [{ login: 'x!', password: 'short' }, [{ field: 'login', code: 'invalid_format' }, { field: 'password', code: 'too_short' }]],
  ];
  for (const [data, details] of cases) {
    await expectError(await register(data), 400, 'validation_failed', details);
  }
  expect((await api.get('/api/auth/session')).status()).toBe(401);
});

test('register и login: битый JSON — 400 validation_failed без details', async () => {
  // Тело уходит байтами: строковое data с JSON-заголовком Playwright сам прогоняет через
  // JSON.stringify, и битый JSON превращается в валидную строку. Последний случай — обрезанное
  // тело засеянной alice: если сервер его «дочинит», login войдёт, а register получит 409.
  const bodies = ['{"login":', '[1]', '"text"', '42', 'null', `{"login":"alice","password":"${PASSWORD}"`];
  for (const path of ['/api/auth/register', '/api/auth/login']) {
    for (const data of bodies) {
      const res = await api.post(path, { data: Buffer.from(data), headers: { 'Content-Type': 'application/json' } });
      await expectError(res, 400, 'validation_failed', undefined, `${path} ${data}`);
      expect(res.headers()['set-cookie'], `${path} ${data}`).toBeUndefined();
    }
  }
  expect((await api.get('/api/auth/session')).status()).toBe(401);
});

test('register: длина пароля считается в байтах UTF-8, без trim', async () => {
  expect((await register({ login: uniqueLogin(), password: 'парольпароль' })).status()).toBe(201);
  expect((await register({ login: uniqueLogin(), password: ' '.repeat(12) })).status()).toBe(201);
  expect((await register({ login: uniqueLogin(), password: 'x'.repeat(256) })).status()).toBe(201);
});

test('login: 200, тот же SessionUser и csrfToken, session его отдаёт', async () => {
  const res = await login({ login: 'alice', password: PASSWORD });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Object.keys(body.user).sort()).toEqual(SESSION_KEYS);
  expect(body.user.login).toBe('alice');
  expect(body.user.avatarUrl).toBe('');
  expect(body.user.name).toBe(`${body.user.firstName} ${body.user.lastName}`.trim());
  expect(await (await api.get('/api/auth/session')).json()).toEqual(body);
});

test('login: засеянные alice, bob, admin входят, логин нормализуется', async () => {
  for (const name of ['alice', 'bob', 'admin']) {
    const res = await login({ login: `  ${name.toUpperCase()} `, password: PASSWORD });
    expect(res.status()).toBe(200);
    expect((await res.json()).user.login).toBe(name);
  }
});

test('login: 401 auth_failed одинаков для неизвестного логина и неверного пароля', async () => {
  const unknown = await login({ login: 'nobody-here', password: PASSWORD });
  const wrong = await login({ login: 'alice', password: 'wrong-password-1' });
  await expectError(unknown, 401, 'auth_failed');
  await expectError(wrong, 401, 'auth_failed');
  expect(await unknown.json()).toEqual(await wrong.json());
  expect((await api.get('/api/auth/session')).status()).toBe(401);
});

test('login: формат логина и политика пароля при входе не проверяются', async () => {
  await expectError(await login({ login: 'x!', password: 'short' }), 401, 'auth_failed');
  await expectError(await login({ login: 'alice', password: 'password1234' }), 401, 'auth_failed');
  expect((await api.get('/api/auth/session')).status()).toBe(401);
});

test('login: отключённый — 403 user_disabled только после верного пароля', async () => {
  await expectError(await login({ login: 'disabled', password: PASSWORD }), 403, 'user_disabled');
  await expectError(await login({ login: 'disabled', password: 'wrong-password-1' }), 401, 'auth_failed');
  expect((await api.get('/api/auth/session')).status()).toBe(401);
});

test('login: пустые поля и неверный тип — 400 validation_failed с required', async () => {
  const both = [{ field: 'login', code: 'required' }, { field: 'password', code: 'required' }];
  await expectError(await login({}), 400, 'validation_failed', both);
  await expectError(await login({ login: '', password: '' }), 400, 'validation_failed', both);
  await expectError(await login({ login: 'alice' }), 400, 'validation_failed', [{ field: 'password', code: 'required' }]);
  await expectError(await login({ login: 5, password: PASSWORD }), 400, 'validation_failed', [{ field: 'login', code: 'required' }]);
  await expectError(await login({ login: 'alice', password: ['x'] }), 400, 'validation_failed', [{ field: 'password', code: 'required' }]);
  expect((await api.get('/api/auth/session')).status()).toBe(401);
});

test('login: повторный вход уничтожает прежнюю сессию браузера', async () => {
  const first = await login({ login: 'alice', password: PASSWORD });
  const oldSid = sidOf(first);
  const second = await login({ login: 'bob', password: PASSWORD });
  expect(sidOf(second)).not.toBe(oldSid);
  expect((await (await api.get('/api/auth/session')).json()).user.login).toBe('bob');
  const stale = await request.newContext({ baseURL, extraHTTPHeaders: { Cookie: `mock_session=${oldSid}` } });
  expect((await stale.get('/api/auth/session')).status()).toBe(401);
  await stale.dispose();
});

test('register: если в браузере была сессия, она уничтожается', async () => {
  const oldSid = sidOf(await login({ login: 'alice', password: PASSWORD }));
  const res = await register({ login: uniqueLogin(), password: PASSWORD });
  expect(sidOf(res)).not.toBe(oldSid);
  const stale = await request.newContext({ baseURL, extraHTTPHeaders: { Cookie: `mock_session=${oldSid}` } });
  expect((await stale.get('/api/auth/session')).status()).toBe(401);
  await stale.dispose();
});

test('cookie входа и регистрации: HttpOnly; SameSite=Lax; Path=/, без Secure', async () => {
  const cookies = [
    (await login({ login: 'alice', password: PASSWORD })).headers()['set-cookie'],
    (await register({ login: uniqueLogin(), password: PASSWORD })).headers()['set-cookie'],
  ];
  for (const cookie of cookies) {
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Secure/i);
  }
});

test('logout после входа по паролю: csrfToken из login подходит, сессия сбрасывается', async () => {
  const { csrfToken } = await (await login({ login: 'alice', password: PASSWORD })).json();
  const res = await api.post('/api/auth/logout', { headers: { 'X-CSRF-Token': csrfToken } });
  expect(res.status()).toBe(204);
  expect(res.headers()['set-cookie']).toMatch(/Max-Age=0/);
  expect(res.headers()['set-cookie']).not.toMatch(/Secure/i);
  expect((await api.get('/api/auth/session')).status()).toBe(401);
});
