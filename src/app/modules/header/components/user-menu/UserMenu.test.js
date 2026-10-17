import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import Actions from '../actions/Actions';
import { rootReducer } from '../../../../store';
import { checkSession } from '../../../../reducers/auth';
import { startRealtime } from '../../../../reducers/realtime';
import { createWsService } from '../../../../services/wsService';
import * as authApi from '../../../../services/authApi';

jest.mock('../../../../services/authApi');
jest.mock('../../../../services/wsService', () => ({ createWsService: jest.fn() }));

const user = { id: '1', login: 'ann', firstName: 'Ann', lastName: '', name: 'Ann', avatarUrl: 'http://a/b.png' };

const renderMenu = () => {
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(checkSession.fulfilled(user, 'req'));
  render(
    <Provider store={store}>
      <Actions />
    </Provider>
  );
  return { store };
};

// клик не обёрнут в act (см. FE-20), поэтому ждём появления меню
const openMenu = async () => {
  userEvent.click(screen.getByRole('button', { name: 'Ann' }));
  return screen.findByRole('button', { name: 'Выйти' });
};

describe('меню пользователя', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('кнопка с именем пользователя открывает меню с «Выйти»', async () => {
    renderMenu();
    expect(screen.queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument();

    expect(await openMenu()).toBeInTheDocument();
  });

  it('«Выйти» делает запрос выхода и сбрасывает store (auth → anonymous)', async () => {
    authApi.logout.mockResolvedValue(undefined);
    const { store } = renderMenu();
    await openMenu();

    userEvent.click(screen.getByRole('button', { name: 'Выйти' }));

    await waitFor(() => expect(store.getState().auth.status).toBe('anonymous'));
    expect(authApi.logout).toHaveBeenCalledTimes(1);
    expect(store.getState()).toEqual({
      chats: { ids: [], entities: {}, status: 'idle', requestId: null },
      messages: {},
      outbox: { ids: [], entities: {} },
      users: { ids: [], entities: {} },
      activeChatId: null,
      realtime: { status: 'closed' },
      auth: { status: 'anonymous', user: null },
    });
  });

  it('ошибка выхода: сообщение в меню, пользователь остаётся, повторная попытка доступна', async () => {
    authApi.logout.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(undefined);
    const { store } = renderMenu();
    await openMenu();

    userEvent.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выйти. Попробуйте снова.');
    expect(store.getState().auth).toEqual({ status: 'authenticated', user });
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeEnabled();

    userEvent.click(screen.getByRole('button', { name: 'Выйти' }));

    await waitFor(() => expect(store.getState().auth.status).toBe('anonymous'));
    expect(authApi.logout).toHaveBeenCalledTimes(2);
  });

  describe('сокет и выход (FE-41)', () => {
    let socket;
    let wsOptions;

    beforeEach(() => {
      createWsService.mockImplementation((options) => {
        wsOptions = options;
        socket = { connect: jest.fn(), close: jest.fn() };
        return socket;
      });
    });

    it('сокет закрывается до запроса выхода', async () => {
      let closedBeforeRequest;
      authApi.logout.mockImplementation(async () => {
        closedBeforeRequest = socket.close.mock.calls.length;
      });
      const { store } = renderMenu();
      store.dispatch(startRealtime());
      await openMenu();

      userEvent.click(screen.getByRole('button', { name: 'Выйти' }));

      await waitFor(() => expect(store.getState().auth.status).toBe('anonymous'));
      expect(closedBeforeRequest).toBe(1);
    });

    it('ошибка выхода подключает сокет снова, если он был активен', async () => {
      authApi.logout.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const { store } = renderMenu();
      store.dispatch(startRealtime());
      act(() => wsOptions.onStatus('open'));
      await openMenu();

      userEvent.click(screen.getByRole('button', { name: 'Выйти' }));

      await screen.findByRole('alert');
      expect(socket.close).toHaveBeenCalledTimes(1);
      expect(socket.connect).toHaveBeenCalledTimes(2);
    });

    it.each(['displaced', 'closed'])('ошибка выхода при статусе %s сокет не подключает', async (status) => {
      authApi.logout.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const { store } = renderMenu();
      store.dispatch(startRealtime());
      act(() => wsOptions.onStatus(status));
      await openMenu();

      userEvent.click(screen.getByRole('button', { name: 'Выйти' }));

      await screen.findByRole('alert');
      expect(socket.connect).toHaveBeenCalledTimes(1);
    });
  });
});
