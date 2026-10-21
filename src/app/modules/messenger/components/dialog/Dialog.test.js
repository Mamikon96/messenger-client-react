import { render, screen, waitFor, act, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import Dialog from './Dialog';
import { rootReducer } from '../../../../store';
import { ApiError } from '../../../../services/apiClient';
import { checkSession } from '../../../../reducers/auth';
import { chatSelected } from '../../../../reducers/activeChatId';
import { chatReceived, fetchChats, selectChatById, selectChats } from '../../../../reducers/chats';
import { messageAdded } from '../../../../reducers/messageEvents';
import { selectChatMessages, sendMessage } from '../../../../reducers/messages';

jest.mock('../../../../services/authApi');
jest.mock('../../../../services/chatsApi');

const chatsApi = require('../../../../services/chatsApi');

// Ответ GET /api/chats/:id/messages: { messages, hasMore } (docs/client-integration.md, §3.9); hasMore задаёт сервер.
const withHasMore = (messages, hasMore = false) => ({ messages, hasMore });
const user = { id: 'u1', login: 'ann', firstName: 'Ann', lastName: '', name: 'Ann', avatarUrl: 'http://a/b.png' };

// Чат с флагом local (не из ответа сервера): фикстура вместо удалённого события chatCreated.
const localChat = (id, title) =>
  chatReceived({ id, type: 'group', title, lastSeq: 0, lastMessage: null, unreadCount: 0, local: true });

const renderDialog = ({ withActiveChat = true, authorized = true } = {}) => {
  const store = configureStore({ reducer: rootReducer });
  if (authorized) store.dispatch(checkSession.fulfilled(user, 'req'));
  store.dispatch(localChat('room', 'Room'));
  store.dispatch(localChat('other', 'Other'));
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

describe('Dialog: разметка, пустые состояния, прокрутка, фокус (FE-27)', () => {
  it('без выбранного чата — «Чат не выбран», «Сообщений пока нет» нет', () => {
    renderDialog({ withActiveChat: false });

    expect(screen.getByText('Чат не выбран')).toBeInTheDocument();
    expect(screen.queryByText('Сообщений пока нет')).not.toBeInTheDocument();
  });

  it('в пустом чате — «Сообщений пока нет», после отправки текст пропадает', async () => {
    renderDialog();

    expect(screen.getByText('Сообщений пока нет')).toBeInTheDocument();
    expect(screen.queryByText('Чат не выбран')).not.toBeInTheDocument();
    userEvent.type(input(), 'Привет{enter}');

    expect(await screen.findByText('Привет')).toBeInTheDocument();
    expect(screen.queryByText('Сообщений пока нет')).not.toBeInTheDocument();
  });

  it('сообщения — article внутри log «Сообщения»', async () => {
    const { store, chatId } = renderDialog();
    act(() => {
      store.dispatch(sendMessage({ chatId, senderId: 'u1', body: 'моё' }));
    });

    const log = screen.getByRole('log', { name: 'Сообщения' });
    expect(within(log).getByRole('article')).toHaveTextContent('моё');
  });

  it('после клика Send фокус в поле ввода', async () => {
    renderDialog();

    userEvent.type(input(), 'Привет');
    userEvent.click(sendButton());

    await waitFor(() => expect(input()).toHaveValue(''));
    expect(input()).toHaveFocus();
  });

  it('после отказа в отправке по клику Send (пусто, слишком длинно) фокус возвращается в поле', async () => {
    renderDialog();

    sendButton().focus();
    userEvent.click(sendButton());
    await waitFor(() => expect(input()).toHaveFocus());

    sendButton().focus();
    fireEvent.change(input(), { target: { value: 'а'.repeat(4001) } });
    fireEvent.click(sendButton());
    await waitFor(() => expect(input()).toHaveFocus());
  });

  it('при своём новом сообщении лента прокручивается вниз', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 500 });
    try {
      const { store, chatId } = renderDialog();
      const log = screen.getByRole('log', { name: 'Сообщения' });
      expect(log.scrollTop).toBe(500);
      log.scrollTop = 0;
      fireEvent.scroll(log);
      act(() => {
        store.dispatch(sendMessage({ chatId, senderId: 'u1', body: 'новое' }));
      });

      expect(log.scrollTop).toBe(500);
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', descriptor);
      else delete HTMLElement.prototype.scrollHeight;
    }
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
    chatsApi.fetchMessages.mockImplementation(() => new Promise((resolve) => { release = () => resolve(withHasMore([msg(1, 'u2', 'привет'), msg(2, 'u1', 'здорово')])); }));

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

  it('служебные статусы загрузки и ошибки лежат вне контейнера log', async () => {
    let release;
    chatsApi.fetchChat.mockResolvedValue(groupDto);
    chatsApi.fetchMessages.mockImplementation(() => new Promise((resolve) => { release = () => resolve(withHasMore([])); }));

    renderServerChat();

    const status = await screen.findByRole('status');
    const log = screen.getByRole('log', { name: 'Сообщения' });
    expect(log).not.toContainElement(status);
    expect(log).toHaveAttribute('aria-busy', 'true');
    await act(async () => {
      release();
    });
    await waitFor(() => expect(log).toHaveAttribute('aria-busy', 'false'));
  });

  it('у direct-чата заголовок — имя собеседника', async () => {
    chatsApi.fetchChat.mockResolvedValue(directDto);
    chatsApi.fetchMessages.mockResolvedValue(withHasMore([{ ...msg(1, 'u2', 'привет'), chatId: 'd1' }]));

    renderServerChat('d1');

    expect(await screen.findByText('привет')).toBeInTheDocument();
    expect(screen.getByText('Боб', { selector: '.dialog__header-title' })).toBeInTheDocument();
  });

  it('в группе под названием — число участников; пока состав неизвестен, счётчика нет', async () => {
    let release;
    chatsApi.fetchChat.mockImplementation(() => new Promise((resolve) => { release = () => resolve(groupDto); }));
    chatsApi.fetchMessages.mockResolvedValue(withHasMore([]));

    renderServerChat();

    expect(screen.queryByText(/участник/)).not.toBeInTheDocument();
    await act(async () => {
      release();
    });
    expect(await screen.findByText('2 участника', { selector: '.dialog__header-meta' })).toBeInTheDocument();
  });

  it.each([
    [0, '0 участников'],
    [1, '1 участник'],
    [4, '4 участника'],
    [5, '5 участников'],
    [11, '11 участников'],
    [14, '14 участников'],
    [21, '21 участник'],
    [22, '22 участника'],
    [111, '111 участников'],
    [112, '112 участников'],
  ])('склонение: %i → «%s»', async (count, label) => {
    const members = Array.from({ length: count }, (_, i) => ({ userId: `m${i}`, name: `М${i}`, avatarUrl: '', role: 'member' }));
    chatsApi.fetchChat.mockResolvedValue({ ...groupDto, members });
    chatsApi.fetchMessages.mockResolvedValue(withHasMore([]));

    renderServerChat();

    expect(await screen.findByText(label)).toBeInTheDocument();
  });

  it('у direct-чата счётчика участников нет', async () => {
    chatsApi.fetchChat.mockResolvedValue(directDto);
    chatsApi.fetchMessages.mockResolvedValue(withHasMore([{ ...msg(1, 'u2', 'привет'), chatId: 'd1' }]));

    renderServerChat('d1');

    expect(await screen.findByText('привет')).toBeInTheDocument();
    expect(screen.queryByText(/участник/)).not.toBeInTheDocument();
  });

  it('в группе у чужих сообщений есть имя автора, у своих — нет', async () => {
    chatsApi.fetchChat.mockResolvedValue(groupDto);
    chatsApi.fetchMessages.mockResolvedValue(withHasMore([msg(1, 'u2', 'привет'), msg(2, 'u1', 'здорово')]));

    renderServerChat();

    expect(await screen.findByText('привет')).toBeInTheDocument();
    expect(within(screen.getByText('привет')).getByText('Боб')).toBeInTheDocument();
    expect(within(screen.getByText('здорово')).queryByText('Ann')).not.toBeInTheDocument();
  });

  it('в direct-чате имя автора у сообщений не показывается', async () => {
    chatsApi.fetchChat.mockResolvedValue({ id: 'd1', type: 'direct', title: null, lastSeq: 1, members: [{ userId: 'u2', name: 'Боб', avatarUrl: '', role: 'member' }] });
    chatsApi.fetchMessages.mockResolvedValue(withHasMore([{ ...msg(1, 'u2', 'привет'), chatId: 'd1' }]));

    renderServerChat('d1');

    expect(await screen.findByText('привет')).toBeInTheDocument();
    expect(within(screen.getByText('привет')).queryByText('Боб')).not.toBeInTheDocument();
  });

  it('сбой: «Не удалось загрузить сообщения.» и «Повторить», по нажатию история грузится', async () => {
    chatsApi.fetchChat.mockResolvedValue(groupDto);
    chatsApi.fetchMessages.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(withHasMore([msg(1, 'u2', 'привет')]));

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
    chatsApi.fetchMessages.mockImplementation(async (id) => withHasMore(id === 'g1' ? [msg(1, 'u2', 'привет')] : [{ ...msg(1, 'u2', 'привет в личке'), chatId: 'd1' }]));

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

  it('во время загрузки и после сбоя «Сообщений пока нет» не показывается; после пустой истории — показывается', async () => {
    chatsApi.fetchChat.mockResolvedValue(groupDto);
    let release;
    chatsApi.fetchMessages.mockImplementationOnce(() => new Promise((_, reject) => { release = () => reject(new Error('network')); }));

    renderServerChat();

    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Сообщений пока нет')).not.toBeInTheDocument();
    await act(async () => {
      release();
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Сообщений пока нет')).not.toBeInTheDocument();

    chatsApi.fetchMessages.mockResolvedValueOnce(withHasMore([]));
    await act(async () => {
      screen.getByRole('button', { name: 'Повторить' }).click();
    });
    expect(await screen.findByText('Сообщений пока нет')).toBeInTheDocument();
  });

  it('локальный чат из Join: запросов нет, индикатор загрузки не показывается', () => {
    renderDialog();

    expect(chatsApi.fetchChat).not.toHaveBeenCalled();
    expect(chatsApi.fetchMessages).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('Dialog: отправка в серверном чате (FE-40)', () => {
  const listGroup = { id: 'g1', type: 'group', title: 'Команда', lastSeq: 0, lastMessage: null, unreadCount: 0 };
  const groupDto = { id: 'g1', type: 'group', title: 'Команда', lastSeq: 0, members: [{ userId: 'u1', name: 'Ann', avatarUrl: '', role: 'owner' }] };
  const created = (seq, body, clientId = 'k1') => ({ chatId: 'g1', seq, senderId: 'u1', clientId, body, createdAt: '2026-10-17T10:00:00.000Z' });

  const renderServerChat = async () => {
    chatsApi.fetchChat.mockResolvedValue(groupDto);
    chatsApi.fetchMessages.mockResolvedValue(withHasMore([]));
    const store = configureStore({ reducer: rootReducer });
    store.dispatch(checkSession.fulfilled(user, 'req'));
    store.dispatch(fetchChats.pending('req'));
    store.dispatch(fetchChats.fulfilled([listGroup], 'req'));
    render(
      <Provider store={store}>
        <Dialog />
      </Provider>
    );
    await act(async () => {
      store.dispatch(chatSelected('g1'));
    });
    return { store };
  };

  const setText = (value) => fireEvent.change(input(), { target: { value } });
  const pressEnter = () => fireEvent.keyDown(input(), { key: 'Enter' });
  const typeAndSend = (value) => {
    setText(value);
    pressEnter();
  };

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('сообщение сразу видно с иконкой «Отправляется», после ответа сервера — «Отправлено»', async () => {
    let release;
    chatsApi.postMessage.mockImplementation((chatId, { clientId }) => new Promise((resolve) => { release = () => resolve(created(1, 'привет', clientId)); }));
    await renderServerChat();

    typeAndSend('привет');

    expect(await screen.findByText('привет')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Отправляется' })).toBeInTheDocument();
    expect(chatsApi.postMessage).toHaveBeenCalledWith('g1', expect.objectContaining({ body: 'привет', clientId: expect.any(String) }));
    await act(async () => {
      release();
    });

    expect(await screen.findByRole('img', { name: 'Отправлено' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Отправляется' })).not.toBeInTheDocument();
    expect(screen.getAllByText('привет')).toHaveLength(1);
  });

  it('при ошибке 400 — кнопка «Не отправлено. Повторить»; нажатие отправляет тот же clientId, дубликата нет', async () => {
    chatsApi.postMessage.mockRejectedValueOnce(new ApiError(400, null));
    await renderServerChat();
    typeAndSend('привет');

    const retry = await screen.findByRole('button', { name: 'Не отправлено. Повторить' });
    const firstClientId = chatsApi.postMessage.mock.calls[0][1].clientId;
    chatsApi.postMessage.mockResolvedValueOnce(created(1, 'привет', firstClientId));
    fireEvent.click(retry);

    expect(await screen.findByRole('img', { name: 'Отправлено' })).toBeInTheDocument();
    expect(chatsApi.postMessage).toHaveBeenCalledTimes(2);
    expect(chatsApi.postMessage.mock.calls[1][1].clientId).toBe(firstClientId);
    expect(screen.getAllByText('привет')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Повторить/ })).not.toBeInTheDocument();
  });

  it('ошибка доставки: кнопка повтора стоит рядом с пузырём, а не внутри него', async () => {
    chatsApi.postMessage.mockRejectedValueOnce(new ApiError(400, null));
    await renderServerChat();
    typeAndSend('привет');

    const retry = await screen.findByRole('button', { name: 'Не отправлено. Повторить' });
    const bubble = screen.getByText('привет');

    expect(bubble).not.toContainElement(retry);
    expect(screen.getByRole('article')).toContainElement(retry);
  });

  it('после повтора с клавиатуры фокус уходит в поле ввода, а не на body', async () => {
    chatsApi.postMessage.mockRejectedValueOnce(new ApiError(400, null));
    await renderServerChat();
    typeAndSend('привет');

    const retry = await screen.findByRole('button', { name: 'Не отправлено. Повторить' });
    const firstClientId = chatsApi.postMessage.mock.calls[0][1].clientId;
    chatsApi.postMessage.mockResolvedValueOnce(created(1, 'привет', firstClientId));
    retry.focus();
    fireEvent.click(retry);

    expect(input()).toHaveFocus();
    expect(await screen.findByRole('img', { name: 'Отправлено' })).toBeInTheDocument();
  });

  it('текст длиннее 4000 кодовых точек: счётчик «N / 4000», Send и Enter не отправляют, текст не обрезается', async () => {
    await renderServerChat();
    const long = '😀'.repeat(4001);

    setText(long);
    fireEvent.click(sendButton());
    pressEnter();

    expect(screen.getByRole('alert')).toHaveTextContent('4001 / 4000');
    expect(chatsApi.postMessage).not.toHaveBeenCalled();
    expect(input()).toHaveValue(long);
  });

  it('после сокращения до 4000 счётчик пропадает и сообщение отправляется', async () => {
    chatsApi.postMessage.mockResolvedValue(created(1, 'x'.repeat(4000)));
    await renderServerChat();
    setText('x'.repeat(4001));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    setText('x'.repeat(4000));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(sendButton());

    await waitFor(() => expect(chatsApi.postMessage).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('img', { name: 'Отправлено' })).toBeInTheDocument();
    expect(input()).toHaveValue('');
  });

  it('при превышении поле помечено aria-invalid и связано со счётчиком, после сокращения атрибутов нет', async () => {
    await renderServerChat();

    setText('x'.repeat(4001));

    const counter = screen.getByRole('alert');
    expect(counter).toHaveAttribute('id');
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    expect(input()).toHaveAttribute('aria-describedby', counter.id);

    setText('x'.repeat(4000));

    expect(input()).not.toHaveAttribute('aria-invalid');
    expect(input()).not.toHaveAttribute('aria-describedby');
  });

  it('в local-чате иконки статуса нет и POST не уходит', () => {
    const { messagesOf } = renderDialog();

    typeAndSend('локально');

    expect(messagesOf()).toHaveLength(1);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(chatsApi.postMessage).not.toHaveBeenCalled();
  });
});

describe('Dialog: подкачка старых сообщений и прокрутка (FE-138)', () => {
  const PAGE = 50;
  const msg = (seq, senderId = 'u2') => ({ chatId: 'g1', seq, senderId, clientId: `k${seq}`, body: `m${seq}`, createdAt: '2026-10-15T10:00:00.000Z' });
  const page = (from, count) => Array.from({ length: count }, (_, i) => msg(from + i));
  const listGroup = { id: 'g1', type: 'group', title: 'Команда', lastSeq: 100, lastMessage: null, unreadCount: 0 };
  const groupDto = {
    id: 'g1',
    type: 'group',
    title: 'Команда',
    lastSeq: 100,
    members: [
      { userId: 'u1', name: 'Ann', avatarUrl: '', role: 'owner' },
      { userId: 'u2', name: 'Боб', avatarUrl: '', role: 'member' },
    ],
  };
  const descriptors = {};
  const log = () => screen.getByRole('log', { name: 'Сообщения' });

  // jsdom не считает раскладку: высота ленты — 10px на сообщение, окно — 200px.
  beforeEach(() => {
    descriptors.scrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    descriptors.clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this.getAttribute('role') === 'log' ? within(this).queryAllByRole('article').length * 10 : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return this.getAttribute('role') === 'log' ? 200 : 0;
      },
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
    for (const key of ['scrollHeight', 'clientHeight']) {
      if (descriptors[key]) Object.defineProperty(HTMLElement.prototype, key, descriptors[key]);
      else delete HTMLElement.prototype[key];
    }
  });

  const open = async (firstPage, hasMore = firstPage.length >= PAGE) => {
    chatsApi.fetchChat.mockResolvedValue(groupDto);
    chatsApi.fetchMessages.mockResolvedValueOnce(withHasMore(firstPage, hasMore));
    const store = configureStore({ reducer: rootReducer });
    store.dispatch(checkSession.fulfilled(user, 'req'));
    store.dispatch(fetchChats.pending('req'));
    store.dispatch(fetchChats.fulfilled([listGroup], 'req'));
    render(
      <Provider store={store}>
        <Dialog />
      </Provider>
    );
    act(() => {
      store.dispatch(chatSelected('g1'));
    });
    await screen.findByText(`m${firstPage[firstPage.length - 1].seq}`);
    return { store };
  };

  const scrollTo = (top) => {
    log().scrollTop = top;
    fireEvent.scroll(log());
  };

  it('после первой загрузки лента внизу', async () => {
    await open(page(51, PAGE));

    expect(log().scrollTop).toBe(500);
  });

  it('прокрутка к верху запрашивает старые сообщения до минимального seq; пока грузятся — индикатор', async () => {
    await open(page(51, PAGE));
    let release;
    chatsApi.fetchMessages.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(withHasMore(page(1, PAGE), true)); }));

    scrollTo(0);

    expect(await screen.findByRole('status')).toHaveTextContent('Загрузка старых сообщений…');
    expect(chatsApi.fetchMessages).toHaveBeenLastCalledWith('g1', expect.objectContaining({ before: 51, limit: PAGE }));
    await act(async () => {
      release();
    });
    expect(await screen.findByText('m1')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('после подкачки позиция прокрутки сохраняется: сдвиг на высоту добавленного', async () => {
    await open(page(51, PAGE));
    chatsApi.fetchMessages.mockResolvedValueOnce(withHasMore(page(1, PAGE), true));

    scrollTo(0);

    await screen.findByText('m1');
    expect(log().scrollTop).toBe(500);
  });

  it('конец истории (меньше страницы): подкачка не запрашивается', async () => {
    await open(page(1, 3));
    chatsApi.fetchMessages.mockClear();

    scrollTo(0);

    expect(chatsApi.fetchMessages).not.toHaveBeenCalled();
  });

  it('конец истории: после подкачки неполной страницы повторная прокрутка вверх запроса не делает', async () => {
    await open(page(51, PAGE));
    chatsApi.fetchMessages.mockResolvedValueOnce(withHasMore(page(26, 25)));
    scrollTo(0);
    await screen.findByText('m26');
    chatsApi.fetchMessages.mockClear();

    scrollTo(0);

    expect(chatsApi.fetchMessages).not.toHaveBeenCalled();
  });

  it('сбой подкачки: сообщение и «Повторить», по нажатию подкачка повторяется', async () => {
    await open(page(51, PAGE));
    chatsApi.fetchMessages.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(withHasMore(page(1, PAGE), true));

    scrollTo(0);

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить старые сообщения.');
    await act(async () => {
      screen.getByRole('button', { name: 'Повторить' }).click();
    });
    expect(await screen.findByText('m1')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('чужое сообщение при чтении выше не прокручивает ленту', async () => {
    const { store } = await open(page(51, PAGE));
    scrollTo(100);

    act(() => {
      store.dispatch(messageAdded(msg(101)));
    });

    await screen.findByText('m101');
    expect(log().scrollTop).toBe(100);
  });

  it('чужое сообщение у низа ленты прокручивает вниз', async () => {
    const { store } = await open(page(51, PAGE));
    scrollTo(290);

    act(() => {
      store.dispatch(messageAdded(msg(101)));
    });

    await screen.findByText('m101');
    expect(log().scrollTop).toBe(510);
  });

  it('своё сообщение прокручивает вниз, даже если читаешь выше', async () => {
    const { store } = await open(page(51, PAGE));
    scrollTo(100);

    act(() => {
      store.dispatch(sendMessage({ chatId: 'g1', senderId: 'u1', body: 'моё' }));
    });

    await screen.findByText('моё');
    expect(log().scrollTop).toBe(510);
  });

  describe('окно не заполнено историей', () => {
    beforeEach(() => {
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
        configurable: true,
        get() {
          return this.getAttribute('role') === 'log' ? 1000 : 0;
        },
      });
    });

    it('подкачивает без прокрутки, пока лента короче окна, и останавливается на неполной странице', async () => {
      chatsApi.fetchMessages.mockResolvedValueOnce(withHasMore(page(51, PAGE), true)).mockResolvedValueOnce(withHasMore(page(1, PAGE), true));
      chatsApi.fetchChat.mockResolvedValue(groupDto);
      const store = configureStore({ reducer: rootReducer });
      store.dispatch(checkSession.fulfilled(user, 'req'));
      store.dispatch(fetchChats.pending('req'));
      store.dispatch(fetchChats.fulfilled([listGroup], 'req'));
      render(
        <Provider store={store}>
          <Dialog />
        </Provider>
      );
      act(() => {
        store.dispatch(chatSelected('g1'));
      });

      await screen.findByText('m1');
      expect(chatsApi.fetchMessages).toHaveBeenCalledWith('g1', expect.objectContaining({ before: 51 }));
      await waitFor(() => expect(chatsApi.fetchMessages).toHaveBeenLastCalledWith('g1', expect.objectContaining({ before: 1 })));
    });

    it('страница короче размера: новых запросов нет', async () => {
      await open(page(1, 3));

      expect(chatsApi.fetchMessages).toHaveBeenCalledTimes(1);
    });

    it('при сбое подкачки цикл останавливается: повторных запросов нет', async () => {
      chatsApi.fetchMessages.mockResolvedValueOnce(withHasMore(page(51, PAGE), true)).mockRejectedValueOnce(new Error('network'));
      chatsApi.fetchChat.mockResolvedValue(groupDto);
      const store = configureStore({ reducer: rootReducer });
      store.dispatch(checkSession.fulfilled(user, 'req'));
      store.dispatch(fetchChats.pending('req'));
      store.dispatch(fetchChats.fulfilled([listGroup], 'req'));
      render(
        <Provider store={store}>
          <Dialog />
        </Provider>
      );
      act(() => {
        store.dispatch(chatSelected('g1'));
      });

      expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить старые сообщения.');
      expect(chatsApi.fetchMessages).toHaveBeenCalledTimes(2);
    });
  });

  it('подтверждение своего сообщения сервером не прокручивает вниз, если пользователь ушёл вверх', async () => {
    const { store } = await open(page(51, PAGE));
    let confirm;
    chatsApi.postMessage.mockImplementation((chatId, { clientId, body }) => new Promise((resolve) => {
      confirm = () => resolve({ ...msg(101, 'u1'), clientId, body });
    }));
    act(() => {
      store.dispatch(sendMessage({ chatId: 'g1', senderId: 'u1', body: 'моё' }));
    });
    await screen.findByText('моё');
    scrollTo(100);

    await act(async () => {
      confirm();
    });

    await waitFor(() => expect(chatsApi.postMessage).toHaveBeenCalled());
    expect(log().scrollTop).toBe(100);
  });
});

describe('Dialog: отметка о прочтении (FE-43)', () => {
  const msg = (seq, senderId = 'u2') => ({ chatId: 'g1', seq, senderId, clientId: `k${seq}`, body: `m${seq}`, createdAt: '2026-10-15T10:00:00.000Z' });
  const listGroup = { id: 'g1', type: 'group', title: 'Команда', lastSeq: 3, lastMessage: null, unreadCount: 3 };
  const groupDto = { id: 'g1', type: 'group', title: 'Команда', lastSeq: 3, members: [{ userId: 'u2', name: 'Боб', avatarUrl: '', role: 'member' }] };
  const descriptors = {};
  const log = () => screen.getByRole('log', { name: 'Сообщения' });
  const setVisibility = (state) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  };
  const unread = (store) => selectChatById(store.getState(), 'g1').unreadCount;
  const settle = () => act(() => { jest.advanceTimersByTime(1000); });

  // jsdom не считает раскладку: высота ленты — 100px на сообщение, окно — 200px.
  beforeEach(() => {
    jest.useFakeTimers();
    setVisibility('visible');
    descriptors.scrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    descriptors.clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this.getAttribute('role') === 'log' ? within(this).queryAllByRole('article').length * 100 : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return this.getAttribute('role') === 'log' ? 200 : 0;
      },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
    delete document.visibilityState;
    for (const key of ['scrollHeight', 'clientHeight']) {
      if (descriptors[key]) Object.defineProperty(HTMLElement.prototype, key, descriptors[key]);
      else delete HTMLElement.prototype[key];
    }
  });

  const open = async () => {
    chatsApi.fetchChat.mockResolvedValue(groupDto);
    chatsApi.fetchMessages.mockResolvedValue(withHasMore([msg(1), msg(2), msg(3)]));
    chatsApi.postRead.mockResolvedValue(null);
    const store = configureStore({ reducer: rootReducer });
    store.dispatch(checkSession.fulfilled(user, 'req'));
    store.dispatch(fetchChats.pending('req'));
    store.dispatch(fetchChats.fulfilled([listGroup], 'req'));
    render(
      <Provider store={store}>
        <Dialog />
      </Provider>
    );
    act(() => {
      store.dispatch(chatSelected('g1'));
    });
    await screen.findByText('m3');
    return { store };
  };

  const scrollTo = (top) => {
    log().scrollTop = top;
    fireEvent.scroll(log());
  };

  it('чат открыт, лента внизу, вкладка видима: через debounce уходит POST read с max seq и счётчик обнуляется', async () => {
    const { store } = await open();
    expect(chatsApi.postRead).not.toHaveBeenCalled();

    await settle();

    expect(chatsApi.postRead).toHaveBeenCalledTimes(1);
    expect(chatsApi.postRead).toHaveBeenCalledWith('g1', { seq: 3, signal: expect.any(AbortSignal) });
    await waitFor(() => expect(unread(store)).toBe(0));
  });

  it('лента не у низа: POST не уходит, пока пользователь не прокрутит вниз', async () => {
    const { store } = await open();
    scrollTo(0);

    await settle();
    expect(chatsApi.postRead).not.toHaveBeenCalled();
    expect(unread(store)).toBe(3);

    scrollTo(100);
    await settle();
    expect(chatsApi.postRead).toHaveBeenCalledWith('g1', { seq: 3, signal: expect.any(AbortSignal) });
  });

  it('вкладка скрыта: POST не уходит, при возвращении на вкладку уходит', async () => {
    setVisibility('hidden');
    await open();

    await settle();
    expect(chatsApi.postRead).not.toHaveBeenCalled();

    setVisibility('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await settle();
    expect(chatsApi.postRead).toHaveBeenCalledTimes(1);
  });

  it('несколько прокруток подряд дают один запрос (debounce)', async () => {
    await open();

    scrollTo(300);
    scrollTo(310);
    scrollTo(320);
    await settle();

    expect(chatsApi.postRead).toHaveBeenCalledTimes(1);
  });

  it('новое сообщение у низа открытого чата отправляется с новым seq', async () => {
    const { store } = await open();
    await settle();
    chatsApi.postRead.mockClear();

    act(() => {
      store.dispatch(messageAdded(msg(4)));
    });
    await settle();

    expect(chatsApi.postRead).toHaveBeenCalledTimes(1);
    expect(chatsApi.postRead).toHaveBeenCalledWith('g1', { seq: 4, signal: expect.any(AbortSignal) });
  });

  it('уже отправленный seq повторно не отправляется', async () => {
    await open();
    await settle();

    scrollTo(300);
    await settle();

    expect(chatsApi.postRead).toHaveBeenCalledTimes(1);
  });

  it('ошибка запроса: счётчик не меняется, следующая прокрутка у низа повторяет отправку', async () => {
    const { store } = await open();
    chatsApi.postRead.mockRejectedValueOnce(new ApiError(500, null));
    await settle();
    await waitFor(() => expect(chatsApi.postRead).toHaveBeenCalledTimes(1));
    expect(unread(store)).toBe(3);

    scrollTo(300);
    await settle();

    expect(chatsApi.postRead).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(unread(store)).toBe(0));
  });

  it('локальный чат (без сервера): POST не уходит', async () => {
    renderDialog();

    await settle();

    expect(chatsApi.postRead).not.toHaveBeenCalled();
  });
});

describe('Dialog: статус «прочитано» (FE-113)', () => {
  const own = (seq) => ({ chatId: 'g1', seq, senderId: 'u1', clientId: `c${seq}`, body: `моё ${seq}`, createdAt: '2026-10-17T10:00:00.000Z' });
  const groupDto = { id: 'g1', type: 'group', title: 'Команда', lastSeq: 2, members: [{ userId: 'u1', name: 'Ann', avatarUrl: '', role: 'owner' }] };

  const renderWith = async (extra) => {
    chatsApi.fetchChat.mockResolvedValue(groupDto);
    chatsApi.fetchMessages.mockResolvedValue(withHasMore([own(1), own(2)]));
    const store = configureStore({ reducer: rootReducer });
    store.dispatch(checkSession.fulfilled(user, 'req'));
    store.dispatch(chatReceived({ id: 'g1', type: 'group', title: 'Команда', lastSeq: 2, lastMessage: null, unreadCount: 0, ...extra }));
    render(
      <Provider store={store}>
        <Dialog />
      </Provider>
    );
    await act(async () => {
      store.dispatch(chatSelected('g1'));
    });
  };

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('seq <= readSeq чата — две галки «Прочитано», остальные — «Отправлено»', async () => {
    await renderWith({ readSeq: 1 });

    expect(await screen.findAllByRole('img', { name: 'Прочитано' })).toHaveLength(1);
    expect(within(screen.getByText('моё 1')).getByRole('img', { name: 'Прочитано' })).toBeInTheDocument();
    expect(within(screen.getByText('моё 2')).getByRole('img', { name: 'Отправлено' })).toBeInTheDocument();
  });

  it('readSeq нет — все свои сообщения «Отправлено»', async () => {
    await renderWith({});

    expect(await screen.findAllByRole('img', { name: 'Отправлено' })).toHaveLength(2);
    expect(screen.queryByRole('img', { name: 'Прочитано' })).not.toBeInTheDocument();
  });
});

describe('Dialog: возврат к списку', () => {
  it('кнопка «Назад» снимает выбор чата (chatSelected(null))', () => {
    const { store } = renderDialog();
    expect(store.getState().activeChatId).not.toBeNull();

    userEvent.click(screen.getByRole('button', { name: 'Назад' }));

    expect(store.getState().activeChatId).toBeNull();
  });
});

describe('Dialog: кнопка «Пригласить» в шапке (FE-108)', () => {
  const renderChat = (chat) => {
    const store = configureStore({ reducer: rootReducer });
    store.dispatch(checkSession.fulfilled(user, 'req'));
    store.dispatch(chatReceived({ lastSeq: 0, lastMessage: null, unreadCount: 0, ...chat }));
    store.dispatch(chatSelected(chat.id));
    const names = { u1: 'Ann', u2: 'Bob' };
    chatsApi.fetchChat.mockResolvedValue({
      id: chat.id, type: chat.type, title: chat.title ?? null, lastSeq: 0,
      members: chat.members.map(({ userId, role }) => ({ userId, role, name: names[userId], avatarUrl: '' })),
    });
    chatsApi.fetchMessages.mockResolvedValue(withHasMore([]));
    render(
      <Provider store={store}>
        <Dialog />
      </Provider>
    );
  };

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('owner группы видит кнопку', () => {
    renderChat({ id: 'g1', type: 'group', title: 'T', members: [{ userId: 'u1', role: 'owner' }] });
    expect(screen.getByRole('button', { name: 'Пригласить' })).toBeInTheDocument();
  });

  it('member группы кнопку не видит', () => {
    renderChat({ id: 'g1', type: 'group', title: 'T', members: [{ userId: 'u1', role: 'member' }, { userId: 'u2', role: 'owner' }] });
    expect(screen.queryByRole('button', { name: 'Пригласить' })).not.toBeInTheDocument();
  });

  it('в direct-чате кнопки нет', () => {
    renderChat({ id: 'd1', type: 'direct', peerId: 'u2', members: [{ userId: 'u1', role: 'member' }, { userId: 'u2', role: 'member' }] });
    expect(screen.queryByRole('button', { name: 'Пригласить' })).not.toBeInTheDocument();
  });
});
