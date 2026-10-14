import { configureStore } from '@reduxjs/toolkit';
import reducer, { checkSession, login, logout, register, selectAuthStatus, selectAuthUser } from './auth';
import * as authApi from '../services/authApi';

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
});
