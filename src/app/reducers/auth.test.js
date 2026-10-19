import { configureStore } from '@reduxjs/toolkit';
import reducer, { checkSession, login, logout, register, selectAuthStatus, selectAuthUser, selectAuthUserId, selectSessionClosed, sessionClosed, userSwitched, recoverCsrf } from './auth';
import * as authApi from '../services/authApi';
import { ApiError } from '../services/apiClient';

jest.mock('../services/authApi');

const user = { id: '1', login: 'ann', firstName: 'Ann', lastName: '', name: 'Ann', avatarUrl: 'http://a/b.png' };

const makeStore = () => configureStore({ reducer: { auth: reducer } });

describe('auth slice', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('стартует в loading без пользователя', () => {
    expect(reducer(undefined, { type: '@@init' })).toEqual({ status: 'loading', user: null });
  });

  it('checkSession: сессия есть → authenticated с user', async () => {
    authApi.fetchSession.mockResolvedValue(user);
    const store = makeStore();

    const promise = store.dispatch(checkSession());
    expect(store.getState().auth.status).toBe('loading');
    await promise;

    expect(store.getState().auth).toEqual({ status: 'authenticated', user });
  });

  it('checkSession: сессии нет (null) → anonymous', async () => {
    authApi.fetchSession.mockResolvedValue(null);
    const store = makeStore();

    await store.dispatch(checkSession());

    expect(store.getState().auth).toEqual({ status: 'anonymous', user: null });
  });

  it('checkSession: сетевая/прочая ошибка → error, не anonymous', async () => {
    authApi.fetchSession.mockRejectedValue(new TypeError('Failed to fetch'));
    const store = makeStore();

    await store.dispatch(checkSession());

    expect(store.getState().auth).toEqual({ status: 'error', user: null });
  });

  it('checkSession передаёт signal в authApi', async () => {
    authApi.fetchSession.mockResolvedValue(null);
    const store = makeStore();

    await store.dispatch(checkSession());

    expect(authApi.fetchSession.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);
  });

  it('checkSession: отмена не меняет статус', async () => {
    authApi.fetchSession.mockImplementation(
      ({ signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        })
    );
    const store = makeStore();

    const promise = store.dispatch(checkSession());
    promise.abort();
    await promise;

    expect(store.getState().auth).toEqual({ status: 'loading', user: null });
  });

  it('повторная проверка после error снова уходит в loading', async () => {
    authApi.fetchSession.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(user);
    const store = makeStore();

    await store.dispatch(checkSession());
    const promise = store.dispatch(checkSession());
    expect(store.getState().auth.status).toBe('loading');
    await promise;

    expect(store.getState().auth.status).toBe('authenticated');
  });
  describe('logout', () => {
    const loggedInStore = async () => {
      authApi.fetchSession.mockResolvedValue(user);
      const store = makeStore();
      await store.dispatch(checkSession());
      return store;
    };

    it('успех → anonymous без пользователя, запрос через authApi.logout', async () => {
      const store = await loggedInStore();
      authApi.logout.mockResolvedValue(undefined);

      await store.dispatch(logout());

      expect(authApi.logout).toHaveBeenCalledTimes(1);
      expect(store.getState().auth).toEqual({ status: 'anonymous', user: null });
    });

    it('ошибка → остаёмся authenticated с пользователем, thunk отклонён', async () => {
      const store = await loggedInStore();
      authApi.logout.mockRejectedValue(new TypeError('Failed to fetch'));

      const result = await store.dispatch(logout());

      expect(logout.rejected.match(result)).toBe(true);
      expect(store.getState().auth).toEqual({ status: 'authenticated', user });
    });
  });

  describe.each([
    ['login', login, 'login'],
    ['register', register, 'register'],
  ])('%s (вход/регистрация по паролю)', (_, thunk, apiName) => {
    const credentials = { login: 'alice', password: 'correct-horse-1' };
    const anonymousStore = async () => {
      authApi.fetchSession.mockResolvedValue(null);
      const store = makeStore();
      await store.dispatch(checkSession());
      return store;
    };

    it('успех → authenticated с user из ответа, без повторной проверки сессии', async () => {
      const store = await anonymousStore();
      authApi[apiName].mockResolvedValue(user);

      await store.dispatch(thunk(credentials));

      expect(authApi[apiName]).toHaveBeenCalledWith(credentials);
      expect(authApi.fetchSession).toHaveBeenCalledTimes(1);
      expect(store.getState().auth).toEqual({ status: 'authenticated', user });
    });

    it('ошибка → остаёмся anonymous, thunk отклонён', async () => {
      const store = await anonymousStore();
      const error = Object.assign(new Error('API error 401'), { status: 401, code: 'auth_failed' });
      authApi[apiName].mockRejectedValue(error);

      const result = await store.dispatch(thunk(credentials));

      expect(thunk.rejected.match(result)).toBe(true);
      expect(store.getState().auth).toEqual({ status: 'anonymous', user: null });
    });

    it.each([
      ['401 auth_failed', new ApiError(401, { error: { code: 'auth_failed' } }), { kind: 'credentials' }],
      [
        '400 validation_failed с details',
        new ApiError(400, { error: { code: 'validation_failed', details: [{ field: 'password', code: 'too_common' }] } }),
        { kind: 'fields', fields: { password: 'too_common' } },
      ],
      ['429 с Retry-After', new ApiError(429, { error: { code: 'rate_limited' } }, { retryAfter: 30 }), { kind: 'rate_limited', retryAfter: 30 }],
      ['сеть', new TypeError('Failed to fetch'), { kind: 'unavailable' }],
    ])('ошибка %s → payload отклонённого thunk — модель ошибки формы', async (_, error, expected) => {
      const store = await anonymousStore();
      authApi[apiName].mockRejectedValue(error);

      const result = await store.dispatch(thunk(credentials));

      expect(thunk.rejected.match(result)).toBe(true);
      expect(result.payload).toEqual(expected);
      expect(store.getState().auth).toEqual({ status: 'anonymous', user: null });
    });
  });

  describe('селекторы', () => {
    it('selectAuthStatus возвращает статус', () => {
      expect(selectAuthStatus({ auth: { status: 'authenticated', user } })).toBe('authenticated');
    });

    it('selectAuthUser возвращает пользователя или null', () => {
      expect(selectAuthUser({ auth: { status: 'authenticated', user } })).toBe(user);
      expect(selectAuthUser({ auth: { status: 'anonymous', user: null } })).toBeNull();
    });
  });

  describe('selectAuthUserId', () => {
    it('возвращает id пользователя, без пользователя — undefined', () => {
      expect(selectAuthUserId({ auth: { status: 'authenticated', user } })).toBe(user.id);
      expect(selectAuthUserId({ auth: { status: 'anonymous', user: null } })).toBeUndefined();
    });
  });

  describe('sessionClosed (сессию закрыли вне этой вкладки)', () => {
    it('authenticated → sessionClosed без пользователя', () => {
      const state = reducer({ status: 'authenticated', user }, sessionClosed());

      expect(state).toEqual({ status: 'sessionClosed', user: null });
    });

    it.each(['loading', 'anonymous', 'error'])('при статусе %s событие игнорируется', (status) => {
      const before = { status, user: null };

      expect(reducer(before, sessionClosed())).toBe(before);
    });

    it('селектор selectSessionClosed истинен только в этом статусе', () => {
      expect(selectSessionClosed({ auth: { status: 'sessionClosed', user: null } })).toBe(true);
      expect(selectSessionClosed({ auth: { status: 'anonymous', user: null } })).toBe(false);
      expect(selectSessionClosed({ auth: { status: 'authenticated', user } })).toBe(false);
    });

    it('новый вход после закрытой сессии → authenticated', async () => {
      authApi.login.mockResolvedValue(user);
      const store = makeStore();
      store.dispatch(checkSession.fulfilled(user, 'req'));
      store.dispatch(sessionClosed());

      await store.dispatch(login({ login: 'ann', password: 'correct-horse-1' }));

      expect(store.getState().auth).toEqual({ status: 'authenticated', user });
    });

    it('неудачный вход не снимает сообщение о закрытой сессии', async () => {
      authApi.login.mockRejectedValue(Object.assign(new Error('x'), { status: 401, code: 'auth_failed' }));
      const store = makeStore();
      store.dispatch(checkSession.fulfilled(user, 'req'));
      store.dispatch(sessionClosed());

      await store.dispatch(login({ login: 'ann', password: 'wrong' }));

      expect(store.getState().auth.status).toBe('sessionClosed');
    });
  });
});

describe('userSwitched (в другой вкладке вошёл другой пользователь)', () => {
  const other = { ...user, id: '2', login: 'bob', name: 'Bob' };

  it('делает auth authenticated с новым пользователем', () => {
    expect(reducer({ status: 'authenticated', user }, userSwitched(other))).toEqual({ status: 'authenticated', user: other });
  });
});

describe('userSwitched вне authenticated', () => {
  it.each(['loading', 'anonymous', 'sessionClosed', 'error'])('в статусе %s игнорируется', (status) => {
    const before = { status, user: null };
    expect(reducer(before, userSwitched({ ...user, id: '2' }))).toBe(before);
  });
});

describe('recoverCsrf (перечитывание сессии после 403 csrf_invalid)', () => {
  const other = { ...user, id: '2', login: 'bob', name: 'Bob' };
  const makeAuthenticated = () => {
    const store = makeStore();
    store.dispatch({ type: 'auth/login/fulfilled', payload: user });
    return store;
  };

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('тот же пользователь → true (запрос можно повторять), состояние не меняется', async () => {
    authApi.fetchSession.mockResolvedValue({ ...user });
    const store = makeAuthenticated();

    await expect(store.dispatch(recoverCsrf()).unwrap()).resolves.toBe(true);

    expect(store.getState().auth).toEqual({ status: 'authenticated', user });
  });

  it('другой пользователь → false, auth переключён на нового', async () => {
    authApi.fetchSession.mockResolvedValue(other);
    const store = makeAuthenticated();

    await expect(store.dispatch(recoverCsrf()).unwrap()).resolves.toBe(false);

    expect(store.getState().auth).toEqual({ status: 'authenticated', user: other });
  });

  it('сессии нет (401 → null) → false, сессия закрыта', async () => {
    authApi.fetchSession.mockResolvedValue(null);
    const store = makeAuthenticated();

    await expect(store.dispatch(recoverCsrf()).unwrap()).resolves.toBe(false);

    expect(store.getState().auth).toEqual({ status: 'sessionClosed', user: null });
  });

  it('не authenticated (вышли, пока шёл запрос) → false, без userSwitched', async () => {
    authApi.fetchSession.mockResolvedValue(other);
    const store = makeStore();
    store.dispatch({ type: 'auth/logout/fulfilled' });

    await expect(store.dispatch(recoverCsrf()).unwrap()).resolves.toBe(false);

    expect(store.getState().auth).toEqual({ status: 'anonymous', user: null });
  });

  it('сбой перечитывания → thunk отклоняется, состояние не меняется', async () => {
    authApi.fetchSession.mockRejectedValue(new ApiError(500, null));
    const store = makeAuthenticated();

    await expect(store.dispatch(recoverCsrf()).unwrap()).rejects.toBeDefined();

    expect(store.getState().auth).toEqual({ status: 'authenticated', user });
  });
});
