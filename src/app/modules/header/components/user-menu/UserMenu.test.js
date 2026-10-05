import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import Actions from '../actions/Actions';
import { rootReducer } from '../../../../store';
import { checkSession } from '../../../../reducers/auth';
import * as authApi from '../../../../services/authApi';

jest.mock('../../../../services/authApi');

const user = { id: '1', name: 'Ann', avatarUrl: 'http://a/b.png', provider: 'google' };

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
      chats: [],
      users: [],
      activeChat: {},
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
});
