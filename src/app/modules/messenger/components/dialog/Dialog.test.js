import { render, screen, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import Dialog from './Dialog';
import { rootReducer } from '../../../../store';
import { checkSession } from '../../../../reducers/auth';
import { chatSelected } from '../../../../reducers/activeChatId';
import { chatCreated, fetchChats, selectChats } from '../../../../reducers/chats';
import { selectChatMessages, sendMessage } from '../../../../reducers/messages';

jest.mock('../../../../services/authApi');
jest.mock('../../../../services/chatsApi');

const chatsApi = require('../../../../services/chatsApi');

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

describe('Dialog: история серверного чата', () => {
  const msg = (seq, senderId, body) => ({ chatId: 'g1', seq, senderId, clientId: `k${seq}`, body, createdAt: '2026-10-15T10:00:00.000Z' });
  const listGroup = { id: 'g1', type: 'group', title: 'Команда', lastSeq: 2, lastMessage: null, unreadCount: 0 };
  const listDirect = { id: 'd1', type: 'direct', title: null, lastSeq: 0, lastMessage: null, unreadCount: 0, peer: { id: 'u2', name: 'Боб', avatarUrl: '' } };
  const groupDto = {
    id: 'g1',
    type: 'group',
    title: 'Команда',
    lastSeq: 2,
    members: [
      { userId: 'u1', name: 'Ann', avatarUrl: '', role: 'owner' },
      { userId: 'u2', name: 'Боб', avatarUrl: '', role: 'member' },
    ],
  };

  const directDto = { id: 'd1', type: 'direct', title: null, lastSeq: 1, members: [{ userId: 'u2', name: 'Боб', avatarUrl: '', role: 'member' }] };

  const renderServerChat = (activeId = 'g1') => {
    const store = configureStore({ reducer: rootReducer });
    store.dispatch(checkSession.fulfilled(user, 'req'));
    store.dispatch(fetchChats.pending('req'));
    store.dispatch(fetchChats.fulfilled([listGroup, listDirect], 'req'));
    render(
      <Provider store={store}>
        <Dialog />
      </Provider>
    );
    act(() => {
      store.dispatch(chatSelected(activeId));
    });
    return { store };
  };

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('при выборе чата грузит его; пока идёт загрузка — «Загрузка сообщений…», затем сообщения и заголовок', async () => {
    let release;
    chatsApi.fetchChat.mockResolvedValue(groupDto);
    chatsApi.fetchMessages.mockImplementation(() => new Promise((resolve) => { release = () => resolve([msg(1, 'u2', 'привет'), msg(2, 'u1', 'здорово')]); }));

    renderServerChat();

    expect(await screen.findByRole('status')).toHaveTextContent('Загрузка сообщений…');
    expect(screen.getByText('Команда')).toBeInTheDocument();
    await act(async () => {
      release();
    });

    expect(await screen.findByText('привет')).toBeInTheDocument();
    expect(screen.getByText('здорово')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('у direct-чата заголовок — имя собеседника', async () => {
    chatsApi.fetchChat.mockResolvedValue(directDto);
    chatsApi.fetchMessages.mockResolvedValue([{ ...msg(1, 'u2', 'привет'), chatId: 'd1' }]);

    renderServerChat('d1');

    expect(await screen.findByText('привет')).toBeInTheDocument();
    expect(screen.getByText('Боб', { selector: '.dialog__header-title' })).toBeInTheDocument();
  });

  it('в группе у чужих сообщений есть имя автора, у своих — нет', async () => {
    chatsApi.fetchChat.mockResolvedValue(groupDto);
    chatsApi.fetchMessages.mockResolvedValue([msg(1, 'u2', 'привет'), msg(2, 'u1', 'здорово')]);

    renderServerChat();

    expect(await screen.findByText('привет')).toBeInTheDocument();
    expect(within(screen.getByText('привет')).getByText('Боб')).toBeInTheDocument();
    expect(within(screen.getByText('здорово')).queryByText('Ann')).not.toBeInTheDocument();
  });

  it('в direct-чате имя автора у сообщений не показывается', async () => {
    chatsApi.fetchChat.mockResolvedValue({ id: 'd1', type: 'direct', title: null, lastSeq: 1, members: [{ userId: 'u2', name: 'Боб', avatarUrl: '', role: 'member' }] });
    chatsApi.fetchMessages.mockResolvedValue([{ ...msg(1, 'u2', 'привет'), chatId: 'd1' }]);

    renderServerChat('d1');

    expect(await screen.findByText('привет')).toBeInTheDocument();
    expect(within(screen.getByText('привет')).queryByText('Боб')).not.toBeInTheDocument();
  });

  it('сбой: «Не удалось загрузить сообщения.» и «Повторить», по нажатию история грузится', async () => {
    chatsApi.fetchChat.mockResolvedValue(groupDto);
    chatsApi.fetchMessages.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce([msg(1, 'u2', 'привет')]);

    renderServerChat();

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить сообщения.');
    const retry = screen.getByRole('button', { name: 'Повторить' });
    await act(async () => {
      retry.click();
    });

    expect(await screen.findByText('привет')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('повторное открытие загруженного чата запроса не делает', async () => {
    chatsApi.fetchChat.mockImplementation(async (id) => (id === 'g1' ? groupDto : directDto));
    chatsApi.fetchMessages.mockImplementation(async (id) => (id === 'g1' ? [msg(1, 'u2', 'привет')] : [{ ...msg(1, 'u2', 'привет в личке'), chatId: 'd1' }]));

    const { store } = renderServerChat();
    expect(await screen.findByText('привет')).toBeInTheDocument();

    act(() => {
      store.dispatch(chatSelected('d1'));
    });
    expect(await screen.findByText('привет в личке')).toBeInTheDocument();
    act(() => {
      store.dispatch(chatSelected('g1'));
    });

    expect(await screen.findByText('привет')).toBeInTheDocument();
    expect(chatsApi.fetchMessages.mock.calls.filter(([id]) => id === 'g1')).toHaveLength(1);
  });

  it('локальный чат из Join: запросов нет, индикатор загрузки не показывается', () => {
    renderDialog();

    expect(chatsApi.fetchChat).not.toHaveBeenCalled();
    expect(chatsApi.fetchMessages).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
