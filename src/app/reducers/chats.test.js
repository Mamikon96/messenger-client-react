import { configureStore } from '@reduxjs/toolkit';
import reducer, { chatCreated, fetchChats, selectChatById, selectChatHistory, selectChatName, selectChats, selectChatsStatus } from './chats';
import { loadChatHistory, loadOlderMessages, PAGE_SIZE } from './chatHistory';
import { messageAdded } from './messageEvents';
import messages from './messages';
import users from './users';
import * as chatsApi from '../services/chatsApi';

jest.mock('../services/chatsApi');

jest.mock('../services/clientId', () => ({ createClientId: jest.fn() }));
const { createClientId } = require('../services/clientId');

const wrap = (chats) => ({ chats });

describe('chats reducer', () => {
  beforeEach(() => {
    createClientId.mockReset();
  });

  it('начальное состояние — пустая нормализованная коллекция', () => {
    expect(reducer(undefined, { type: '@@init' })).toEqual({ ids: [], entities: {}, status: 'idle', requestId: null });
  });

  it('chatCreated создаёт ChatListItemDto группы с клиентским UUID и без поля name', () => {
    createClientId.mockReturnValue('chat-1');

    const state = reducer(undefined, chatCreated({ title: 'General', name: 'Ann' }));

    expect(state.ids).toEqual(['chat-1']);
    expect(state.entities['chat-1']).toEqual({
      id: 'chat-1',
      type: 'group',
      title: 'General',
      lastSeq: 0,
      lastMessage: null,
      unreadCount: 0,
      local: true,
    });
  });

  it('чаты хранятся в порядке добавления, без сортировки', () => {
    createClientId.mockReturnValueOnce('b').mockReturnValueOnce('a');

    let state = reducer(undefined, chatCreated({ title: 'Z' }));
    state = reducer(state, chatCreated({ title: 'A' }));

    expect(selectChats(wrap(state)).map((chat) => chat.id)).toEqual(['b', 'a']);
  });

  describe('messageAdded обновляет lastSeq и lastMessage чата', () => {
    const message = { chatId: 'c1', seq: 1, senderId: 'u1', clientId: 'k1', body: 'hi', createdAt: '2026-10-15T10:00:00.000Z' };

    it('меняет только нужный чат', () => {
      createClientId.mockReturnValueOnce('c1').mockReturnValueOnce('c2');
      let state = reducer(undefined, chatCreated({ title: 'One' }));
      state = reducer(state, chatCreated({ title: 'Two' }));

      state = reducer(state, messageAdded(message));

      expect(state.entities.c1).toMatchObject({ lastSeq: 1, lastMessage: message });
      expect(state.entities.c2).toMatchObject({ lastSeq: 0, lastMessage: null });
    });

    it('сообщения не по порядку не откатывают lastSeq и lastMessage', () => {
      createClientId.mockReturnValueOnce('c1');
      let state = reducer(undefined, chatCreated({ title: 'One' }));

      state = reducer(state, messageAdded({ ...message, seq: 3 }));
      state = reducer(state, messageAdded({ ...message, seq: 1 }));

      expect(state.entities.c1.lastSeq).toBe(3);
      expect(state.entities.c1.lastMessage.seq).toBe(3);
    });

    it('дубль seq не меняет lastMessage', () => {
      createClientId.mockReturnValueOnce('c1');
      let state = reducer(undefined, chatCreated({ title: 'One' }));
      state = reducer(state, messageAdded(message));

      state = reducer(state, messageAdded({ ...message, body: 'дубль' }));

      expect(state.entities.c1.lastMessage.body).toBe('hi');
    });

    it('сообщение неизвестного чата игнорируется', () => {
      const before = reducer(undefined, { type: '@@init' });

      expect(reducer(before, messageAdded(message))).toEqual(before);
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
      createClientId.mockReturnValue('local-1');
      const store = makeStore();
      store.dispatch(chatCreated({ title: 'Local' }));
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
      chatsApi.fetchMessages.mockResolvedValue([]);

      await store.dispatch(loadChatHistory('g1'));

      expect(PAGE_SIZE).toBe(50);
      expect(chatsApi.fetchChat).toHaveBeenCalledWith('g1', { signal: expect.any(AbortSignal) });
      expect(chatsApi.fetchMessages).toHaveBeenCalledWith('g1', { limit: 50, signal: expect.any(AbortSignal) });
    });

    it('статус: нет → loading → succeeded; title, lastSeq и участники (userId, role) попадают в чат', async () => {
      const store = await storeWithChat();
      chatsApi.fetchChat.mockResolvedValue(chatDto());
      chatsApi.fetchMessages.mockResolvedValue(seqs(1, 3));
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
      chatsApi.fetchMessages.mockResolvedValue(seqs(1, 3));

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
      chatsApi.fetchMessages.mockResolvedValue([]);

      await store.dispatch(loadChatHistory('g1'));

      expect(selectChatById(store.getState(), 'g1').lastSeq).toBe(9);
    });

    it('пришло ровно 50 — есть ещё (hasMore), меньше 50 — истории больше нет', async () => {
      const store = await storeWithChat();
      chatsApi.fetchChat.mockResolvedValue(chatDto());
      chatsApi.fetchMessages.mockResolvedValue(seqs(1, 50));

      await store.dispatch(loadChatHistory('g1'));

      expect(selectChatHistory(store.getState(), 'g1').hasMore).toBe(true);
    });

    it('ошибка чата или сообщений → failed, ничего не записано; повторный вызов грузит снова', async () => {
      const store = await storeWithChat();
      chatsApi.fetchChat.mockResolvedValueOnce(chatDto()).mockResolvedValueOnce(chatDto());
      chatsApi.fetchMessages.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(seqs(1, 2));

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
      chatsApi.fetchMessages.mockResolvedValue([]);

      const first = store.dispatch(loadChatHistory('g1'));
      await store.dispatch(loadChatHistory('g1'));
      await first;
      await store.dispatch(loadChatHistory('g1'));

      expect(chatsApi.fetchChat).toHaveBeenCalledTimes(1);
      expect(chatsApi.fetchMessages).toHaveBeenCalledTimes(1);
    });

    it('локальный чат (Join) и неизвестный чат не запрашиваются', async () => {
      createClientId.mockReturnValue('local-1');
      const store = makeStore();
      store.dispatch(chatCreated({ title: 'Local' }));

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

    const openedStore = async (firstPage = seqs(71, 120)) => {
      chatsApi.fetchChats.mockResolvedValue([group]);
      chatsApi.fetchChat.mockResolvedValue(chatDto);
      chatsApi.fetchMessages.mockResolvedValueOnce(firstPage);
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
      chatsApi.fetchMessages.mockResolvedValueOnce(seqs(21, 70));

      await store.dispatch(loadOlderMessages('g1'));

      expect(chatsApi.fetchMessages).toHaveBeenLastCalledWith('g1', { before: 71, limit: 50, signal: expect.any(AbortSignal) });
      expect(store.getState().messages.g1.ids).toHaveLength(100);
      expect(store.getState().messages.g1.ids[0]).toBe(21);
      expect(selectChatHistory(store.getState(), 'g1').hasMore).toBe(true);
    });

    it('пришло меньше 50 — история кончилась, дальше запросов нет', async () => {
      const store = await openedStore();
      chatsApi.fetchMessages.mockResolvedValueOnce(seqs(51, 70));

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
      chatsApi.fetchMessages.mockResolvedValueOnce(seqs(21, 70));

      const first = store.dispatch(loadOlderMessages('g1'));
      await store.dispatch(loadOlderMessages('g1'));
      await first;

      expect(chatsApi.fetchMessages).toHaveBeenCalledTimes(2);
    });

    it('сбой подкачки не ломает загруженную историю; повторный вызов пробует снова', async () => {
      const store = await openedStore();
      chatsApi.fetchMessages.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(seqs(21, 70));

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
