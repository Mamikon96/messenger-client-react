// Локальный mock-BFF по контракту .ai/memory/auth-contract.md.
// Только для разработки и e2e: сессии и state живут в памяти процесса, провайдер — фейковый.
const http = require('http');
const crypto = require('crypto');

const PROVIDERS = ['google', 'github'];
const SESSION_COOKIE = 'mock_session';
const MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE'];

function createServer() {
  const states = new Map(); // state -> provider
  const sessions = new Map(); // sid -> { user, csrfToken }

  const random = () => crypto.randomBytes(16).toString('hex');

  function redirect(res, location, headers = {}) {
    res.writeHead(302, { Location: location, ...headers });
    res.end();
  }

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

  function sessionCookie(value, maxAge) {
    return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
  }

  function handleAuth(req, res, url, parts) {
    // GET /api/auth/session
    if (parts[2] === 'session' && req.method === 'GET') {
      const session = getSession(req);
      if (!session) return empty(res, 401);
      return json(res, 200, { user: session.user, csrfToken: session.csrfToken });
    }

    // POST /api/auth/logout
    if (parts[2] === 'logout' && req.method === 'POST') {
      const session = getSession(req);
      if (!session) return empty(res, 401);
      if (req.headers['x-csrf-token'] !== session.csrfToken) return empty(res, 403);
      sessions.delete(session.sid);
      return empty(res, 204, { 'Set-Cookie': sessionCookie('', 0) });
    }

    const provider = parts[2];
    if (!PROVIDERS.includes(provider) || req.method !== 'GET') return empty(res, 404);

    // GET /api/auth/{provider}/start
    if (parts[3] === 'start') {
      const state = random();
      states.set(state, provider);
      return redirect(res, `/mock-provider/${provider}/authorize?state=${state}`);
    }

    // GET /api/auth/{provider}/callback
    if (parts[3] === 'callback') {
      const error = url.searchParams.get('error');
      const state = url.searchParams.get('state');
      if (error) {
        if (state) states.delete(state);
        return redirect(res, `/?auth_error=${error === 'access_denied' ? 'access_denied' : 'provider_error'}`);
      }
      if (!state || states.get(state) !== provider) return redirect(res, '/?auth_error=invalid_state');
      states.delete(state);
      const sid = random();
      sessions.set(sid, {
        csrfToken: random(),
        user: {
          id: `${provider}-user-1`,
          name: `Mock ${provider} user`,
          avatarUrl: `https://example.invalid/${provider}.png`,
          provider,
        },
      });
      return redirect(res, '/', { 'Set-Cookie': sessionCookie(sid, 7 * 24 * 60 * 60) });
    }

    return empty(res, 404);
  }

  return http.createServer((req, res) => {
    try {
      route(req, res);
    } catch {
      if (!res.headersSent) empty(res, 500);
    }
  });

  function route(req, res) {
    const url = new URL(req.url, 'http://mock-bff');
    const parts = url.pathname.split('/').filter(Boolean);

    // Фейковый провайдер: сразу подтверждает вход (?deny=1 — отказ пользователя).
    if (parts[0] === 'mock-provider' && parts[2] === 'authorize') {
      if (!PROVIDERS.includes(parts[1])) return empty(res, 404);
      const state = url.searchParams.get('state') || '';
      const query = new URLSearchParams(
        url.searchParams.has('deny') ? { error: 'access_denied', state } : { code: random(), state },
      );
      return redirect(res, `/api/auth/${parts[1]}/callback?${query}`);
    }

    if (parts[0] !== 'api') return empty(res, 404);
    if (parts[1] === 'auth') return handleAuth(req, res, url, parts);

    // Прочие /api/*: нужна сессия, изменяющие запросы — ещё и CSRF-заголовок.
    const session = getSession(req);
    if (!session) return empty(res, 401);
    if (MUTATING.includes(req.method) && req.headers['x-csrf-token'] !== session.csrfToken) return empty(res, 403);
    return empty(res, 404);
  }
}

if (require.main === module) {
  const port = process.env.MOCK_BFF_PORT || 3200;
  createServer().listen(port, () => console.log(`mock-bff: http://localhost:${port}`));
}

module.exports = { createServer };
