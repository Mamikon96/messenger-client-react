import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from './store';
import { fetchChats, selectChatById } from './reducers/chats';
import { loadChatHistory, loadOlderMessages } from './reducers/chatHistory';
import * as chatsApi from './services/chatsApi';
import { chatCreated, selectChats } from './reducers/chats';
import { selectActiveChatId, chatSelected } from './reducers/activeChatId';
import { selectUsers, usersReceived } from './reducers/users';
import { selectChatMessages, sendMessage } from './reducers/messages';
import { messageAdded } from './reducers/messageEvents';
import { outboxEnqueued, selectChatOutbox } from './reducers/outbox';
import { checkSession, logout, sessionClosed } from './reducers/auth';

jest.mock('./services/chatsApi');

const user = { id: '1', login: 'ann', firstName: 'Ann', lastName: '', name: 'Ann', avatarUrl: 'http://a/b.png' };

const emptyState = {
  chats: { ids: [], entities: {}, status: 'idle', requestId: null },
  messages: {},
  outbox: { ids: [], entities: {} },
  users: { ids: [], entities: {} },
  activeChatId: null,
};

const filledState = () => {
  let state = rootReducer(undefined, { type: '@@init' });
  state = rootReducer(state, chatCreated({ title: 'Room' }));
  const chatId = selectChats(state)[0].id;
  state = rootReducer(state, usersReceived([{ id: '1', name: 'Ann', avatarUrl: '' }]));
  state = rootReducer(state, chatSelected(chatId));
  state = rootReducer(
    state,
    messageAdded({ chatId, seq: 1, senderId: '1', clientId: 'k1', body: 'hi', createdAt: '2026-10-15T10:00:00.000Z' })
  );
  state = rootReducer(
    state,
    outboxEnqueued({ clientId: 'k2', chatId, senderId: '1', body: 'в очереди', createdAt: '2026-10-17T10:00:00.000Z' })
  );
  return rootReducer(state, checkSession.fulfilled(user, 'req'));
};

describe('rootReducer: сброс store при выходе', () => {
  it('до выхода в store есть чаты, пользователи, активный чат и user', () => {
    const state = filledState();

    const [chat] = selectChats(state);
    expect(chat.title).toBe('Room');
    expect(selectUsers(state)).toHaveLength(1);
    expect(selectChatMessages(state, chat.id)).toHaveLength(1);
    expect(selectActiveChatId(state)).toBe(chat.id);
    expect(selectChatOutbox(state, chat.id)).toHaveLength(1);
    expect(state.auth).toEqual({ status: 'authenticated', user });
  });

  it('logout.fulfilled одним действием сбрасывает все слайсы, auth → anonymous', () => {
    const state = rootReducer(filledState(), logout.fulfilled(undefined, 'req'));

    expect(state).toEqual({
      ...emptyState,
      auth: { status: 'anonymous', user: null },
    });
  });

  it('logout.rejected store не сбрасывает', () => {
    const before = filledState();
    const after = rootReducer(before, logout.rejected(new Error('x'), 'req'));

    expect(after).toEqual(before);
  });
});

describe('rootReducer: сессия закрыта вне этой вкладки', () => {
  it('sessionClosed одним действием сбрасывает все слайсы, auth → sessionClosed', () => {
    const state = rootReducer(filledState(), sessionClosed());

    expect(state).toEqual({
      ...emptyState,
      auth: { status: 'sessionClosed', user: null },
    });
  });

  it.each([
    ['anonymous', () => rootReducer(undefined, checkSession.fulfilled(null, 'req'))],
    ['после выхода', () => rootReducer(filledState(), logout.fulfilled(undefined, 'req'))],
    ['loading', () => rootReducer(undefined, { type: '@@init' })],
  ])('запоздавший 401 при статусе %s ничего не меняет (сообщения после обычного выхода нет)', (_, makeState) => {
    const before = makeState();

    expect(rootReducer(before, sessionClosed())).toBe(before);
  });
});

describe('rootReducer: запоздавшие ответы fetchChats после сброса store', () => {
  const peer = { id: 'u2', name: 'Bob', avatarUrl: '' };
  const direct = { id: 'd1', type: 'direct', title: null, lastSeq: 0, lastMessage: null, unreadCount: 0, peer };

  const makeAuthenticatedStore = () => {
    const store = configureStore({ reducer: rootReducer });
    store.dispatch(checkSession.fulfilled(user, 'req'));
    return store;
  };

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('ошибка запроса после sessionClosed не переводит сброшенный store в failed', async () => {
    let rejectRequest;
    chatsApi.fetchChats.mockImplementation(() => new Promise((_, reject) => { rejectRequest = reject; }));
    const store = makeAuthenticatedStore();
    const request = store.dispatch(fetchChats());

    store.dispatch(sessionClosed());
    rejectRequest(new Error('unauthorized'));
    await request;

    expect(store.getState().chats.status).toBe('idle');
  });

  it('ответ после выхода не кладёт чаты и собеседников прежнего пользователя', async () => {
    let resolveRequest;
    chatsApi.fetchChats.mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve; }));
    const store = makeAuthenticatedStore();
    const request = store.dispatch(fetchChats());

    store.dispatch(logout.fulfilled(undefined, 'req'));
    resolveRequest([direct]);
    await request;

    expect(store.getState().chats).toEqual({ ids: [], entities: {}, status: 'idle', requestId: null });
    expect(store.getState().users).toEqual({ ids: [], entities: {} });
  });
});

describe('rootReducer: запоздавший ответ истории после сброса store', () => {
  const group = { id: 'g1', type: 'group', title: 'Team', lastSeq: 120, lastMessage: null, unreadCount: 0 };
  const chatDto = { id: 'g1', type: 'group', title: 'Team', lastSeq: 120, members: [{ userId: 'u2', name: 'Bob', avatarUrl: '', role: 'member' }] };
  const page = (from, to) =>
    Array.from({ length: to - from + 1 }, (_, i) => ({ chatId: 'g1', seq: from + i, senderId: 'u2', clientId: `k${from + i}`, body: `m${from + i}`, createdAt: '2026-10-15T10:00:00.000Z' }));

  const storeWithChat = async () => {
    chatsApi.fetchChats.mockResolvedValue([group]);
    const store = configureStore({ reducer: rootReducer });
    await store.dispatch(fetchChats());
    return store;
  };

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('loadChatHistory: ответ после выхода ничего не записывает', async () => {
    const store = await storeWithChat();
    let release;
    chatsApi.fetchChat.mockImplementation(() => new Promise((resolve) => { release = () => resolve(chatDto); }));
    chatsApi.fetchMessages.mockResolvedValue(page(1, 3));

    const promise = store.dispatch(loadChatHistory('g1'));
    store.dispatch(logout.fulfilled(undefined, 'req'));
    release();
    await promise;

    expect(selectChatById(store.getState(), 'g1')).toBeUndefined();
    expect(store.getState().messages).toEqual({});
    expect(store.getState().users.entities).toEqual({});
  });

  it('loadOlderMessages: ответ после выхода ничего не записывает', async () => {
    const store = await storeWithChat();
    chatsApi.fetchChat.mockResolvedValue(chatDto);
    chatsApi.fetchMessages.mockResolvedValueOnce(page(71, 120));
    await store.dispatch(loadChatHistory('g1'));
    let release;
    chatsApi.fetchMessages.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(page(21, 70)); }));

    const promise = store.dispatch(loadOlderMessages('g1'));
    store.dispatch(logout.fulfilled(undefined, 'req'));
    release();
    await promise;

    expect(selectChatById(store.getState(), 'g1')).toBeUndefined();
    expect(store.getState().messages).toEqual({});
  });
});

describe('rootReducer: выход во время отправки сообщения (FE-40)', () => {
  // Jest 27 из react-scripts 5 не имеет advanceTimersByTimeAsync: сбрасываем микрозадачи до и после сдвига часов.
  const flush = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  const advance = async (ms) => {
    await flush();
    jest.advanceTimersByTime(ms);
    await flush();
  };
  const serverDto = { chatId: 's1', seq: 3, senderId: 'u1', clientId: 'k1', body: 'привет', createdAt: '2026-10-17T10:00:00.000Z' };
  const makeStore = async () => {
    chatsApi.fetchChats.mockResolvedValue([{ id: 's1', type: 'group', title: 'Srv', lastSeq: 2, lastMessage: null, unreadCount: 0 }]);
    const store = configureStore({ reducer: rootReducer });
    await store.dispatch(fetchChats());
    return store;
  };
  const send = (store) => store.dispatch(sendMessage({ chatId: 's1', senderId: 'u1', body: 'привет' }));

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0);
    chatsApi.postMessage.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('ответ сервера после выхода не возвращает сообщение в store', async () => {
    const store = await makeStore();
    let resolvePost;
    chatsApi.postMessage.mockReturnValue(new Promise((resolve) => { resolvePost = resolve; }));

    const done = send(store);
    store.dispatch(logout.fulfilled(undefined, 'r'));
    resolvePost(serverDto);
    await done;

    expect(store.getState().messages).toEqual({});
    expect(store.getState().outbox.ids).toEqual([]);
  });

  it('выход во время паузы перед повтором останавливает автоповторы', async () => {
    const store = await makeStore();
    chatsApi.postMessage.mockRejectedValue(new TypeError('Failed to fetch'));

    const done = send(store);
    await advance(0);
    expect(chatsApi.postMessage).toHaveBeenCalledTimes(1);
    store.dispatch(logout.fulfilled(undefined, 'r'));
    await advance(1000);
    await done;

    expect(chatsApi.postMessage).toHaveBeenCalledTimes(1);
    expect(store.getState().outbox.ids).toEqual([]);
  });

  it('ошибка запроса после выхода не ставит failed в очередь нового сеанса', async () => {
    const store = await makeStore();
    let rejectPost;
    chatsApi.postMessage.mockReturnValue(new Promise((_, reject) => { rejectPost = reject; }));

    const done = send(store);
    store.dispatch(logout.fulfilled(undefined, 'r'));
    rejectPost(new TypeError('Failed to fetch'));
    await done;

    expect(store.getState().outbox.ids).toEqual([]);
    expect(chatsApi.postMessage).toHaveBeenCalledTimes(1);
  });
});
