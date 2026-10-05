import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import App from './App';
import authReducer from './app/reducers/auth';
import * as authApi from './app/services/authApi';

jest.mock('./app/services/authApi');
jest.mock('./app/modules/header/Header', () => () => <div>header</div>);
jest.mock('./app/modules/messenger/Messenger', () => () => <div>messenger</div>);

const user = { id: '1', name: 'Ann', avatarUrl: 'http://a/b.png', provider: 'google' };

const renderApp = (wrapper = ({ children }) => children) => {
  const store = configureStore({ reducer: { auth: authReducer } });
  const Wrapper = wrapper;
  return render(
    <Provider store={store}>
      <Wrapper>
        <App />
      </Wrapper>
    </Provider>
  );
};

describe('App: гейт входа', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('loading: пока идёт проверка сессии — «Загрузка…»', () => {
    authApi.fetchSession.mockReturnValue(new Promise(() => {}));
    renderApp();

    expect(screen.getByText('Загрузка…')).toBeInTheDocument();
    expect(screen.queryByText('messenger')).not.toBeInTheDocument();
  });

  it('anonymous: экран входа с кнопками Google и GitHub — навигация на /api/auth/{provider}/start', async () => {
    authApi.fetchSession.mockResolvedValue(null);
    renderApp();

    const google = await screen.findByRole('link', { name: 'Войти через Google' });
    const github = screen.getByRole('link', { name: 'Войти через GitHub' });
    expect(google).toHaveAttribute('href', '/api/auth/google/start');
    expect(github).toHaveAttribute('href', '/api/auth/github/start');
    expect(screen.queryByText('messenger')).not.toBeInTheDocument();
  });

  it('authenticated: показывает мессенджер', async () => {
    authApi.fetchSession.mockResolvedValue(user);
    renderApp();

    expect(await screen.findByText('messenger')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Войти через Google' })).not.toBeInTheDocument();
  });

  it('error: сообщение и «Повторить», повтор снова проверяет сессию', async () => {
    authApi.fetchSession.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(user);
    renderApp();

    expect(
      await screen.findByText('Не удалось проверить сессию. Проверьте соединение и попробуйте снова.')
    ).toBeInTheDocument();
    expect(authApi.fetchSession).toHaveBeenCalledTimes(1);

    userEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByText('messenger')).toBeInTheDocument();
    expect(authApi.fetchSession).toHaveBeenCalledTimes(2);
  });

  it('StrictMode: двойной вызов эффекта не оставляет в loading', async () => {
    authApi.fetchSession.mockResolvedValue(null);
    renderApp(({ children }) => <StrictMode>{children}</StrictMode>);

    await waitFor(() => expect(screen.queryByText('Загрузка…')).not.toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Войти через Google' })).toBeInTheDocument();
  });
});
