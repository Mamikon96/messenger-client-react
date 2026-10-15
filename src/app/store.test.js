import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from './store';
import { fetchChats } from './reducers/chats';
import * as chatsApi from './services/chatsApi';
import { chatCreated, selectChats } from './reducers/chats';
import { selectActiveChatId, chatSelected } from './reducers/activeChatId';
import { selectUsers, usersReceived } from './reducers/users';
import { selectChatMessages } from './reducers/messages';
import { messageAdded } from './reducers/messageEvents';
import { checkSession, logout, sessionClosed } from './reducers/auth';

jest.mock('./services/chatsApi');

const user = { id: '1', login: 'ann', firstName: 'Ann', lastName: '', name: 'Ann', avatarUrl: 'http://a/b.png' };

const emptyState = {
  chats: { ids: [], entities: {}, status: 'idle', requestId: null },
  messages: {},
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
