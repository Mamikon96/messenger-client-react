import reducer, { chatCreated, selectChatById, selectChats } from './chats';
import { messageAdded } from './messageEvents';

jest.mock('../services/clientId', () => ({ createClientId: jest.fn() }));
const { createClientId } = require('../services/clientId');

const wrap = (chats) => ({ chats });

describe('chats reducer', () => {
  beforeEach(() => {
    createClientId.mockReset();
  });

  it('начальное состояние — пустая нормализованная коллекция', () => {
    expect(reducer(undefined, { type: '@@init' })).toEqual({ ids: [], entities: {} });
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
});
