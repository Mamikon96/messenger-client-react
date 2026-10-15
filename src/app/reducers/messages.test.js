import { combineReducers, configureStore } from '@reduxjs/toolkit';
import reducer, { selectChatMessages, sendMessage } from './messages';
import chats, { chatCreated, selectChatById } from './chats';
import { messageAdded } from './messageEvents';

jest.mock('../services/clientId', () => ({ createClientId: jest.fn() }));
const { createClientId } = require('../services/clientId');

const dto = (chatId, seq, body = `m${seq}`) => ({
  chatId,
  seq,
  senderId: 'u1',
  clientId: `k${chatId}${seq}`,
  body,
  createdAt: '2026-10-15T10:00:00.000Z',
});

const wrap = (messages) => ({ messages });

describe('messages reducer', () => {
  beforeEach(() => {
    createClientId.mockReturnValue('client-1');
  });

  it('начальное состояние — пусто', () => {
    expect(reducer(undefined, { type: '@@init' })).toEqual({});
  });

  it('messageAdded кладёт сообщение в коллекцию своего чата с ключом seq', () => {
    const state = reducer(undefined, messageAdded(dto('c1', 1)));

    expect(state.c1.ids).toEqual([1]);
    expect(state.c1.entities[1]).toEqual(dto('c1', 1));
  });

  it('сообщения разных чатов не смешиваются', () => {
    let state = reducer(undefined, messageAdded(dto('c1', 1)));
    state = reducer(state, messageAdded(dto('c2', 1)));

    expect(Object.keys(state).sort()).toEqual(['c1', 'c2']);
    expect(state.c1.ids).toEqual([1]);
    expect(state.c2.ids).toEqual([1]);
  });

  it('повтор того же seq не дублирует сообщение', () => {
    let state = reducer(undefined, messageAdded(dto('c1', 1)));
    state = reducer(state, messageAdded(dto('c1', 1, 'другое')));

    expect(state.c1.ids).toEqual([1]);
    expect(state.c1.entities[1].body).toBe('m1');
  });

  describe('sendMessage (локальная отправка)', () => {
    const makeStore = () => configureStore({ reducer: combineReducers({ chats, messages: reducer }) });
    const withChat = () => {
      createClientId.mockReturnValueOnce('c1');
      const store = makeStore();
      store.dispatch(chatCreated({ title: 'Room' }));
      createClientId.mockReturnValue('client-1');
      return store;
    };

    it('назначает seq = lastSeq чата + 1, clientId и createdAt (ISO); чат обновляет lastSeq/lastMessage', async () => {
      const store = withChat();

      await store.dispatch(sendMessage({ chatId: 'c1', senderId: 'u1', body: 'a' }));
      await store.dispatch(sendMessage({ chatId: 'c1', senderId: 'u1', body: 'b' }));

      const messages = selectChatMessages(store.getState(), 'c1');
      expect(messages.map((m) => m.seq)).toEqual([1, 2]);
      expect(messages[1]).toEqual({
        chatId: 'c1',
        seq: 2,
        senderId: 'u1',
        clientId: 'client-1',
        body: 'b',
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      });
      expect(selectChatById(store.getState(), 'c1')).toMatchObject({ lastSeq: 2, lastMessage: messages[1] });
    });

    it('seq считается по каждому чату отдельно', async () => {
      const store = makeStore();
      createClientId.mockReturnValueOnce('c1').mockReturnValueOnce('c2');
      store.dispatch(chatCreated({ title: 'One' }));
      store.dispatch(chatCreated({ title: 'Two' }));
      createClientId.mockReturnValue('client-1');

      await store.dispatch(sendMessage({ chatId: 'c1', senderId: 'u1', body: 'a' }));
      await store.dispatch(sendMessage({ chatId: 'c1', senderId: 'u1', body: 'b' }));
      await store.dispatch(sendMessage({ chatId: 'c2', senderId: 'u1', body: 'c' }));

      expect(selectChatMessages(store.getState(), 'c1').map((m) => m.seq)).toEqual([1, 2]);
      expect(selectChatMessages(store.getState(), 'c2').map((m) => m.seq)).toEqual([1]);
    });

    it('чата нет — ничего не происходит', async () => {
      const store = withChat();
      const before = store.getState();

      await store.dispatch(sendMessage({ chatId: 'nope', senderId: 'u1', body: 'x' }));

      expect(store.getState()).toBe(before);
    });
  });

  describe('selectChatMessages', () => {
    it('отдаёт сообщения чата по возрастанию seq, даже если пришли не по порядку', () => {
      let state = reducer(undefined, messageAdded(dto('c1', 3)));
      state = reducer(state, messageAdded(dto('c1', 1)));
      state = reducer(state, messageAdded(dto('c1', 2)));
      state = reducer(state, messageAdded(dto('c2', 1)));

      expect(selectChatMessages(wrap(state), 'c1').map((m) => m.seq)).toEqual([1, 2, 3]);
      expect(selectChatMessages(wrap(state), 'c2')).toHaveLength(1);
    });

    it('ссылка стабильна: один state и chatId — тот же массив, чужой чат не инвалидирует результат', () => {
      let state = reducer(undefined, messageAdded(dto('c1', 1)));
      const first = selectChatMessages(wrap(state), 'c1');

      expect(selectChatMessages(wrap(state), 'c1')).toBe(first);

      state = reducer(state, messageAdded(dto('c2', 1)));
      expect(selectChatMessages(wrap(state), 'c1')).toBe(first);

      state = reducer(state, messageAdded(dto('c1', 2)));
      expect(selectChatMessages(wrap(state), 'c1')).not.toBe(first);
    });

    it('для чата без сообщений и для null — один и тот же пустой массив', () => {
      const state = wrap({});

      expect(selectChatMessages(state, 'c1')).toEqual([]);
      expect(selectChatMessages(state, 'c1')).toBe(selectChatMessages(state, null));
    });
  });
});
