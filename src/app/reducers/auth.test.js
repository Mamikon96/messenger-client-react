import { configureStore } from '@reduxjs/toolkit';
import reducer, { checkSession } from './auth';
import * as authApi from '../services/authApi';

jest.mock('../services/authApi');

const user = { id: '1', name: 'Ann', avatarUrl: 'http://a/b.png', provider: 'google' };

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
});
