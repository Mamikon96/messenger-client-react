// Локальный mock-BFF: вход и регистрация по паролю по docs/client-integration.md (§1.3, §2.1–2.5).
// Только для разработки и e2e: пользователи и сессии живут в памяти процесса.
const http = require('http');
const crypto = require('crypto');

const SESSION_COOKIE = 'mock_session';
const MAX_MEMBERS = 100;
const MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE'];

const PASSWORD_SESSION_MAX_AGE = 400 * 24 * 60 * 60; // скользящий срок сессии по паролю, §2.2 и §7 client-integration.md
const LOGIN_PATTERN = /^[a-z0-9._-]{3,32}$/;
const SEED_PASSWORD = 'correct-horse-1';
const SEED_USERS = [
  { login: 'alice', firstName: 'Alice', lastName: 'Tester' },
  { login: 'bob', firstName: 'Bob', lastName: 'Tester' },
  { login: 'admin', firstName: 'Admin', lastName: 'Tester', isAdmin: true },
  { login: 'disabled', firstName: 'Disabled', lastName: 'Tester', disabled: true },
];
// Пары имени для регистрации выдаются по кругу, §2.1 client-integration.md (там случайные; в mock-BFF детерминированно).
const GENERATED_NAMES = [
  ['Сонный', 'Енот'],
  ['Дерзкая', 'Выдра'],
  ['Весёлый', 'Барсук'],
  ['Хитрая', 'Лиса'],
  ['Смелый', 'Ёж'],
];
// Короткий список частых паролей длиной от 12 байт вместо списка SecLists (FE-D39).
const COMMON_PASSWORDS = ['password1234', '123456789012', 'qwertyuiop12', 'iloveyou1234', 'letmein12345'];

const byteLength = (value) => Buffer.byteLength(value, 'utf8');
const isFilled = (value) => typeof value === 'string' && value.trim() !== '';

function createServer() {
  const sessions = new Map(); // sid -> { user, csrfToken }
  const users = new Map(); // login -> { password, disabled, isAdmin, user: SessionUser }
  const groupChats = new Map(); // chatId -> ChatDto группы (в списки не попадают; нужны для карточки и приглашений)
  const directChats = new Map(); // "idМеньший:idБольший" -> ChatDto (GET /api/chats их пока не отдаёт)
  let generatedNames = 0;

  const random = () => crypto.randomBytes(16).toString('hex');

  function json(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  function empty(res, status, headers = {}) {
    res.writeHead(status, headers);
    res.end();
  }

  function getSession(req) {
    const pair = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    const sid = pair && pair.slice(SESSION_COOKIE.length + 1);
    return sid && sessions.has(sid) ? { sid, ...sessions.get(sid) } : null;
  }

  // Без Secure: вход по паролю работает и по http://localhost (§2.2 client-integration.md: Secure только на https).
  function sessionCookie(value, maxAge) {
    return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
  }

  function createUser(login, password, firstName, lastName, flags = {}) {
    const user = {
      id: `user-${random()}`,
      login,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`.trim(),
      avatarUrl: '',
    };
    users.set(login, { password, user, ...flags });
    return user;
  }

  SEED_USERS.forEach(({ login, firstName, lastName, ...flags }) => createUser(login, SEED_PASSWORD, firstName, lastName, flags));

  function nextGeneratedName() {
    const pair = GENERATED_NAMES[generatedNames % GENERATED_NAMES.length];
    generatedNames += 1;
    return pair;
  }

  function error(res, status, code, message, details) {
    return json(res, status, { error: { code, message, ...(details && { details }) } });
  }

  // Тело запроса: объект; пустое тело — {}; битый JSON или не объект — null; обрыв запроса — null (FE-D40).
  function readBody(req) {
    return new Promise((resolve) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('error', () => resolve(null));
      req.on('aborted', () => resolve(null));
      req.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (text.trim() === '') return resolve({});
        try {
          const body = JSON.parse(text);
          return resolve(body && typeof body === 'object' && !Array.isArray(body) ? body : null);
        } catch {
          return resolve(null);
        }
      });
    });
  }

  function validateRegistration({ login, password }) {
    const details = [];
    if (!isFilled(login)) details.push({ field: 'login', code: 'required' });
    else if (login.trim().length > 32) details.push({ field: 'login', code: 'too_long' });
    else if (!LOGIN_PATTERN.test(login.trim().toLowerCase())) details.push({ field: 'login', code: 'invalid_format' });

    if (typeof password !== 'string' || password === '') details.push({ field: 'password', code: 'required' });
    else if (byteLength(password) < 12) details.push({ field: 'password', code: 'too_short' });
    else if (byteLength(password) > 256) details.push({ field: 'password', code: 'too_long' });
    else if (COMMON_PASSWORDS.includes(password.toLowerCase())) details.push({ field: 'password', code: 'too_common' });
    return details;
  }

  // Новая сессия браузера: прежняя (из cookie запроса) уничтожается, §2.1 client-integration.md.
  function startSession(req, res, status, user) {
    const previous = getSession(req);
    if (previous) sessions.delete(previous.sid);
    const sid = random();
    const csrfToken = random();
    sessions.set(sid, { csrfToken, user });
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookie(sid, PASSWORD_SESSION_MAX_AGE),
    });
    res.end(JSON.stringify({ user, csrfToken }));
  }

  async function register(req, res) {
    const body = await readBody(req);
    if (!body) return error(res, 400, 'validation_failed', 'Некорректное тело запроса');
    const details = validateRegistration(body);
    if (details.length) return error(res, 400, 'validation_failed', 'Проверьте поля формы', details);
    const login = body.login.trim().toLowerCase();
    if (users.has(login)) return error(res, 409, 'login_taken', 'Логин уже занят');
    const [firstName, lastName] = nextGeneratedName();
    return startSession(req, res, 201, createUser(login, body.password, firstName, lastName));
  }

  async function signIn(req, res) {
    const body = await readBody(req);
    if (!body) return error(res, 400, 'validation_failed', 'Некорректное тело запроса');
    const { login, password } = body;
    const details = [];
    if (!isFilled(login)) details.push({ field: 'login', code: 'required' });
    if (typeof password !== 'string' || password === '') details.push({ field: 'password', code: 'required' });
    if (details.length) return error(res, 400, 'validation_failed', 'Проверьте поля формы', details);
    const account = users.get(login.trim().toLowerCase());
    if (!account || account.password !== password) return error(res, 401, 'auth_failed', 'Неверный логин или пароль');
    if (account.disabled) return error(res, 403, 'user_disabled', 'Пользователь отключён');
    return startSession(req, res, 200, account.user);
  }

  function handleAuth(req, res, parts) {
    // GET /api/auth/session
    if (parts[2] === 'session' && req.method === 'GET') {
      const session = getSession(req);
      if (!session) return error(res, 401, 'unauthorized', 'Требуется вход');
      return json(res, 200, { user: session.user, csrfToken: session.csrfToken });
    }

    // POST /api/auth/register
    if (parts[2] === 'register' && req.method === 'POST') return register(req, res);

    // POST /api/auth/login
    if (parts[2] === 'login' && req.method === 'POST') return signIn(req, res);

    // POST /api/auth/logout
    if (parts[2] === 'logout' && req.method === 'POST') {
      const session = getSession(req);
      if (!session) return error(res, 401, 'unauthorized', 'Требуется вход');
      if (req.headers['x-csrf-token'] !== session.csrfToken) return error(res, 403, 'csrf_invalid', 'Неверный CSRF-токен');
      sessions.delete(session.sid);
      return empty(res, 204, { 'Set-Cookie': sessionCookie('', 0) });
    }

    return empty(res, 404);
  }

  return http.createServer((req, res) => {
    Promise.resolve()
      .then(() => route(req, res))
      .catch(() => {
        if (!res.headersSent) empty(res, 500);
      });
  });

  function route(req, res) {
    const url = new URL(req.url, 'http://mock-bff');
    const parts = url.pathname.split('/').filter(Boolean);

    if (parts[0] !== 'api') return empty(res, 404);
    if (parts[1] === 'auth') return handleAuth(req, res, parts);

    // Прочие /api/*: нужна сессия, изменяющие запросы — ещё и CSRF-заголовок.
    const session = getSession(req);
    if (!session) return error(res, 401, 'unauthorized', 'Требуется вход');
    if (MUTATING.includes(req.method) && req.headers['x-csrf-token'] !== session.csrfToken) return error(res, 403, 'csrf_invalid', 'Неверный CSRF-токен');
    // GET /api/users?q=
    if (req.method === 'GET' && parts.length === 2 && parts[1] === 'users') return searchUsers(res, url.searchParams, session);
    // POST /api/chats
    if (req.method === 'POST' && parts.length === 2 && parts[1] === 'chats') return postChat(req, res, session);
    // GET /api/chats (пока всегда пустой список)
    if (req.method === 'GET' && parts.length === 2 && parts[1] === 'chats') return json(res, 200, []);
    // GET /api/chats/:id (карточка группы, где я участник; прочих чатов в mock нет: 404)
    if (req.method === 'GET' && parts.length === 3 && parts[1] === 'chats') return getChat(res, parts[2], session);
    // POST /api/chats/:id/members
    if (req.method === 'POST' && parts.length === 4 && parts[1] === 'chats' && parts[3] === 'members') return postMember(req, res, parts[2], session);
    // GET /api/chats/:id/messages (чатов в mock нет: 404)
    if (req.method === 'GET' && parts.length === 4 && parts[1] === 'chats' && parts[3] === 'messages') return error(res, 404, 'not_found', 'Чат не найден');
    // POST /api/chats/:id/messages (чатов в mock нет: валидное тело -> 404)
    if (req.method === 'POST' && parts.length === 4 && parts[1] === 'chats' && parts[3] === 'messages') return postMessage(req, res);
    return empty(res, 404);
  }

  // Поиск по name, §3.1: q после trim 2..64 символа; без себя и отключённых; без q — весь справочник.
  function searchUsers(res, params, session) {
    const q = params.has('q') ? params.get('q').trim().toLowerCase() : null;
    if (q !== null && ([...q].length < 2 || [...q].length > 64)) return error(res, 400, 'validation_failed', 'Некорректный запрос поиска');
    const found = [...users.values()]
      .filter(({ disabled, user }) => !disabled && user.id !== session.user.id && (q === null || user.name.toLowerCase().includes(q)))
      .map(({ user }) => ({ id: user.id, name: user.name, avatarUrl: user.avatarUrl }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return json(res, 200, found);
  }

  function toMember({ id, name, avatarUrl }) {
    return { userId: id, name, avatarUrl, role: 'member' };
  }

  // Группа без участников, кроме создателя (owner), §3.3: title 1..100 единиц UTF-16 после trim -> 201. Чат в списки пока не попадает (как direct).
  function postGroupChat(res, body, session) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const noMembers = body.memberIds === undefined || (Array.isArray(body.memberIds) && body.memberIds.length === 0);
    if (title === '' || title.length > 100 || !noMembers) return error(res, 400, 'validation_failed', 'Проверьте поля формы');
    const { id, name, avatarUrl } = session.user;
    const chat = { id: crypto.randomUUID(), type: 'group', title, lastSeq: 0, members: [{ userId: id, name, avatarUrl, role: 'owner' }] };
    groupChats.set(chat.id, chat);
    return json(res, 201, chat);
  }

  // direct и group, §3.3. direct: 201 — создан, 200 — уже есть, 404 — собеседник неизвестен или отключён.
  async function postChat(req, res, session) {
    const body = await readBody(req);
    if (body && body.type === 'group') return postGroupChat(res, body, session);
    if (!body || body.type !== 'direct' || !isFilled(body.userId)) return error(res, 400, 'validation_failed', 'Проверьте поля формы');
    const peer = [...users.values()].find(({ user }) => user.id === body.userId);
    if (!peer || peer.disabled) return error(res, 404, 'not_found', 'Пользователь не найден');
    const key = [session.user.id, peer.user.id].sort().join(':');
    if (directChats.has(key)) return json(res, 200, directChats.get(key));
    const members = session.user.id === peer.user.id ? [session.user] : [session.user, peer.user];
    const chat = { id: crypto.randomUUID(), type: 'direct', title: null, lastSeq: 0, members: members.map(toMember) };
    directChats.set(key, chat);
    return json(res, 201, chat);
  }

  function getChat(res, chatId, session) {
    const chat = groupChats.get(chatId);
    if (!chat || !chat.members.some(({ userId }) => userId === session.user.id)) return error(res, 404, 'not_found', 'Чат не найден');
    return json(res, 200, chat);
  }

  // Добавление участника в группу, §3.5: 204; 400 — тело, direct или лимит 100; 403 — не owner; 404 — нет чата/не участник/цель; 409 — уже участник.
  async function postMember(req, res, chatId, session) {
    const body = await readBody(req);
    if (!body || !isFilled(body.userId)) return error(res, 400, 'validation_failed', 'Проверьте поля формы');
    const group = groupChats.get(chatId);
    const mine = group && group.members.find(({ userId }) => userId === session.user.id);
    const isDirect = [...directChats.values()].some(({ id, members }) => id === chatId && members.some(({ userId }) => userId === session.user.id));
    if (isDirect) return error(res, 400, 'validation_failed', 'В direct-чат участников не добавить');
    if (!mine) return error(res, 404, 'not_found', 'Чат не найден');
    if (mine.role !== 'owner') return error(res, 403, 'forbidden', 'Приглашать может только владелец');
    const target = [...users.values()].find(({ user }) => user.id === body.userId);
    if (!target || target.disabled) return error(res, 404, 'not_found', 'Пользователь не найден');
    if (group.members.some(({ userId }) => userId === target.user.id)) return error(res, 409, 'already_member', 'Уже участник');
    if (group.members.length >= MAX_MEMBERS) return error(res, 400, 'validation_failed', 'В группе не больше 100 участников');
    group.members.push(toMember(target.user));
    return empty(res, 204);
  }

  async function postMessage(req, res) {
    const body = await readBody(req);
    // Длина считается по телу «как есть» (кодовые точки), непустота — после trim.
    const text = body && typeof body.body === 'string' ? body.body : '';
    const valid = body && typeof body.clientId === 'string' && body.clientId !== '' && text.trim() !== '' && [...text].length <= 4000;
    if (!valid) return error(res, 400, 'validation_failed', 'Проверьте поля формы');
    return error(res, 404, 'not_found', 'Чат не найден');
  }
}

// Порт по умолчанию — 3334: на 3333 работает реальный бэкенд, e2e и QA не должны с ним конфликтовать (FE-81).
const DEFAULT_PORT = 3334;

if (require.main === module) {
  const port = process.env.MOCK_BFF_PORT || DEFAULT_PORT;
  createServer().listen(port, () => console.log(`mock-bff: http://localhost:${port}`));
}

module.exports = { createServer, DEFAULT_PORT };
