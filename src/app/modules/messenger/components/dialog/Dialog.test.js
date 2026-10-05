import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import Dialog from './Dialog';
import { rootReducer } from '../../../../store';
import { checkSession } from '../../../../reducers/auth';
import { setActiveChat } from '../../../../reducers/activeChat';
import { addMessage } from '../../../../reducers/messages';

jest.mock('../../../../services/authApi');

const user = { id: 'u1', name: 'Ann', avatarUrl: 'http://a/b.png', provider: 'google' };

const renderDialog = ({ activeChat = { id: 'c1', title: 'Room' }, authorized = true } = {}) => {
  const store = configureStore({ reducer: rootReducer });
  if (authorized) store.dispatch(checkSession.fulfilled(user, 'req'));
  if (activeChat) store.dispatch(setActiveChat(activeChat));
  render(
    <Provider store={store}>
      <Dialog />
    </Provider>
  );
  return { store };
};

const input = () => screen.getByRole('textbox');
const sendButton = () => screen.getByRole('button', { name: 'Send' });

describe('Dialog: сообщения', () => {
  // состояние после событий применяется асинхронно (клики вне act, см. FE-20) — ждём через waitFor
  it('кнопка Send отправляет сообщение: оно в store и в диалоге, поле очищается', async () => {
    const { store } = renderDialog();

    userEvent.type(input(), 'Привет');
    userEvent.click(sendButton());

    expect(store.getState().messages).toHaveLength(1);
    expect(store.getState().messages[0]).toMatchObject({ chatId: 'c1', authorId: 'u1', text: 'Привет' });
    expect(await screen.findByText('Привет')).toBeInTheDocument();
    await waitFor(() => expect(input()).toHaveValue(''));
  });

  it('Enter отправляет сообщение', async () => {
    const { store } = renderDialog();

    userEvent.type(input(), 'Привет{enter}');

    expect(store.getState().messages).toHaveLength(1);
    await waitFor(() => expect(input()).toHaveValue(''));
  });

  it('Shift+Enter переносит строку и не отправляет', () => {
    const { store } = renderDialog();

    userEvent.type(input(), 'a{shift}{enter}{/shift}b');

    expect(store.getState().messages).toHaveLength(0);
    expect(input()).toHaveValue('a\nb');
  });

  it('пустое и состоящее из пробелов сообщение не отправляется', () => {
    const { store } = renderDialog();

    userEvent.click(sendButton());
    userEvent.type(input(), '   {enter}');

    expect(store.getState().messages).toHaveLength(0);
  });

  it('текст обрезается по краям', () => {
    const { store } = renderDialog();

    userEvent.type(input(), '  hi  {enter}');

    expect(store.getState().messages[0].text).toBe('hi');
  });

  it('показывает только сообщения активного чата', () => {
    const { store } = renderDialog();
    act(() => {
      store.dispatch(addMessage({ chatId: 'c1', authorId: 'u1', text: 'в этом чате' }));
      store.dispatch(addMessage({ chatId: 'c2', authorId: 'u1', text: 'в другом чате' }));
    });

    expect(screen.getByText('в этом чате')).toBeInTheDocument();
    expect(screen.queryByText('в другом чате')).not.toBeInTheDocument();
  });

  it('без активного чата отправка недоступна', () => {
    const { store } = renderDialog({ activeChat: null });

    expect(input()).toBeDisabled();
    expect(sendButton()).toBeDisabled();
    expect(store.getState().messages).toHaveLength(0);
  });

  it('без пользователя в auth сообщение не отправляется', () => {
    const { store } = renderDialog({ authorized: false });

    userEvent.type(input(), 'Привет{enter}');
    userEvent.click(sendButton());

    expect(store.getState().messages).toHaveLength(0);
  });

  it('чужое сообщение без модификатора _own, своё — с ним', () => {
    const { store } = renderDialog();
    act(() => {
      store.dispatch(addMessage({ chatId: 'c1', authorId: 'u1', text: 'моё' }));
      store.dispatch(addMessage({ chatId: 'c1', authorId: 'u2', text: 'чужое' }));
    });

    expect(screen.getByText('моё')).toHaveClass('_own');
    expect(screen.getByText('чужое')).not.toHaveClass('_own');
    expect(screen.getByText('чужое').className).toBe('dialog__message');
  });
});
