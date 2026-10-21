import { combineReducers, configureStore } from '@reduxjs/toolkit';
import reducer, { retryMessage, selectChatMessages, sendMessage } from './messages';
import chats, { chatReceived, fetchChats, selectChatById } from './chats';
import outbox, { selectChatOutbox } from './outbox';
import { ApiError } from '../services/apiClient';
import { chatRemoved, messageAdded } from './messageEvents';
import { fetchOlderMessages, loadChatHistory } from './chatHistory';

jest.mock('../services/chatsApi');
jest.mock('../services/clientId', () => ({ createClientId: jest.fn() }));
const { createClientId } = require('../services/clientId');

// Чат с флагом local (не из ответа сервера): фикстура вместо удалённого события chatCreated.
const localChat = (id, title) =>
  chatReceived({ id, type: 'group', title, lastSeq: 0, lastMessage: null, unreadCount: 0, local: true });
const chatsApi = require('../services/chatsApi');

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

  it('chatRemoved удаляет сообщения чата, остальные не трогает', () => {
    let state = reducer(undefined, messageAdded(dto('c1', 1)));
    state = reducer(state, messageAdded(dto('c2', 1)));

    state = reducer(state, chatRemoved('c1'));

    expect(Object.keys(state)).toEqual(['c2']);
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
      const store = makeStore();
      store.dispatch(localChat('c1', 'Room'));
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
      store.dispatch(localChat('c1', 'One'));
      store.dispatch(localChat('c2', 'Two'));

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

  it('loadChatHistory.fulfilled кладёт сообщения чата по seq, повтор не дублирует', () => {
    const payload = { chat: { id: 'c1', members: [] }, messages: [dto('c1', 2), dto('c1', 1)], hasMore: false };

    let state = reducer(undefined, loadChatHistory.fulfilled(payload, 'r1', 'c1'));
    state = reducer(state, loadChatHistory.fulfilled(payload, 'r2', 'c1'));

    expect(state.c1.ids).toEqual([1, 2]);
  });

  it('fetchOlderMessages.fulfilled добавляет старые сообщения перед имеющимися; повтор seq заменяет запись версией сервера', () => {
    let state = reducer(undefined, messageAdded(dto('c1', 5, 'live')));

    state = reducer(state, fetchOlderMessages.fulfilled({ messages: [dto('c1', 3), dto('c1', 5, 'старое')] }, 'r', { chatId: 'c1', before: 5 }));

    expect(state.c1.ids).toEqual([3, 5]);
    expect(state.c1.entities[5].body).toBe('старое');
  });
});

describe('sendMessage в серверном чате (FE-40)', () => {
  // Jest 27 из react-scripts 5 не имеет advanceTimersByTimeAsync: сбрасываем микрозадачи до и после сдвига часов.
  const flush = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  const advance = async (ms) => {
    await flush();
    jest.advanceTimersByTime(ms);
    await flush();
  };
  const serverDto = (seq, clientId = 'k1', body = 'привет') => ({
    chatId: 's1',
    seq,
    senderId: 'u1',
    clientId,
    body,
    createdAt: '2026-10-17T10:00:00.000Z',
  });
  const makeServerStore = async () => {
    chatsApi.fetchChats.mockResolvedValue([{ id: 's1', type: 'group', title: 'Srv', lastSeq: 2, lastMessage: null, unreadCount: 0 }]);
    const store = configureStore({ reducer: combineReducers({ chats, messages: reducer, outbox }) });
    await store.dispatch(fetchChats());
    return store;
  };
  const send = (store, body = 'привет') => store.dispatch(sendMessage({ chatId: 's1', senderId: 'u1', body }));
  const outboxOf = (store) => selectChatOutbox(store.getState(), 's1');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0);
    createClientId.mockReturnValue('k1');
    chatsApi.postMessage.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('сообщение сразу попадает в очередь со статусом sending, POST уходит с clientId и без seq', async () => {
    const store = await makeServerStore();
    chatsApi.postMessage.mockReturnValue(new Promise(() => {}));

    send(store);

    expect(outboxOf(store)).toEqual([expect.objectContaining({ clientId: 'k1', body: 'привет', senderId: 'u1', status: 'sending' })]);
    expect(chatsApi.postMessage).toHaveBeenCalledWith('s1', expect.objectContaining({ clientId: 'k1', body: 'привет' }));
    expect(selectChatMessages(store.getState(), 's1')).toEqual([]);
  });

  it('201: сообщение становится серверным (seq из ответа), очередь пустеет, чат получает lastSeq', async () => {
    const store = await makeServerStore();
    chatsApi.postMessage.mockResolvedValue(serverDto(3));

    await send(store);

    expect(outboxOf(store)).toEqual([]);
    expect(selectChatMessages(store.getState(), 's1')).toEqual([serverDto(3)]);
    expect(selectChatById(store.getState(), 's1')).toMatchObject({ lastSeq: 3, lastMessage: serverDto(3) });
  });

  it('сообщение, пришедшее раньше ответа (тот же clientId), не дублируется', async () => {
    const store = await makeServerStore();
    chatsApi.postMessage.mockImplementation(async () => {
      store.dispatch(messageAdded(serverDto(3)));
      return serverDto(3);
    });

    await send(store);

    expect(selectChatMessages(store.getState(), 's1')).toHaveLength(1);
    expect(outboxOf(store)).toEqual([]);
  });

  it('сеть упала: 3 автоповтора с одним clientId и паузами 1, 2, 4 с, затем failed', async () => {
    const store = await makeServerStore();
    chatsApi.postMessage.mockRejectedValue(new TypeError('Failed to fetch'));

    const done = send(store);
    await advance(0);
    expect(chatsApi.postMessage).toHaveBeenCalledTimes(1);
    await advance(999);
    expect(chatsApi.postMessage).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(chatsApi.postMessage).toHaveBeenCalledTimes(2);
    await advance(2000);
    expect(chatsApi.postMessage).toHaveBeenCalledTimes(3);
    expect(outboxOf(store)[0].status).toBe('sending');
    await advance(4000);
    await done;

    expect(chatsApi.postMessage).toHaveBeenCalledTimes(4);
    chatsApi.postMessage.mock.calls.forEach(([, payload]) => expect(payload.clientId).toBe('k1'));
    expect(outboxOf(store)).toEqual([expect.objectContaining({ clientId: 'k1', status: 'failed' })]);
  });

  it('5xx повторяется, успех на повторе даёт серверное сообщение', async () => {
    const store = await makeServerStore();
    chatsApi.postMessage.mockRejectedValueOnce(new ApiError(503, null)).mockResolvedValueOnce(serverDto(3));

    const done = send(store);
    await advance(1000);
    await done;

    expect(chatsApi.postMessage).toHaveBeenCalledTimes(2);
    expect(selectChatMessages(store.getState(), 's1')).toHaveLength(1);
    expect(outboxOf(store)).toEqual([]);
  });

  it('429: пауза берётся из Retry-After', async () => {
    const store = await makeServerStore();
    chatsApi.postMessage
      .mockRejectedValueOnce(new ApiError(429, null, { retryAfter: 7 }))
      .mockResolvedValueOnce(serverDto(3));

    const done = send(store);
    await advance(6999);
    expect(chatsApi.postMessage).toHaveBeenCalledTimes(1);
    await advance(1);
    await done;

    expect(chatsApi.postMessage).toHaveBeenCalledTimes(2);
  });

  it('джиттер добавляет к паузе не более четверти', async () => {
    const store = await makeServerStore();
    Math.random.mockReturnValue(0.999);
    chatsApi.postMessage.mockRejectedValueOnce(new ApiError(500, null)).mockResolvedValueOnce(serverDto(3));

    const done = send(store);
    await advance(1250);
    expect(chatsApi.postMessage).toHaveBeenCalledTimes(2);
    await done;
  });

  it.each([400, 404])('%i: сразу failed без автоповтора', async (status) => {
    const store = await makeServerStore();
    chatsApi.postMessage.mockRejectedValue(new ApiError(status, null));

    await send(store);

    expect(chatsApi.postMessage).toHaveBeenCalledTimes(1);
    expect(outboxOf(store)[0].status).toBe('failed');
  });

  it('retryMessage: failed → sending → отправлено с тем же clientId, дубликата нет', async () => {
    const store = await makeServerStore();
    chatsApi.postMessage.mockRejectedValueOnce(new ApiError(400, null));
    await send(store);
    chatsApi.postMessage.mockResolvedValueOnce(serverDto(3));

    const retry = store.dispatch(retryMessage('k1'));
    expect(outboxOf(store)[0].status).toBe('sending');
    await retry;

    expect(chatsApi.postMessage).toHaveBeenLastCalledWith('s1', expect.objectContaining({ clientId: 'k1', body: 'привет' }));
    expect(outboxOf(store)).toEqual([]);
    expect(selectChatMessages(store.getState(), 's1')).toHaveLength(1);
  });

  it('retryMessage не трогает сообщение не в статусе failed и неизвестный clientId', async () => {
    const store = await makeServerStore();
    chatsApi.postMessage.mockReturnValue(new Promise(() => {}));
    send(store);
    chatsApi.postMessage.mockClear();

    await store.dispatch(retryMessage('k1'));
    await store.dispatch(retryMessage('nope'));

    expect(chatsApi.postMessage).not.toHaveBeenCalled();
  });

  it('local-чат: POST не уходит, очередь не используется', async () => {
    const store = await makeServerStore();
    store.dispatch(localChat('loc', 'Local'));

    await store.dispatch(sendMessage({ chatId: 'loc', senderId: 'u1', body: 'x' }));

    expect(chatsApi.postMessage).not.toHaveBeenCalled();
    expect(selectChatOutbox(store.getState(), 'loc')).toEqual([]);
    expect(selectChatMessages(store.getState(), 'loc')).toHaveLength(1);
  });
});
