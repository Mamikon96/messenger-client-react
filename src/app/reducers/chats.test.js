import { configureStore } from '@reduxjs/toolkit';
import reducer, { createDirectChat, selectPendingUserId, chatReceived, chatsReconciled, chatUpdated, fetchChats, toChatFromDto, selectChatById, selectChatHistory, selectChatMembersCount, selectChatName, selectChats, selectChatsStatus, markChatRead } from './chats';
import { loadChatHistory, loadOlderMessages, PAGE_SIZE } from './chatHistory';
import { chatRemoved, messageAdded } from './messageEvents';
import messages from './messages';
import users from './users';
import activeChatId from './activeChatId';
import auth, { checkSession } from './auth';
import { ApiError } from '../services/apiClient';
import * as chatsApi from '../services/chatsApi';

// Ответ GET /api/chats/:id/messages: { messages, hasMore } (docs/client-integration.md, §3.9); hasMore задаёт сервер.
const withHasMore = (messages, hasMore = false) => ({ messages, hasMore });

jest.mock('../services/chatsApi');

const wrap = (chats) => ({ chats });

// Чат с флагом local (не из ответа сервера): фикстура вместо удалённого события chatCreated.
const localChat = (id, title) =>
  chatReceived({ id, type: 'group', title, lastSeq: 0, lastMessage: null, unreadCount: 0, local: true });

describe('chats reducer', () => {
  it('начальное состояние — пустая нормализованная коллекция', () => {
    expect(reducer(undefined, { type: '@@init' })).toEqual({ ids: [], entities: {}, status: 'idle', requestId: null, pendingUserId: null, createRequestId: null, openedWhileLoadingIds: [] });
  });

  it('чаты хранятся в порядке добавления, без сортировки', () => {
    let state = reducer(undefined, localChat('b', 'Z'));
    state = reducer(state, localChat('a', 'A'));

    expect(selectChats(wrap(state)).map((chat) => chat.id)).toEqual(['b', 'a']);
  });

  describe('messageAdded обновляет lastSeq и lastMessage чата', () => {
    const message = { chatId: 'c1', seq: 1, senderId: 'u1', clientId: 'k1', body: 'hi', createdAt: '2026-10-15T10:00:00.000Z' };

    it('меняет только нужный чат', () => {
      let state = reducer(undefined, localChat('c1', 'One'));
      state = reducer(state, localChat('c2', 'Two'));

      state = reducer(state, messageAdded(message));

      expect(state.entities.c1).toMatchObject({ lastSeq: 1, lastMessage: message });
      expect(state.entities.c2).toMatchObject({ lastSeq: 0, lastMessage: null });
    });

    it('сообщения не по порядку не откатывают lastSeq и lastMessage', () => {
      let state = reducer(undefined, localChat('c1', 'One'));

      state = reducer(state, messageAdded({ ...message, seq: 3 }));
      state = reducer(state, messageAdded({ ...message, seq: 1 }));

      expect(state.entities.c1.lastSeq).toBe(3);
      expect(state.entities.c1.lastMessage.seq).toBe(3);
    });

    it('дубль seq не меняет lastMessage', () => {
      let state = reducer(undefined, localChat('c1', 'One'));
      state = reducer(state, messageAdded(message));

      state = reducer(state, messageAdded({ ...message, body: 'дубль' }));

      expect(state.entities.c1.lastMessage.body).toBe('hi');
    });

    it('сообщение неизвестного чата игнорируется', () => {
      const before = reducer(undefined, { type: '@@init' });

      expect(reducer(before, messageAdded(message))).toEqual(before);
    });

    it('unread: true увеличивает unreadCount, без флага — нет', () => {
      let state = reducer(undefined, localChat('c1', 'One'));

      state = reducer(state, messageAdded({ ...message, seq: 1 }));
      expect(state.entities.c1.unreadCount).toBe(0);
      state = reducer(state, messageAdded({ ...message, seq: 2 }, { unread: true }));
      state = reducer(state, messageAdded({ ...message, seq: 3 }, { unread: true }));

      expect(state.entities.c1.unreadCount).toBe(2);
    });

    it('дубль или более старое сообщение не увеличивает unreadCount', () => {
      let state = reducer(undefined, localChat('c1', 'One'));
      state = reducer(state, messageAdded({ ...message, seq: 2 }, { unread: true }));

      state = reducer(state, messageAdded({ ...message, seq: 2 }, { unread: true }));
      state = reducer(state, messageAdded({ ...message, seq: 1 }, { unread: true }));

      expect(state.entities.c1.unreadCount).toBe(1);
    });

    it('чат, у которого lastSeq уже известен, но lastMessage нет, принимает сообщение с seq = lastSeq', () => {
      let state = reducer(undefined, chatReceived({ id: 'c9', type: 'group', title: 'T', lastSeq: 4, lastMessage: null, unreadCount: 0 }));

      state = reducer(state, messageAdded({ ...message, chatId: 'c9', seq: 4 }, { unread: true }));

      expect(state.entities.c9).toMatchObject({ lastSeq: 4, unreadCount: 1 });
      expect(state.entities.c9.lastMessage.seq).toBe(4);
    });

    it('чат с известным lastSeq и без lastMessage считает непрочитанным и сообщение с seq < lastSeq, не откатывая lastSeq', () => {
      let state = reducer(undefined, chatReceived({ id: 'c9', type: 'group', title: 'T', lastSeq: 4, lastMessage: null, unreadCount: 0 }));

      state = reducer(state, messageAdded({ ...message, chatId: 'c9', seq: 3 }, { unread: true }));
      state = reducer(state, messageAdded({ ...message, chatId: 'c9', seq: 4 }, { unread: true }));

      expect(state.entities.c9).toMatchObject({ lastSeq: 4, unreadCount: 2 });
      expect(state.entities.c9.lastMessage.seq).toBe(4);
    });

    it('сообщение с seq < lastSeq без lastMessage не становится lastMessage и без флага unread не считается', () => {
      let state = reducer(undefined, chatReceived({ id: 'c9', type: 'group', title: 'T', lastSeq: 4, lastMessage: null, unreadCount: 0 }));

      state = reducer(state, messageAdded({ ...message, chatId: 'c9', seq: 3 }, { unread: true }));
      expect(state.entities.c9).toMatchObject({ lastSeq: 4, lastMessage: null, unreadCount: 1 });

      state = reducer(state, messageAdded({ ...message, chatId: 'c9', seq: 2 }));
      expect(state.entities.c9.unreadCount).toBe(1);
    });
  });

  describe('toChatFromDto', () => {
    const me = { userId: 'u1', name: 'Me', avatarUrl: '', role: 'member' };
    const bob = { userId: 'u2', name: 'Bob', avatarUrl: '', role: 'member' };

    it('группа: title, lastSeq и участники {userId, role}, без lastMessage и непрочитанных', () => {
      const dto = { id: 'g1', type: 'group', title: 'Team', lastSeq: 3, members: [{ ...me, role: 'owner' }, bob] };

      expect(toChatFromDto(dto, 'u1')).toEqual({
        id: 'g1', type: 'group', title: 'Team', lastSeq: 3, lastMessage: null, unreadCount: 0,
        members: [{ userId: 'u1', role: 'owner' }, { userId: 'u2', role: 'member' }],
      });
    });

    it('direct: peerId — второй участник, в чате с собой — я сам', () => {
      const direct = { id: 'd1', type: 'direct', title: null, lastSeq: 0, members: [me, bob] };
      const self = { id: 'd2', type: 'direct', title: null, lastSeq: 0, members: [me] };

      expect(toChatFromDto(direct, 'u1').peerId).toBe('u2');
      expect(toChatFromDto(self, 'u1').peerId).toBe('u1');
    });
  });

  describe('события чатов', () => {
    const item = { id: 'g1', type: 'group', title: 'Team', lastSeq: 0, lastMessage: null, unreadCount: 0 };

    it('chatReceived добавляет чат; повтор с тем же id ничего не меняет', () => {
      let state = reducer(undefined, chatReceived(item));
      expect(state.ids).toEqual(['g1']);

      state = reducer(state, messageAdded({ chatId: 'g1', seq: 1, senderId: 'u2', clientId: 'k', body: 'hi', createdAt: 't' }, { unread: true }));
      const again = reducer(state, chatReceived({ ...item, title: 'Другое' }));

      expect(again).toEqual(state);
    });

    it('chatUpdated с title меняет название, с members — состав {userId, role}', () => {
      let state = reducer(undefined, chatReceived(item));

      state = reducer(state, chatUpdated({ chatId: 'g1', title: 'Новое' }));
      expect(state.entities.g1.title).toBe('Новое');

      state = reducer(state, chatUpdated({ chatId: 'g1', members: [{ userId: 'u1', name: 'Me', avatarUrl: '', role: 'owner' }] }));
      expect(state.entities.g1.members).toEqual([{ userId: 'u1', role: 'owner' }]);
      expect(state.entities.g1.title).toBe('Новое');
    });

    it('chatUpdated неизвестного чата игнорируется', () => {
      const before = reducer(undefined, { type: '@@init' });

      expect(reducer(before, chatUpdated({ chatId: 'nope', title: 'X' }))).toEqual(before);
    });

    it('chatRemoved убирает чат', () => {
      let state = reducer(undefined, chatReceived(item));

      state = reducer(state, chatRemoved('g1'));

      expect(state.ids).toEqual([]);
    });
  });

  describe('селекторы', () => {
    const chat = { id: 'c1', type: 'group', title: 'One', lastSeq: 0, lastMessage: null, unreadCount: 0 };
    const state = wrap({ ids: ['c1'], entities: { c1: chat } });

    it('selectChats возвращает массив, ссылка стабильна при том же state', () => {
      expect(selectChats(state)).toEqual([chat]);
      expect(selectChats(state)).toBe(selectChats(state));
    });

    it('selectChatById возвращает чат или undefined', () => {
      expect(selectChatById(state, 'c1')).toBe(chat);
      expect(selectChatById(state, 'nope')).toBeUndefined();
      expect(selectChatById(state, null)).toBeUndefined();
    });
  });

  describe('fetchChats', () => {
    const message = { chatId: 'd1', seq: 12, senderId: 'u1', clientId: 'k1', body: 'hi', createdAt: '2026-10-15T10:00:00.000Z' };
    const peer = { id: 'u2', name: 'Bob', avatarUrl: '' };
    const direct = { id: 'd1', type: 'direct', title: null, lastSeq: 12, lastMessage: message, unreadCount: 3, peer };
    const group = { id: 'g1', type: 'group', title: 'Team', lastSeq: 0, lastMessage: null, unreadCount: 0 };

    const makeStore = () => configureStore({ reducer: { chats: reducer, users } });

    afterEach(() => {
      jest.resetAllMocks();
    });

    it('статус: idle → loading → succeeded', async () => {
      chatsApi.fetchChats.mockResolvedValue([]);
      const store = makeStore();
      expect(selectChatsStatus(store.getState())).toBe('idle');

      const promise = store.dispatch(fetchChats());
      expect(selectChatsStatus(store.getState())).toBe('loading');
      await promise;

      expect(selectChatsStatus(store.getState())).toBe('succeeded');
    });

    it('передаёт signal в сервис', async () => {
      chatsApi.fetchChats.mockResolvedValue([]);

      await makeStore().dispatch(fetchChats());

      expect(chatsApi.fetchChats).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
    });

    it('сохраняет чаты в порядке сервера, без вложенного peer, у direct — peerId', async () => {
      chatsApi.fetchChats.mockResolvedValue([group, direct]);
      const store = makeStore();

      await store.dispatch(fetchChats());

      expect(selectChats(store.getState())).toEqual([
        group,
        { id: 'd1', type: 'direct', title: null, lastSeq: 12, lastMessage: message, unreadCount: 3, peerId: 'u2' },
      ]);
    });

    it('peer кладётся в users', async () => {
      chatsApi.fetchChats.mockResolvedValue([group, direct]);
      const store = makeStore();

      await store.dispatch(fetchChats());

      expect(store.getState().users.entities).toEqual({ u2: peer });
    });

    it('ответ заменяет список целиком, включая локальные Join-чаты', async () => {
      const store = makeStore();
      store.dispatch(localChat('local-1', 'Local'));
      chatsApi.fetchChats.mockResolvedValue([group]);

      await store.dispatch(fetchChats());

      expect(selectChats(store.getState()).map((chat) => chat.id)).toEqual(['g1']);
    });

    it('повторная загрузка обновляет список', async () => {
      chatsApi.fetchChats.mockResolvedValueOnce([group]).mockResolvedValueOnce([direct]);
      const store = makeStore();

      await store.dispatch(fetchChats());
      await store.dispatch(fetchChats());

      expect(selectChats(store.getState()).map((chat) => chat.id)).toEqual(['d1']);
    });

    it('ошибка → failed, список не меняется; повтор → succeeded', async () => {
      chatsApi.fetchChats.mockResolvedValueOnce([group]).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce([]);
      const store = makeStore();
      await store.dispatch(fetchChats());

      await store.dispatch(fetchChats());
      expect(selectChatsStatus(store.getState())).toBe('failed');
      expect(selectChats(store.getState())).toHaveLength(1);

      await store.dispatch(fetchChats());
      expect(selectChatsStatus(store.getState())).toBe('succeeded');
      expect(selectChats(store.getState())).toEqual([]);
    });

    it('отмена запроса не переводит в failed', async () => {
      chatsApi.fetchChats.mockImplementation(() => new Promise(() => {}));
      const store = makeStore();

      const promise = store.dispatch(fetchChats());
      promise.abort();
      await promise;

      expect(selectChatsStatus(store.getState())).toBe('loading');
    });
  });

  describe('createDirectChat', () => {
    const me = { id: 'u1', login: 'ann', firstName: 'Ann', lastName: '', name: 'Ann', avatarUrl: '' };
    const dto = {
      id: 'd1', type: 'direct', title: null, lastSeq: 0,
      members: [
        { userId: 'u1', name: 'Ann', avatarUrl: '', role: 'member' },
        { userId: 'u2', name: 'Bob', avatarUrl: 'http://a/b.png', role: 'member' },
      ],
    };
    const makeStore = () => {
      const store = configureStore({ reducer: { chats: reducer, users, activeChatId, auth } });
      store.dispatch(checkSession.fulfilled(me, 'req'));
      return store;
    };

    it('шлёт POST direct с userId и signal', async () => {
      chatsApi.postDirectChat.mockResolvedValue(dto);

      await makeStore().dispatch(createDirectChat('u2'));

      expect(chatsApi.postDirectChat).toHaveBeenCalledWith('u2', { signal: expect.any(AbortSignal) });
    });

    it('201: чат добавляется (peerId — собеседник, без lastMessage), участники — в users, чат становится активным', async () => {
      chatsApi.postDirectChat.mockResolvedValue(dto);
      const store = makeStore();

      await store.dispatch(createDirectChat('u2'));

      const state = store.getState();
      expect(selectChats(state)).toEqual([
        {
          id: 'd1', type: 'direct', title: null, lastSeq: 0, lastMessage: null, unreadCount: 0, peerId: 'u2',
          members: [{ userId: 'u1', role: 'member' }, { userId: 'u2', role: 'member' }],
        },
      ]);
      expect(state.users.entities.u2).toEqual({ id: 'u2', name: 'Bob', avatarUrl: 'http://a/b.png' });
      expect(state.activeChatId).toBe('d1');
    });

    it('200 (чат уже есть): дубля нет, lastMessage и unreadCount существующего чата сохраняются, чат становится активным', async () => {
      const lastMessage = { chatId: 'd1', seq: 4, senderId: 'u2', clientId: 'k', body: 'hi', createdAt: 't' };
      chatsApi.fetchChats.mockResolvedValue([
        { id: 'g1', type: 'group', title: 'Team', lastSeq: 0, lastMessage: null, unreadCount: 0 },
        { id: 'd1', type: 'direct', title: null, lastSeq: 4, lastMessage, unreadCount: 2, peer: { id: 'u2', name: 'Bob', avatarUrl: '' } },
      ]);
      chatsApi.postDirectChat.mockResolvedValue({ ...dto, lastSeq: 4 });
      const store = makeStore();
      await store.dispatch(fetchChats());

      await store.dispatch(createDirectChat('u2'));

      const state = store.getState();
      expect(selectChats(state).map((chat) => chat.id)).toEqual(['g1', 'd1']);
      expect(selectChatById(state, 'd1')).toMatchObject({ lastMessage, unreadCount: 2, lastSeq: 4, peerId: 'u2' });
      expect(state.activeChatId).toBe('d1');
    });

    it('pendingUserId выставлен на время запроса и сбрасывается после ответа', async () => {
      let resolve;
      chatsApi.postDirectChat.mockReturnValue(new Promise((res) => { resolve = res; }));
      const store = makeStore();

      const promise = store.dispatch(createDirectChat('u2'));
      expect(selectPendingUserId(store.getState())).toBe('u2');

      resolve(dto);
      await promise;
      expect(selectPendingUserId(store.getState())).toBeNull();
    });

    it('404 (пользователь недоступен): rejected с кодом not_found, чат не добавлен и не активен, pendingUserId сброшен', async () => {
      chatsApi.postDirectChat.mockRejectedValue(new ApiError(404, { error: { code: 'not_found' } }));
      const store = makeStore();

      const result = await store.dispatch(createDirectChat('u2'));

      expect(result.payload).toBe('not_found');
      expect(selectChats(store.getState())).toEqual([]);
      expect(store.getState().activeChatId).toBeNull();
      expect(selectPendingUserId(store.getState())).toBeNull();
    });

    it('другая ошибка: rejected с кодом failed', async () => {
      chatsApi.postDirectChat.mockRejectedValue(new Error('network'));
      const store = makeStore();

      const result = await store.dispatch(createDirectChat('u2'));

      expect(result.payload).toBe('failed');
      expect(selectPendingUserId(store.getState())).toBeNull();
    });
  });

  describe('createDirectChat во время загрузки списка', () => {
    const me = { id: 'u1', login: 'ann', firstName: 'Ann', lastName: '', name: 'Ann', avatarUrl: '' };
    const dto = {
      id: 'd1', type: 'direct', title: null, lastSeq: 0,
      members: [
        { userId: 'u1', name: 'Ann', avatarUrl: '', role: 'member' },
        { userId: 'u2', name: 'Bob', avatarUrl: '', role: 'member' },
      ],
    };

    it('чат, открытый, пока список грузился, не затирается ответом fetchChats и остаётся активным', async () => {
      const group = { id: 'g1', type: 'group', title: 'Team', lastSeq: 0, lastMessage: null, unreadCount: 0 };
      let resolveList;
      chatsApi.fetchChats.mockReturnValue(new Promise((res) => { resolveList = res; }));
      chatsApi.postDirectChat.mockResolvedValue(dto);
      const store = configureStore({ reducer: { chats: reducer, users, activeChatId, auth } });
      store.dispatch(checkSession.fulfilled(me, 'req'));

      const list = store.dispatch(fetchChats());
      await store.dispatch(createDirectChat('u2'));
      resolveList([group]);
      await list;

      const state = store.getState();
      expect(selectChats(state).map((chat) => chat.id)).toEqual(['g1', 'd1']);
      expect(state.activeChatId).toBe('d1');
      expect(selectChatsStatus(state)).toBe('succeeded');
    });

    it('новый fetchChats очищает openedWhileLoadingIds: ответ сервера с этим чатом не даёт дубля', async () => {
      const group = { id: 'g1', type: 'group', title: 'Team', lastSeq: 0, lastMessage: null, unreadCount: 0 };
      const serverDirect = { id: 'd1', type: 'direct', title: null, lastSeq: 0, lastMessage: null, unreadCount: 0, members: dto.members };
      let resolveFirst;
      let resolveSecond;
      chatsApi.fetchChats
        .mockReturnValueOnce(new Promise((res) => { resolveFirst = res; }))
        .mockReturnValueOnce(new Promise((res) => { resolveSecond = res; }));
      chatsApi.postDirectChat.mockResolvedValue(dto);
      const store = configureStore({ reducer: { chats: reducer, users, activeChatId, auth } });
      store.dispatch(checkSession.fulfilled(me, 'req'));

      const first = store.dispatch(fetchChats());
      await store.dispatch(createDirectChat('u2'));
      first.abort();
      const second = store.dispatch(fetchChats());
      resolveFirst([group]);
      resolveSecond([group, serverDirect]);
      await Promise.allSettled([first, second]);

      const ids = selectChats(store.getState()).map((chat) => chat.id);
      expect(ids.filter((id) => id === 'd1')).toHaveLength(1);
      expect(ids).toEqual(expect.arrayContaining(['g1', 'd1']));
      expect(store.getState().chats.openedWhileLoadingIds).toEqual([]);
    });

    it('два createDirectChat подряд: устаревший ответ A игнорируется, pendingUserId B живёт до своего ответа', async () => {
      let resolveA;
      let resolveB;
      chatsApi.postDirectChat
        .mockReturnValueOnce(new Promise((res) => { resolveA = res; }))
        .mockReturnValueOnce(new Promise((res) => { resolveB = res; }));
      const store = configureStore({ reducer: { chats: reducer, users, activeChatId, auth } });
      store.dispatch(checkSession.fulfilled(me, 'req'));

      const a = store.dispatch(createDirectChat('u2'));
      const b = store.dispatch(createDirectChat('u3'));
      resolveA(dto);
      const resultA = await a;
      expect(resultA.payload).toBe('stale');
      expect(store.getState().chats.pendingUserId).toBe('u3');

      resolveB({ ...dto, id: 'd2', members: [dto.members[0], { userId: 'u3', name: 'Cat', avatarUrl: '', role: 'member' }] });
      await b;
      expect(store.getState().chats.pendingUserId).toBeNull();
    });
  });

  describe('fetchChats: ответы устаревших запросов', () => {
    const group = { id: 'g1', type: 'group', title: 'Team', lastSeq: 0, lastMessage: null, unreadCount: 0 };

    it('pending запоминает requestId, завершение его сбрасывает', () => {
      let state = reducer(undefined, fetchChats.pending('r1'));
      expect(state).toMatchObject({ status: 'loading', requestId: 'r1' });

      state = reducer(state, fetchChats.fulfilled([group], 'r1'));
      expect(state).toMatchObject({ status: 'succeeded', requestId: null });
    });

    it('rejected чужого запроса игнорируется', () => {
      const idle = reducer(undefined, { type: '@@init' });

      expect(reducer(idle, fetchChats.rejected(new Error('x'), 'old'))).toEqual(idle);
      const loading = reducer(idle, fetchChats.pending('r2'));
      expect(reducer(loading, fetchChats.rejected(new Error('x'), 'old'))).toEqual(loading);
    });

    it('fulfilled чужого запроса игнорируется', () => {
      const loading = reducer(undefined, fetchChats.pending('r2'));

      expect(reducer(loading, fetchChats.fulfilled([group], 'old'))).toEqual(loading);
    });
  });

  describe('selectChatName', () => {
    const state = {
      chats: {
        ids: ['d1', 'g1', 'd2'],
        entities: {
          d1: { id: 'd1', type: 'direct', title: null, peerId: 'u2' },
          g1: { id: 'g1', type: 'group', title: 'Team' },
          d2: { id: 'd2', type: 'direct', title: null, peerId: 'unknown' },
        },
        status: 'succeeded',
      },
      users: { ids: ['u2'], entities: { u2: { id: 'u2', name: 'Bob', avatarUrl: '' } } },
    };

    it('у группы — title', () => {
      expect(selectChatName(state, 'g1')).toBe('Team');
    });

    it('у direct — имя собеседника из users', () => {
      expect(selectChatName(state, 'd1')).toBe('Bob');
    });

    it('нет собеседника или чата — пустая строка', () => {
      expect(selectChatName(state, 'd2')).toBe('');
      expect(selectChatName(state, 'nope')).toBe('');
    });
  });

  describe('selectChatMembersCount', () => {
    const state = {
      chats: {
        ids: ['g1', 'g2', 'd1', 'g3'],
        entities: {
          g1: { id: 'g1', type: 'group', members: [{ userId: 'u1', role: 'owner' }, { userId: 'u2', role: 'member' }] },
          g2: { id: 'g2', type: 'group' },
          d1: { id: 'd1', type: 'direct', peerId: 'u2', members: [{ userId: 'u2', role: 'member' }] },
          g3: { id: 'g3', type: 'group', members: [] },
        },
        status: 'succeeded',
      },
    };

    it('у группы с известным составом — число участников', () => {
      expect(selectChatMembersCount(state, 'g1')).toBe(2);
      expect(selectChatMembersCount(state, 'g3')).toBe(0);
    });

    it('состав неизвестен — null', () => {
      expect(selectChatMembersCount(state, 'g2')).toBeNull();
    });

    it('у direct и неизвестного чата — null', () => {
      expect(selectChatMembersCount(state, 'd1')).toBeNull();
      expect(selectChatMembersCount(state, 'nope')).toBeNull();
    });
  });

  describe('история чата: loadChatHistory', () => {
    const makeStore = () => configureStore({ reducer: { chats: reducer, users, messages } });
    const group = { id: 'g1', type: 'group', title: 'Team', lastSeq: 0, lastMessage: null, unreadCount: 0 };
    const chatDto = (over = {}) => ({
      id: 'g1',
      type: 'group',
      title: 'Team 2',
      lastSeq: 3,
      members: [
        { userId: 'u1', name: 'Ann', avatarUrl: '', role: 'owner' },
        { userId: 'u2', name: 'Bob', avatarUrl: 'http://a/b.png', role: 'member' },
      ],
      ...over,
    });
    const msg = (seq) => ({ chatId: 'g1', seq, senderId: 'u2', clientId: `k${seq}`, body: `m${seq}`, createdAt: '2026-10-15T10:00:00.000Z' });
    const seqs = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => msg(from + i));

    const storeWithChat = async () => {
      chatsApi.fetchChats.mockResolvedValue([group]);
      const store = makeStore();
      await store.dispatch(fetchChats());
      return store;
    };

    afterEach(() => {
      jest.resetAllMocks();
    });

    it('запрашивает чат и последние PAGE_SIZE (50) сообщений с signal', async () => {
      const store = await storeWithChat();
      chatsApi.fetchChat.mockResolvedValue(chatDto());
      chatsApi.fetchMessages.mockResolvedValue(withHasMore([]));

      await store.dispatch(loadChatHistory('g1'));

      expect(PAGE_SIZE).toBe(50);
      expect(chatsApi.fetchChat).toHaveBeenCalledWith('g1', { signal: expect.any(AbortSignal) });
      expect(chatsApi.fetchMessages).toHaveBeenCalledWith('g1', { limit: 50, signal: expect.any(AbortSignal) });
    });

    it('статус: нет → loading → succeeded; title, lastSeq и участники (userId, role) попадают в чат', async () => {
      const store = await storeWithChat();
      chatsApi.fetchChat.mockResolvedValue(chatDto());
      chatsApi.fetchMessages.mockResolvedValue(withHasMore(seqs(1, 3)));
      expect(selectChatHistory(store.getState(), 'g1')).toBeUndefined();

      const promise = store.dispatch(loadChatHistory('g1'));
      expect(selectChatHistory(store.getState(), 'g1').status).toBe('loading');
      await promise;

      expect(selectChatHistory(store.getState(), 'g1')).toMatchObject({ status: 'succeeded', hasMore: false });
      expect(selectChatById(store.getState(), 'g1')).toMatchObject({
        title: 'Team 2',
        lastSeq: 3,
        members: [{ userId: 'u1', role: 'owner' }, { userId: 'u2', role: 'member' }],
      });
    });

    it('участники кладутся в users как { id, name, avatarUrl }, сообщения — в messages', async () => {
      const store = await storeWithChat();
      chatsApi.fetchChat.mockResolvedValue(chatDto());
      chatsApi.fetchMessages.mockResolvedValue(withHasMore(seqs(1, 3)));

      await store.dispatch(loadChatHistory('g1'));

      expect(store.getState().users.entities).toEqual({
        u1: { id: 'u1', name: 'Ann', avatarUrl: '' },
        u2: { id: 'u2', name: 'Bob', avatarUrl: 'http://a/b.png' },
      });
      expect(store.getState().messages.g1.ids).toEqual([1, 2, 3]);
    });

    it('lastSeq не уменьшается, если в списке он уже больше', async () => {
      chatsApi.fetchChats.mockResolvedValue([{ ...group, lastSeq: 9 }]);
      const store = makeStore();
      await store.dispatch(fetchChats());
      chatsApi.fetchChat.mockResolvedValue(chatDto({ lastSeq: 3 }));
      chatsApi.fetchMessages.mockResolvedValue(withHasMore([]));

      await store.dispatch(loadChatHistory('g1'));

      expect(selectChatById(store.getState(), 'g1').lastSeq).toBe(9);
    });

    it('hasMore первой страницы берётся из ответа сервера, а не из длины страницы', async () => {
      const store = await storeWithChat();
      chatsApi.fetchChat.mockResolvedValue(chatDto());
      chatsApi.fetchMessages.mockResolvedValue(withHasMore(seqs(1, 3), true));

      await store.dispatch(loadChatHistory('g1'));

      expect(selectChatHistory(store.getState(), 'g1').hasMore).toBe(true);
    });

    it('полная страница с hasMore: false — истории больше нет', async () => {
      const store = await storeWithChat();
      chatsApi.fetchChat.mockResolvedValue(chatDto());
      chatsApi.fetchMessages.mockResolvedValue(withHasMore(seqs(1, 50), false));

      await store.dispatch(loadChatHistory('g1'));

      expect(selectChatHistory(store.getState(), 'g1').hasMore).toBe(false);
    });

    it('ошибка чата или сообщений → failed, ничего не записано; повторный вызов грузит снова', async () => {
      const store = await storeWithChat();
      chatsApi.fetchChat.mockResolvedValueOnce(chatDto()).mockResolvedValueOnce(chatDto());
      chatsApi.fetchMessages.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(withHasMore(seqs(1, 2)));

      await store.dispatch(loadChatHistory('g1'));
      expect(selectChatHistory(store.getState(), 'g1').status).toBe('failed');
      expect(store.getState().messages).toEqual({});
      expect(store.getState().users.entities).toEqual({});

      await store.dispatch(loadChatHistory('g1'));
      expect(selectChatHistory(store.getState(), 'g1').status).toBe('succeeded');
      expect(store.getState().messages.g1.ids).toEqual([1, 2]);
    });

    it('загруженный чат и идущая загрузка не запрашиваются повторно', async () => {
      const store = await storeWithChat();
      chatsApi.fetchChat.mockResolvedValue(chatDto());
      chatsApi.fetchMessages.mockResolvedValue(withHasMore([]));

      const first = store.dispatch(loadChatHistory('g1'));
      await store.dispatch(loadChatHistory('g1'));
      await first;
      await store.dispatch(loadChatHistory('g1'));

      expect(chatsApi.fetchChat).toHaveBeenCalledTimes(1);
      expect(chatsApi.fetchMessages).toHaveBeenCalledTimes(1);
    });

    it('локальный чат (Join) и неизвестный чат не запрашиваются', async () => {
      const store = makeStore();
      store.dispatch(localChat('local-1', 'Local'));

      await store.dispatch(loadChatHistory('local-1'));
      await store.dispatch(loadChatHistory('nope'));

      expect(chatsApi.fetchChat).not.toHaveBeenCalled();
      expect(chatsApi.fetchMessages).not.toHaveBeenCalled();
      expect(selectChatHistory(store.getState(), 'local-1')).toBeUndefined();
    });

    it('requestId: чужой fulfilled/rejected игнорируется', () => {
      const loaded = reducer(reducer(undefined, fetchChats.pending('r0')), fetchChats.fulfilled([group], 'r0'));
      const base = reducer(loaded, loadChatHistory.pending('r1', 'g1'));
      const payload = { chat: chatDto(), messages: [], hasMore: false };

      expect(reducer(base, loadChatHistory.fulfilled(payload, 'old', 'g1'))).toEqual(base);
      expect(reducer(base, loadChatHistory.rejected(new Error('x'), 'old', 'g1'))).toEqual(base);
      expect(reducer(base, loadChatHistory.rejected(new Error('x'), 'r1', 'g1')).entities.g1.history.status).toBe('failed');
    });
  });

  describe('подкачка старых: loadOlderMessages', () => {
    const makeStore = () => configureStore({ reducer: { chats: reducer, users, messages } });
    const group = { id: 'g1', type: 'group', title: 'Team', lastSeq: 120, lastMessage: null, unreadCount: 0 };
    const msg = (seq) => ({ chatId: 'g1', seq, senderId: 'u2', clientId: `k${seq}`, body: `m${seq}`, createdAt: '2026-10-15T10:00:00.000Z' });
    const seqs = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => msg(from + i));
    const chatDto = { id: 'g1', type: 'group', title: 'Team', lastSeq: 120, members: [] };

    const openedStore = async (firstPage = seqs(71, 120), hasMore = firstPage.length >= PAGE_SIZE) => {
      chatsApi.fetchChats.mockResolvedValue([group]);
      chatsApi.fetchChat.mockResolvedValue(chatDto);
      chatsApi.fetchMessages.mockResolvedValueOnce(withHasMore(firstPage, hasMore));
      const store = makeStore();
      await store.dispatch(fetchChats());
      await store.dispatch(loadChatHistory('g1'));
      return store;
    };

    afterEach(() => {
      jest.resetAllMocks();
    });

    it('запрашивает before = минимальный seq и limit 50, добавляет сообщения к уже загруженным', async () => {
      const store = await openedStore();
      chatsApi.fetchMessages.mockResolvedValueOnce(withHasMore(seqs(21, 70), true));

      await store.dispatch(loadOlderMessages('g1'));

      expect(chatsApi.fetchMessages).toHaveBeenLastCalledWith('g1', { before: 71, limit: 50, signal: expect.any(AbortSignal) });
      expect(store.getState().messages.g1.ids).toHaveLength(100);
      expect(store.getState().messages.g1.ids[0]).toBe(21);
      expect(selectChatHistory(store.getState(), 'g1').hasMore).toBe(true);
    });

    it('hasMore: false в ответе подкачки — история кончилась, дальше запросов нет', async () => {
      const store = await openedStore();
      chatsApi.fetchMessages.mockResolvedValueOnce(withHasMore(seqs(51, 70)));

      await store.dispatch(loadOlderMessages('g1'));
      expect(selectChatHistory(store.getState(), 'g1').hasMore).toBe(false);
      await store.dispatch(loadOlderMessages('g1'));

      expect(chatsApi.fetchMessages).toHaveBeenCalledTimes(2);
    });

    it('если первая страница короче 50, подкачка не запускается', async () => {
      const store = await openedStore(seqs(1, 10));

      await store.dispatch(loadOlderMessages('g1'));

      expect(chatsApi.fetchMessages).toHaveBeenCalledTimes(1);
    });

    it('пока идёт подкачка, повторный вызов запроса не делает', async () => {
      const store = await openedStore();
      chatsApi.fetchMessages.mockResolvedValueOnce(withHasMore(seqs(21, 70), true));

      const first = store.dispatch(loadOlderMessages('g1'));
      await store.dispatch(loadOlderMessages('g1'));
      await first;

      expect(chatsApi.fetchMessages).toHaveBeenCalledTimes(2);
    });

    it('сбой подкачки не ломает загруженную историю; повторный вызов пробует снова', async () => {
      const store = await openedStore();
      chatsApi.fetchMessages.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(withHasMore(seqs(21, 70), true));

      await store.dispatch(loadOlderMessages('g1'));
      expect(selectChatHistory(store.getState(), 'g1')).toMatchObject({ status: 'succeeded', olderStatus: 'failed', hasMore: true });
      expect(store.getState().messages.g1.ids).toHaveLength(50);

      await store.dispatch(loadOlderMessages('g1'));
      expect(store.getState().messages.g1.ids).toHaveLength(100);
    });

    it('чат без загруженной истории не подкачивается', async () => {
      chatsApi.fetchChats.mockResolvedValue([group]);
      const store = makeStore();
      await store.dispatch(fetchChats());

      await store.dispatch(loadOlderMessages('g1'));

      expect(chatsApi.fetchMessages).not.toHaveBeenCalled();
    });
  });
});

describe('chatsReconciled (сверка списка после переподключения)', () => {
  const m = (seq) => ({ chatId: 'a', seq, senderId: 'u2', clientId: `k${seq}`, body: `m${seq}`, createdAt: '2026-10-17T10:00:00.000Z' });
  const item = (id, extra = {}) => ({ id, type: 'group', title: id, lastSeq: 0, lastMessage: null, unreadCount: 0, members: [{ userId: 'me', role: 'owner' }], ...extra });
  const history = { status: 'succeeded', requestId: null, hasMore: true, olderStatus: 'idle', olderRequestId: null };
  const start = () => {
    let state = reducer(undefined, { type: '@@init' });
    state = reducer(state, chatReceived(item('a', { lastSeq: 2, lastMessage: m(2), unreadCount: 1, history })));
    return reducer(state, chatReceived(item('b')));
  };
  const reconcile = (state, chats, { syncedIds = [], openChatId = null } = {}) => reducer(state, chatsReconciled({ chats, syncedIds, openChatId }));

  it('сохраняет history и обновляет название, последнее сообщение, lastSeq и непрочитанные синхронизированного чата', () => {
    const next = reconcile(
      start(),
      [item('a', { title: 'Новое', lastSeq: 4, lastMessage: m(4), unreadCount: 3 }), item('b')],
      { syncedIds: ['a'] }
    );

    expect(selectChatById(wrap(next), 'a')).toMatchObject({ title: 'Новое', lastSeq: 4, lastMessage: m(4), unreadCount: 3, history });
  });

  it('lastSeq и lastMessage чата без подкачки не меняются, остальное обновляется', () => {
    const next = reconcile(start(), [item('a', { title: 'X', lastSeq: 4, lastMessage: m(4), unreadCount: 3 }), item('b')]);

    expect(selectChatById(wrap(next), 'a')).toMatchObject({ title: 'X', lastSeq: 2, lastMessage: m(2), unreadCount: 3 });
  });

  it('lastSeq и lastMessage не откатываются назад', () => {
    const next = reconcile(start(), [item('a', { lastSeq: 1, lastMessage: m(1) }), item('b')], { syncedIds: ['a'] });

    expect(selectChatById(wrap(next), 'a')).toMatchObject({ lastSeq: 2, lastMessage: m(2) });
  });

  it('unreadCount открытого чата не берётся с сервера', () => {
    const next = reconcile(start(), [item('a', { lastSeq: 2, lastMessage: m(2), unreadCount: 5 }), item('b')], { openChatId: 'a' });

    expect(selectChatById(wrap(next), 'a').unreadCount).toBe(1);
  });

  it('новый чат добавляется, порядок — как у сервера', () => {
    const next = reconcile(start(), [item('c'), item('b'), item('a', { lastSeq: 2 })]);

    expect(next.ids).toEqual(['c', 'b', 'a']);
    expect(selectChatById(wrap(next), 'c')).toMatchObject({ id: 'c' });
  });

  it('текущие чаты, которых нет в ответе (локальные, пришедшие событием), остаются после серверных', () => {
    let state = start();
    state = reducer(state, chatReceived(item('loc', { local: true })));

    const next = reconcile(state, [item('a', { lastSeq: 2 })]);

    expect(next.ids).toEqual(['a', 'b', 'loc']);
  });

  it('unreadExtra добавляется к непрочитанным с сервера', () => {
    const next = reducer(start(), chatsReconciled({ chats: [item('a', { lastSeq: 2, unreadCount: 3 })], syncedIds: [], openChatId: null, unreadExtra: { a: 2 } }));

    expect(selectChatById(wrap(next), 'a').unreadCount).toBe(5);
  });

  it('status и requestId не меняются', () => {
    const state = { ...start(), status: 'succeeded' };

    expect(reconcile(state, [item('a')])).toMatchObject({ status: 'succeeded', requestId: null });
  });
});

describe('markChatRead (прочтение чата)', () => {
  const group = { id: 'g1', type: 'group', title: 'Team', lastSeq: 5, lastMessage: null, unreadCount: 3 };
  const makeStore = async () => {
    chatsApi.fetchChats.mockResolvedValue([group]);
    const store = configureStore({ reducer: { chats: reducer, users, messages } });
    await store.dispatch(fetchChats());
    return store;
  };
  const unread = (store, id = 'g1') => selectChatById(store.getState(), id).unreadCount;

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('шлёт POST read с seq и signal; после успеха при seq >= lastSeq счётчик обнуляется', async () => {
    const store = await makeStore();
    chatsApi.postRead.mockResolvedValue(null);

    await store.dispatch(markChatRead({ chatId: 'g1', seq: 5 }));

    expect(chatsApi.postRead).toHaveBeenCalledWith('g1', { seq: 5, signal: expect.any(AbortSignal) });
    expect(unread(store)).toBe(0);
  });

  it('seq меньше lastSeq (сообщение пришло, пока шёл запрос) — счётчик не трогается', async () => {
    const store = await makeStore();
    let release;
    chatsApi.postRead.mockImplementation(() => new Promise((resolve) => { release = () => resolve(null); }));

    const pending = store.dispatch(markChatRead({ chatId: 'g1', seq: 5 }));
    store.dispatch(messageAdded({ chatId: 'g1', seq: 6, senderId: 'u2', clientId: 'k6', body: 'm6', createdAt: '2026-10-15T10:00:00.000Z' }));
    release();
    await pending;

    expect(unread(store)).toBe(3);
  });

  it('ошибка запроса отклоняет thunk и не меняет счётчик', async () => {
    const store = await makeStore();
    chatsApi.postRead.mockRejectedValue(new ApiError(500, null));

    const result = await store.dispatch(markChatRead({ chatId: 'g1', seq: 5 }));

    expect(markChatRead.rejected.match(result)).toBe(true);
    expect(unread(store)).toBe(3);
  });

  it('чат исчез, пока шёл запрос, — ничего не падает', async () => {
    const store = await makeStore();
    chatsApi.postRead.mockResolvedValue(null);

    const pending = store.dispatch(markChatRead({ chatId: 'g1', seq: 5 }));
    store.dispatch(chatRemoved('g1'));

    await expect(pending).resolves.toBeDefined();
    expect(selectChatById(store.getState(), 'g1')).toBeUndefined();
  });
});
