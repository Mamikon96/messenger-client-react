import { configureStore } from '@reduxjs/toolkit';
import reducer, { chatCreated, fetchChats, selectChatById, selectChatName, selectChats, selectChatsStatus } from './chats';
import { messageAdded } from './messageEvents';
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
});
