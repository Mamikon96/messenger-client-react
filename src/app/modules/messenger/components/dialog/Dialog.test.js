import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import Dialog from './Dialog';
import { rootReducer } from '../../../../store';
import { checkSession } from '../../../../reducers/auth';
import { chatSelected } from '../../../../reducers/activeChatId';
import { chatCreated, selectChats } from '../../../../reducers/chats';
import { selectChatMessages, sendMessage } from '../../../../reducers/messages';

jest.mock('../../../../services/authApi');

const user = { id: 'u1', login: 'ann', firstName: 'Ann', lastName: '', name: 'Ann', avatarUrl: 'http://a/b.png' };

const renderDialog = ({ withActiveChat = true, authorized = true } = {}) => {
  const store = configureStore({ reducer: rootReducer });
  if (authorized) store.dispatch(checkSession.fulfilled(user, 'req'));
  store.dispatch(chatCreated({ title: 'Room' }));
  store.dispatch(chatCreated({ title: 'Other' }));
  const [room, other] = selectChats(store.getState());
  if (withActiveChat) store.dispatch(chatSelected(room.id));
  render(
    <Provider store={store}>
      <Dialog />
    </Provider>
  );
  return { store, chatId: room.id, otherChatId: other.id, messagesOf: (id = room.id) => selectChatMessages(store.getState(), id) };
};

const input = () => screen.getByRole('textbox');
const sendButton = () => screen.getByRole('button', { name: 'Send' });

describe('Dialog: сообщения', () => {
  // состояние после событий применяется асинхронно (клики вне act, см. FE-20) — ждём через waitFor
  it('кнопка Send отправляет сообщение: оно в store и в диалоге, поле очищается', async () => {
    const { messagesOf, chatId } = renderDialog();

    userEvent.type(input(), 'Привет');
    userEvent.click(sendButton());

    expect(messagesOf()).toHaveLength(1);
    expect(messagesOf()[0]).toMatchObject({ chatId, seq: 1, senderId: 'u1', body: 'Привет' });
    expect(await screen.findByText('Привет')).toBeInTheDocument();
    await waitFor(() => expect(input()).toHaveValue(''));
  });

  it('Enter отправляет сообщение', async () => {
    const { messagesOf } = renderDialog();

    userEvent.type(input(), 'Привет{enter}');

    expect(messagesOf()).toHaveLength(1);
    await waitFor(() => expect(input()).toHaveValue(''));
  });

  it('Shift+Enter переносит строку и не отправляет', () => {
    const { messagesOf } = renderDialog();

    userEvent.type(input(), 'a{shift}{enter}{/shift}b');

    expect(messagesOf()).toHaveLength(0);
    expect(input()).toHaveValue('a\nb');
  });

  it('пустое и состоящее из пробелов сообщение не отправляется', () => {
    const { messagesOf } = renderDialog();

    userEvent.click(sendButton());
    userEvent.type(input(), '   {enter}');

    expect(messagesOf()).toHaveLength(0);
  });

  it('текст обрезается по краям', () => {
    const { messagesOf } = renderDialog();

    userEvent.type(input(), '  hi  {enter}');

    expect(messagesOf()[0].body).toBe('hi');
  });

  it('показывает только сообщения активного чата', () => {
    const { store, chatId, otherChatId } = renderDialog();
    act(() => {
      store.dispatch(sendMessage({ chatId, senderId: 'u1', body: 'в этом чате' }));
      store.dispatch(sendMessage({ chatId: otherChatId, senderId: 'u1', body: 'в другом чате' }));
    });

    expect(screen.getByText('в этом чате')).toBeInTheDocument();
    expect(screen.queryByText('в другом чате')).not.toBeInTheDocument();
  });

  it('без активного чата отправка недоступна', () => {
    const { messagesOf, otherChatId } = renderDialog({ withActiveChat: false });

    expect(input()).toBeDisabled();
    expect(sendButton()).toBeDisabled();
    expect(messagesOf()).toHaveLength(0);
    expect(messagesOf(otherChatId)).toHaveLength(0);
  });

  it('без пользователя в auth сообщение не отправляется', () => {
    const { messagesOf } = renderDialog({ authorized: false });

    userEvent.type(input(), 'Привет{enter}');
    userEvent.click(sendButton());

    expect(messagesOf()).toHaveLength(0);
  });

  it('чужое сообщение без модификатора _own, своё — с ним', () => {
    const { store, chatId } = renderDialog();
    act(() => {
      store.dispatch(sendMessage({ chatId, senderId: 'u1', body: 'моё' }));
      store.dispatch(sendMessage({ chatId, senderId: 'u2', body: 'чужое' }));
    });

    expect(screen.getByText('моё')).toHaveClass('_own');
    expect(screen.getByText('чужое')).not.toHaveClass('_own');
    expect(screen.getByText('чужое').className).toBe('dialog__message');
  });
});
