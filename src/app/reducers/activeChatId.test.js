import reducer, { selectActiveChat, selectActiveChatId, chatSelected } from './activeChatId';

const chat = { id: 'c1', type: 'group', title: 'One', lastSeq: 0, lastMessage: null, unreadCount: 0 };
const chats = { ids: ['c1'], entities: { c1: chat } };

describe('activeChatId reducer', () => {
  it('начальное состояние — null', () => {
    expect(reducer(undefined, { type: '@@init' })).toBeNull();
  });

  it('chatSelected хранит только идентификатор', () => {
    expect(reducer(null, chatSelected('c1'))).toBe('c1');
    expect(reducer('c1', chatSelected('c2'))).toBe('c2');
  });

  it('селекторы: selectActiveChatId и selectActiveChat (чат берётся из chats по id)', () => {
    expect(selectActiveChatId({ activeChatId: 'c1', chats })).toBe('c1');
    expect(selectActiveChat({ activeChatId: 'c1', chats })).toBe(chat);
  });

  it('selectActiveChat без выбора или с неизвестным id — undefined', () => {
    expect(selectActiveChat({ activeChatId: null, chats })).toBeUndefined();
    expect(selectActiveChat({ activeChatId: 'gone', chats })).toBeUndefined();
  });
});
