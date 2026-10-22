import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import Actions from '../actions/Actions';
import { rootReducer } from '../../../../store';
import { initTheme } from '../../../theme/theme';
import { checkSession } from '../../../../reducers/auth';
import { startRealtime } from '../../../../reducers/realtime';
import { createWsService } from '../../../../services/wsService';
import * as authApi from '../../../../services/authApi';

jest.mock('../../../../services/authApi');
jest.mock('../../../../services/wsService', () => ({ createWsService: jest.fn() }));

const user = { id: '1', login: 'ann', firstName: 'Ann', lastName: '', name: 'Ann', avatarUrl: 'http://a/b.png' };

const renderMenu = (authUser = user) => {
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(checkSession.fulfilled(authUser, 'req'));
  render(
    <Provider store={store}>
      <Actions />
    </Provider>
  );
  return { store };
};

const menuButton = () => screen.getByRole('button', { name: 'Ann' });

// клик не обёрнут в act (см. FE-20), поэтому ждём появления меню
const openMenu = async () => {
  userEvent.click(menuButton());
  return screen.findByRole('button', { name: 'Выйти' });
};

describe('меню пользователя', () => {
  beforeEach(() => {
    localStorage.clear();
    initTheme();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('кнопка: имя пользователя, без aria-haspopup, aria-expanded и aria-controls', async () => {
    renderMenu();
    expect(menuButton()).not.toHaveAttribute('aria-haspopup');
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false');

    await openMenu();

    expect(menuButton()).toHaveAttribute('aria-expanded', 'true');
    expect(menuButton().getAttribute('aria-controls')).toBeTruthy();
  });

  it('Esc закрывает меню и возвращает фокус на кнопку', async () => {
    renderMenu();
    await openMenu();

    userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument());
    expect(menuButton()).toHaveFocus();
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false');
  });

  it('клик снаружи закрывает меню', async () => {
    renderMenu();
    await openMenu();

    userEvent.click(document.body);

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument());
  });

  it('клик внутри меню его не закрывает', async () => {
    renderMenu();
    await openMenu();

    userEvent.click(screen.getByRole('group', { name: 'Тема' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
  });

  it.each([
    ['Esc', () => userEvent.keyboard('{Escape}')],
    ['клик снаружи', () => userEvent.click(document.body)],
    ['повторный клик по кнопке', () => userEvent.click(menuButton())],
  ])('ошибка выхода не переживает закрытие меню (%s)', async (_, close) => {
    authApi.logout.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderMenu();
    await openMenu();
    userEvent.click(screen.getByRole('button', { name: 'Выйти' }));
    await screen.findByRole('alert');

    close();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument());
    await openMenu();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ошибка выхода, пришедшая в закрытое меню, не показывается при следующем открытии', async () => {
    let rejectLogout;
    authApi.logout.mockImplementationOnce(() => new Promise((_, reject) => { rejectLogout = reject; }));
    renderMenu();
    await openMenu();
    userEvent.click(screen.getByRole('button', { name: 'Выйти' }));
    userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument());
    await act(async () => {
      rejectLogout(new TypeError('Failed to fetch'));
    });

    await openMenu();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('повторный клик по кнопке закрывает меню', async () => {
    renderMenu();
    await openMenu();

    userEvent.click(menuButton());

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument());
  });

  it('аватар с инициалами при пустом avatarUrl, имя кнопки остаётся именем пользователя', () => {
    renderMenu({ ...user, name: 'Ann Lee', avatarUrl: '' });

    expect(screen.getByRole('button', { name: 'Ann Lee' })).toHaveTextContent('AL');
  });

  it('выбор темы: три режима, текущий отмечен, выбор применяется и сохраняется', async () => {
    renderMenu();
    await openMenu();
    const group = screen.getByRole('group', { name: 'Тема' });
    ['Светлая', 'Тёмная', 'Как в системе'].forEach((label) => expect(within(group).getByRole('radio', { name: label })).toBeInTheDocument());
    expect(screen.getByRole('radio', { name: 'Как в системе' })).toBeChecked();

    userEvent.click(screen.getByRole('radio', { name: 'Тёмная' }));

    await waitFor(() => expect(screen.getByRole('radio', { name: 'Тёмная' })).toBeChecked());
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem('theme')).toBe('dark');
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
      chats: { ids: [], entities: {}, status: 'idle', requestId: null, pendingUserId: null, createRequestId: null, groupRequestId: null, inviteRequestId: null, invitingUserId: null, manageRequestId: null, managingTarget: null, openedWhileLoadingIds: [] },
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
