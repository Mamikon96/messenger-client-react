const { test, expect, request } = require('@playwright/test');

// Контракт auth API (docs/client-integration.md) против mock-BFF.
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

// Входит засеянным пользователем alice: cookie сессии остаётся в контексте api.
async function signIn() {
  const res = await api.post('/api/auth/login', { data: { login: 'alice', password: 'correct-horse-1' } });
  expect(res.status()).toBe(200);
  return res;
}

test('session: без сессии — 401 unauthorized в формате ошибки', async () => {
  const res = await api.get('/api/auth/session');
  expect(res.status()).toBe(401);
  await expectError(res, 401, 'unauthorized');
});

test('logout: без сессии — 401 unauthorized', async () => {
  const res = await api.post('/api/auth/logout');
  expect(res.status()).toBe(401);
  await expectError(res, 401, 'unauthorized');
});

test('logout: без CSRF-заголовка или с неверным — 403, сессия жива', async () => {
  await signIn();
  await expectError(await api.post('/api/auth/logout'), 403, 'csrf_invalid');
  await expectError(await api.post('/api/auth/logout', { headers: { 'X-CSRF-Token': 'wrong' } }), 403, 'csrf_invalid');
  expect((await api.get('/api/auth/session')).status()).toBe(200);
});

test('logout: с верным CSRF — 2xx, затем session отвечает 401', async () => {
  await signIn();
  const { csrfToken } = await (await api.get('/api/auth/session')).json();
  const res = await api.post('/api/auth/logout', { headers: { 'X-CSRF-Token': csrfToken } });
  expect(res.status()).toBeGreaterThanOrEqual(200);
  expect(res.status()).toBeLessThan(300);
  expect((await api.get('/api/auth/session')).status()).toBe(401);
});

test('удалённые OAuth-маршруты, неизвестные пути и неверный метод — 404', async () => {
  for (const path of ['/api/auth/google/start', '/api/auth/github/callback', '/api/auth/unknown', '/mock-provider/google/authorize']) {
    expect((await api.get(path)).status(), path).toBe(404);
  }
  expect((await api.get('/api/auth/login')).status()).toBe(404);
});

test('прочие /api/*: без сессии — 401 unauthorized', async () => {
  const res = await api.get('/api/chats');
  expect(res.status()).toBe(401);
  await expectError(res, 401, 'unauthorized');
});

test('GET /api/chats: с сессией — 200 и пустой список', async () => {
  await signIn();
  const res = await api.get('/api/chats');
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual([]);
});

test('GET /api/chats/:id и GET /api/chats/:id/messages: без сессии — 401, с сессией — 404 not_found (чатов в mock нет)', async () => {
  for (const path of ['/api/chats/c1', '/api/chats/c1/messages']) {
    expect((await api.get(path)).status(), path).toBe(401);
  }
  await signIn();
  for (const path of ['/api/chats/c1', '/api/chats/c1/messages']) {
    await expectError(await api.get(path), 404, 'not_found');
  }
});

test('POST /api/chats/:id/messages: невалидное тело — 400 validation_failed, валидное — 404 not_found', async () => {
  const { csrfToken } = await (await signIn()).json();
  const post = (data) => api.post('/api/chats/c1/messages', { data, headers: { 'X-CSRF-Token': csrfToken } });
  const invalid = [{}, { body: 'текст' }, { clientId: 'c1' }, { clientId: 'c1', body: '   ' }, { clientId: 'c1', body: 'я'.repeat(4001) }, { clientId: 'c1', body: ` ${'я'.repeat(4000)}` }];
  for (const data of invalid) {
    const res = await post(data);
    expect(res.status(), JSON.stringify(data).slice(0, 40)).toBe(400);
    expect((await res.json()).error.code).toBe('validation_failed');
  }
  const res = await post({ clientId: 'c1', body: 'я'.repeat(4000) });
  expect(res.status()).toBe(404);
  expect((await res.json()).error.code).toBe('not_found');
});

test('POST /api/chats/:id/messages: без сессии — 401, без CSRF — 403', async () => {
  expect((await api.post('/api/chats/c1/messages', { data: { clientId: 'c1', body: 'x' } })).status()).toBe(401);
  await signIn();
  await expectError(await api.post('/api/chats/c1/messages', { data: { clientId: 'c1', body: 'x' } }), 403, 'csrf_invalid');
});

test('прочие изменяющие /api/*: с сессией без CSRF — 403', async () => {
  await signIn();
  for (const method of ['post', 'put', 'patch', 'delete']) {
    await expectError(await api[method]('/api/chats'), 403, 'csrf_invalid');
  }
});

// ---- Вход и регистрация по паролю (docs/client-integration.md §1.3, §2.1–2.3, §4) ----

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

test('register и login: пустое тело — как {}, required по обоим полям (client-integration.md §1.3, «Коды details»)', async () => {
  const both = [{ field: 'login', code: 'required' }, { field: 'password', code: 'required' }];
  for (const path of ['/api/auth/register', '/api/auth/login']) {
    await expectError(await api.post(path), 400, 'validation_failed', both, path);
    await expectError(
      await api.post(path, { data: Buffer.from(''), headers: { 'Content-Type': 'application/json' } }),
      400,
      'validation_failed',
      both,
      `${path} пустое тело с Content-Type`,
    );
  }
  expect((await api.get('/api/auth/session')).status()).toBe(401);
});

test('register и login: поле неверного типа — как отсутствующее (required), для обоих полей', async () => {
  const wrongTypes = [123, true, null, ['x'], { a: 1 }];
  for (const [path, valid] of [
    ['/api/auth/register', uniqueLogin()],
    ['/api/auth/login', 'alice'],
  ]) {
    for (const value of wrongTypes) {
      const label = `${path} ${JSON.stringify(value)}`;
      await expectError(await api.post(path, { data: { login: value, password: PASSWORD } }), 400, 'validation_failed', [{ field: 'login', code: 'required' }], `login ${label}`);
      await expectError(await api.post(path, { data: { login: valid, password: value } }), 400, 'validation_failed', [{ field: 'password', code: 'required' }], `password ${label}`);
    }
  }
  expect((await api.get('/api/auth/session')).status()).toBe(401);
});

test('register: одно поле — один код; приоритет login: required > too_long > invalid_format', async () => {
  const long = 'a'.repeat(33);
  // Длинный логин с недопустимыми знаками — только too_long, без invalid_format.
  await expectError(await register({ login: `bad login!${long}`, password: PASSWORD }), 400, 'validation_failed', [{ field: 'login', code: 'too_long' }]);
  // Пароль короче 12 байт и из списка частых не бывает: too_common только для 12..256 байт.
  await expectError(await register({ login: uniqueLogin(), password: 'qwerty' }), 400, 'validation_failed', [{ field: 'password', code: 'too_short' }]);
  // Пароль длиннее 256 байт — только too_long, даже если начинается с частого.
  await expectError(await register({ login: uniqueLogin(), password: `password1234${'x'.repeat(250)}` }), 400, 'validation_failed', [{ field: 'password', code: 'too_long' }]);
  // Каждое поле даёт ровно одну запись details.
  await expectError(
    await register({ login: `x!${long}`, password: 'y' }),
    400,
    'validation_failed',
    [{ field: 'login', code: 'too_long' }, { field: 'password', code: 'too_short' }],
  );
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

async function signInWithCsrf() {
  return (await (await signIn()).json()).csrfToken;
}

test('GET /api/users?q=: без сессии — 401', async () => {
  const res = await api.get('/api/users?q=bo');
  expect(res.status()).toBe(401);
  await expectError(res, 401, 'unauthorized');
});

test('GET /api/users?q=: q короче 2 символов после trim — 400 validation_failed', async () => {
  await signIn();
  for (const query of ['?q=b', '?q=%20b%20', '?q=']) {
    const res = await api.get(`/api/users${query}`);
    expect(res.status(), query).toBe(400);
    await expectError(res, 400, 'validation_failed', undefined, query);
  }
});

test('GET /api/users?q=: поиск по имени без учёта регистра, без себя и отключённых, без login', async () => {
  await signIn();
  const res = await api.get('/api/users?q=TESTER');
  expect(res.status()).toBe(200);
  const items = await res.json();
  expect(items.map((item) => item.name)).toEqual(expect.arrayContaining(['Admin Tester', 'Bob Tester']));
  expect(items.map((item) => item.name)).not.toContain('Alice Tester');
  expect(items.map((item) => item.name)).not.toContain('Disabled Tester');
  items.forEach((item) => expect(Object.keys(item).sort()).toEqual(['avatarUrl', 'id', 'name']));
  expect(await (await api.get('/api/users?q=bo')).json()).toEqual([expect.objectContaining({ name: 'Bob Tester' })]);
  expect(await (await api.get('/api/users?q=login-not-name')).json()).toEqual([]);
  expect(await (await api.get('/api/users?q=bob')).json()).toHaveLength(1);
});

test('POST /api/chats: без сессии — 401, без CSRF — 403', async () => {
  expect((await api.post('/api/chats', { data: { type: 'direct', userId: 'x' } })).status()).toBe(401);
  await signIn();
  await expectError(await api.post('/api/chats', { data: { type: 'direct', userId: 'x' } }), 403, 'csrf_invalid');
});

test('POST /api/chats: неверное тело — 400, неизвестный userId — 404 not_found', async () => {
  const csrfToken = await signInWithCsrf();
  const post = (data) => api.post('/api/chats', { data, headers: { 'X-CSRF-Token': csrfToken } });
  for (const data of [{}, { type: 'direct' }, { type: 'direct', userId: 5 }, { type: 'direct', userId: '' }, { type: 'channel', userId: 'x' }]) {
    const res = await post(data);
    expect(res.status(), JSON.stringify(data)).toBe(400);
    await expectError(res, 400, 'validation_failed', undefined, JSON.stringify(data));
  }
  const unknown = await post({ type: 'direct', userId: 'no-such-user' });
  expect(unknown.status()).toBe(404);
  await expectError(unknown, 404, 'not_found');
});

test('POST /api/chats: direct — 201 и ChatDto, повторный запрос с тем же userId — 200 с тем же чатом', async () => {
  const csrfToken = await signInWithCsrf();
  const [bob] = await (await api.get('/api/users?q=bob')).json();
  const post = () => api.post('/api/chats', { data: { type: 'direct', userId: bob.id }, headers: { 'X-CSRF-Token': csrfToken } });
  const created = await post();
  expect(created.status()).toBe(201);
  const chat = await created.json();
  expect(chat).toEqual({
    id: expect.any(String),
    type: 'direct',
    title: null,
    lastSeq: 0,
    members: [
      expect.objectContaining({ name: 'Alice Tester', role: 'member' }),
      { userId: bob.id, name: 'Bob Tester', avatarUrl: '', role: 'member' },
    ],
  });
  const again = await post();
  expect(again.status()).toBe(200);
  expect((await again.json()).id).toBe(chat.id);
});

test('POST /api/chats/:id/members: без сессии — 401, без CSRF — 403', async () => {
  expect((await api.post('/api/chats/c1/members', { data: { userId: 'x' } })).status()).toBe(401);
  await signIn();
  await expectError(await api.post('/api/chats/c1/members', { data: { userId: 'x' } }), 403, 'csrf_invalid');
});

test('POST /api/chats/:id/members: 204 и состав в GET, повтор — 409 already_member, ошибки 400/404', async () => {
  const csrfToken = await signInWithCsrf();
  const headers = { 'X-CSRF-Token': csrfToken };
  const [bob] = await (await api.get('/api/users?q=bob')).json();
  const group = await (await api.post('/api/chats', { data: { type: 'group', title: 'Team', memberIds: [] }, headers })).json();
  const add = (chatId, data) => api.post(`/api/chats/${chatId}/members`, { data, headers });

  const added = await add(group.id, { userId: bob.id });
  expect(added.status()).toBe(204);
  const card = await (await api.get(`/api/chats/${group.id}`)).json();
  expect(card.members).toEqual([
    expect.objectContaining({ role: 'owner' }),
    { userId: bob.id, name: 'Bob Tester', avatarUrl: '', role: 'member' },
  ]);

  await expectError(await add(group.id, { userId: bob.id }), 409, 'already_member');
  for (const data of [{}, { userId: 5 }, { userId: '' }]) {
    await expectError(await add(group.id, data), 400, 'validation_failed', undefined, JSON.stringify(data));
  }
  await expectError(await add(group.id, { userId: 'no-such-user' }), 404, 'not_found');
  await expectError(await add('no-such-chat', { userId: bob.id }), 404, 'not_found');

  const direct = await (await api.post('/api/chats', { data: { type: 'direct', userId: bob.id }, headers })).json();
  await expectError(await add(direct.id, { userId: bob.id }), 400, 'validation_failed');
});

test('POST /api/chats/:id/members: не owner — 403 forbidden', async () => {
  const aliceSession = await (await signIn()).json();
  const aliceCsrf = aliceSession.csrfToken;
  const alice = aliceSession.user;
  const [bob] = await (await api.get('/api/users?q=bob')).json();
  const bobApi = await request.newContext({ baseURL, maxRedirects: 0 });
  try {
    const bobSignIn = await bobApi.post('/api/auth/login', { data: { login: 'bob', password: 'correct-horse-1' } });
    expect(bobSignIn.status()).toBe(200);
    const bobHeaders = { 'X-CSRF-Token': (await bobSignIn.json()).csrfToken };
    const group = await (await bobApi.post('/api/chats', { data: { type: 'group', title: 'Bob group', memberIds: [] }, headers: bobHeaders })).json();
    expect((await bobApi.post(`/api/chats/${group.id}/members`, { data: { userId: alice.id }, headers: bobHeaders })).status()).toBe(204);

    await expectError(await api.post(`/api/chats/${group.id}/members`, { data: { userId: bob.id }, headers: { 'X-CSRF-Token': aliceCsrf } }), 403, 'forbidden');
  } finally {
    await bobApi.dispose();
  }
});

test('POST /api/chats/:id/members: сто участников — лимит, следующий получает 400 validation_failed', async () => {
  const csrfToken = await signInWithCsrf();
  const headers = { 'X-CSRF-Token': csrfToken };
  const group = await (await api.post('/api/chats', { data: { type: 'group', title: 'Big', memberIds: [] }, headers })).json();
  const add = (userId) => api.post(`/api/chats/${group.id}/members`, { data: { userId }, headers });
  const [bob] = await (await api.get('/api/users?q=bob')).json();
  expect((await add(bob.id)).status()).toBe(204);

  // Создатель и Боб — двое, ещё 98 зарегистрированных доводят состав до 100; 99-й зарегистрированный — лишний.
  const suffix = Date.now().toString(36);
  const register = async (i) => {
    const other = await request.newContext({ baseURL, maxRedirects: 0 });
    try {
      const registered = await other.post('/api/auth/register', { data: { login: `lim${suffix}${i}`, password: 'correct-horse-1' } });
      expect(registered.status()).toBe(201);
      return (await registered.json()).user;
    } finally {
      await other.dispose();
    }
  };
  for (let i = 0; i < 98; i += 1) expect((await add((await register(i)).id)).status()).toBe(204);
  expect((await (await api.get(`/api/chats/${group.id}`)).json()).members).toHaveLength(100);

  const extra = await register(98);
  await expectError(await add(extra.id), 400, 'validation_failed');
});

test('PATCH /api/chats/:id и DELETE /api/chats/:id/members/:userId: без сессии — 401, без CSRF — 403', async () => {
  expect((await api.patch('/api/chats/c1', { data: { title: 'X' } })).status()).toBe(401);
  expect((await api.delete('/api/chats/c1/members/u1')).status()).toBe(401);
  await signIn();
  await expectError(await api.patch('/api/chats/c1', { data: { title: 'X' } }), 403, 'csrf_invalid');
  await expectError(await api.delete('/api/chats/c1/members/u1'), 403, 'csrf_invalid');
});

test('PATCH /api/chats/:id: 200 и новое название в ChatDto и GET, ошибки 400/404', async () => {
  const csrfToken = await signInWithCsrf();
  const headers = { 'X-CSRF-Token': csrfToken };
  const [bob] = await (await api.get('/api/users?q=bob')).json();
  const group = await (await api.post('/api/chats', { data: { type: 'group', title: 'Team', memberIds: [] }, headers })).json();
  const rename = (chatId, data) => api.patch(`/api/chats/${chatId}`, { data, headers });

  const renamed = await rename(group.id, { title: '  Новое  ' });
  expect(renamed.status()).toBe(200);
  expect(await renamed.json()).toEqual({ ...group, title: 'Новое' });
  expect((await (await api.get(`/api/chats/${group.id}`)).json()).title).toBe('Новое');

  for (const data of [{}, { title: 5 }, { title: '   ' }, { title: 'a'.repeat(101) }]) {
    await expectError(await rename(group.id, data), 400, 'validation_failed', undefined, JSON.stringify(data));
  }
  await expectError(await rename('no-such-chat', { title: 'X' }), 404, 'not_found');

  const direct = await (await api.post('/api/chats', { data: { type: 'direct', userId: bob.id }, headers })).json();
  await expectError(await rename(direct.id, { title: 'X' }), 400, 'validation_failed');
});

test('PATCH /api/chats/:id: не owner — 403 forbidden', async () => {
  const aliceSession = await (await signIn()).json();
  const bobApi = await request.newContext({ baseURL, maxRedirects: 0 });
  try {
    const bobSignIn = await bobApi.post('/api/auth/login', { data: { login: 'bob', password: 'correct-horse-1' } });
    expect(bobSignIn.status()).toBe(200);
    const bobHeaders = { 'X-CSRF-Token': (await bobSignIn.json()).csrfToken };
    const group = await (await bobApi.post('/api/chats', { data: { type: 'group', title: 'Bob group', memberIds: [] }, headers: bobHeaders })).json();
    expect((await bobApi.post(`/api/chats/${group.id}/members`, { data: { userId: aliceSession.user.id }, headers: bobHeaders })).status()).toBe(204);

    await expectError(await api.patch(`/api/chats/${group.id}`, { data: { title: 'X' }, headers: { 'X-CSRF-Token': aliceSession.csrfToken } }), 403, 'forbidden');
  } finally {
    await bobApi.dispose();
  }
});

test('DELETE /api/chats/:id/members/:userId: owner убирает участника — 204, ошибки 404/400/403', async () => {
  const csrfToken = await signInWithCsrf();
  const headers = { 'X-CSRF-Token': csrfToken };
  const [bob] = await (await api.get('/api/users?q=bob')).json();
  const group = await (await api.post('/api/chats', { data: { type: 'group', title: 'Team', memberIds: [] }, headers })).json();
  const ownerId = group.members[0].userId;
  expect((await api.post(`/api/chats/${group.id}/members`, { data: { userId: bob.id }, headers })).status()).toBe(204);
  const remove = (chatId, userId) => api.delete(`/api/chats/${chatId}/members/${userId}`, { headers });

  await expectError(await remove(group.id, ownerId), 403, 'forbidden');
  await expectError(await remove(group.id, 'no-such-user'), 404, 'not_found');
  await expectError(await remove('no-such-chat', bob.id), 404, 'not_found');
  const direct = await (await api.post('/api/chats', { data: { type: 'direct', userId: bob.id }, headers })).json();
  await expectError(await remove(direct.id, bob.id), 400, 'validation_failed');

  expect((await remove(group.id, bob.id)).status()).toBe(204);
  expect((await (await api.get(`/api/chats/${group.id}`)).json()).members).toEqual([expect.objectContaining({ userId: ownerId, role: 'owner' })]);
  await expectError(await remove(group.id, bob.id), 404, 'not_found');
});

test('DELETE /api/chats/:id/members/:userId: участник выходит сам — 204 и чат недоступен, чужого убрать — 403', async () => {
  const aliceSession = await (await signIn()).json();
  const aliceHeaders = { 'X-CSRF-Token': aliceSession.csrfToken };
  const [bob] = await (await api.get('/api/users?q=bob')).json();
  const bobApi = await request.newContext({ baseURL, maxRedirects: 0 });
  try {
    const bobSignIn = await bobApi.post('/api/auth/login', { data: { login: 'bob', password: 'correct-horse-1' } });
    expect(bobSignIn.status()).toBe(200);
    const bobHeaders = { 'X-CSRF-Token': (await bobSignIn.json()).csrfToken };
    const group = await (await bobApi.post('/api/chats', { data: { type: 'group', title: 'Bob group', memberIds: [] }, headers: bobHeaders })).json();
    expect((await bobApi.post(`/api/chats/${group.id}/members`, { data: { userId: aliceSession.user.id }, headers: bobHeaders })).status()).toBe(204);

    await expectError(await api.delete(`/api/chats/${group.id}/members/${bob.id}`, { headers: aliceHeaders }), 403, 'forbidden');
    expect((await api.delete(`/api/chats/${group.id}/members/${aliceSession.user.id}`, { headers: aliceHeaders })).status()).toBe(204);
    await expectError(await api.get(`/api/chats/${group.id}`), 404, 'not_found');
  } finally {
    await bobApi.dispose();
  }
});
