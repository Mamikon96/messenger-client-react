import { configureStore } from '@reduxjs/toolkit';
import authReducer, { checkSession } from './auth';
import chatsReducer from './chats';
import messagesReducer from './messages';
import outboxReducer from './outbox';
import usersReducer from './users';
import activeChatIdReducer from './activeChatId';
import { chatReceived, selectChatById } from './chats';
import { chatSelected } from './activeChatId';
import { selectChatMessages } from './messages';
import { selectUserById } from './users';
import reducer, { pauseRealtime, realtimeStatusChanged, resumeRealtime, selectRealtimeStatus, startRealtime } from './realtime';
import { createWsService } from '../services/wsService';
import * as chatsApi from '../services/chatsApi';

jest.mock('../services/wsService', () => ({ createWsService: jest.fn() }));
jest.mock('../services/chatsApi');

const me = { id: 'me', login: 'ann', firstName: 'Ann', lastName: '', name: 'Ann', avatarUrl: '' };
const chat = { id: 'c1', type: 'group', title: 'Team', lastSeq: 2, lastMessage: null, unreadCount: 0 };
const msg = (seq, extra = {}) => ({ chatId: 'c1', seq, senderId: 'u2', clientId: `k${seq}`, body: `m${seq}`, createdAt: '2026-10-17T10:00:00.000Z', ...extra });
const frame = (seq, extra) => ({ type: 'message.new', payload: msg(seq, extra) });
const chatDto = (id = 'c1', lastSeq = 2) => ({
  id,
  type: 'group',
  title: 'Новый',
  lastSeq,
  members: [
    { userId: 'me', name: 'Ann', avatarUrl: '', role: 'owner' },
    { userId: 'u2', name: 'Bob', avatarUrl: '', role: 'member' },
  ],
});

const rootReducer = {
  chats: chatsReducer,
  messages: messagesReducer,
  outbox: outboxReducer,
  users: usersReducer,
  activeChatId: activeChatIdReducer,
  realtime: reducer,
  auth: authReducer,
};

let options;
let service;
let store;
let cleanup;

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const receive = async (data) => {
  options.onFrame(data);
  await flush();
};

const setup = ({ withChat = true } = {}) => {
  store = configureStore({ reducer: rootReducer });
  store.dispatch(checkSession.fulfilled(me, 'req'));
  if (withChat) store.dispatch(chatReceived(chat));
  cleanup = store.dispatch(startRealtime());
};

beforeEach(() => {
  createWsService.mockImplementation((opts) => {
    options = opts;
    service = { connect: jest.fn(), close: jest.fn() };
    return service;
  });
});

describe('слайс realtime', () => {
  it('начальный статус closed, realtimeStatusChanged его меняет', () => {
    const state = reducer(undefined, { type: '@@init' });
    expect(state).toEqual({ status: 'closed' });

    expect(reducer(state, realtimeStatusChanged('displaced'))).toEqual({ status: 'displaced' });
  });
});

describe('startRealtime, pauseRealtime, resumeRealtime', () => {
  it('startRealtime создаёт сервис, подключает и переносит его статус в store', () => {
    setup();

    expect(service.connect).toHaveBeenCalledTimes(1);
    options.onStatus('open');
    expect(selectRealtimeStatus(store.getState())).toBe('open');
  });

  it('cleanup закрывает сервис', () => {
    setup();

    cleanup();

    expect(service.close).toHaveBeenCalledTimes(1);
  });

  it('повторный startRealtime (StrictMode) закрывает прежний сервис и создаёт новый', () => {
    setup();
    const first = service;

    store.dispatch(startRealtime());

    expect(first.close).toHaveBeenCalled();
    expect(service).not.toBe(first);
    expect(service.connect).toHaveBeenCalledTimes(1);
  });

  it('pauseRealtime закрывает сокет, resumeRealtime подключает снова', () => {
    setup();

    store.dispatch(pauseRealtime());
    expect(service.close).toHaveBeenCalledTimes(1);

    store.dispatch(resumeRealtime());
    expect(service.connect).toHaveBeenCalledTimes(2);
  });

  it('pauseRealtime и resumeRealtime без запущенного сервиса ничего не делают', () => {
    store = configureStore({ reducer: rootReducer });

    expect(() => {
      store.dispatch(pauseRealtime());
      store.dispatch(resumeRealtime());
    }).not.toThrow();
  });

  it('onSessionClosed сбрасывает store (sessionClosed)', () => {
    setup();

    options.onSessionClosed();

    expect(store.getState().auth.status).toBe('sessionClosed');
  });

  it('кадр при auth.status ≠ authenticated отбрасывается, сокет закрывается', async () => {
    setup();
    store.dispatch(checkSession.fulfilled(null, 'req'));

    await receive(frame(3));

    expect(service.close).toHaveBeenCalled();
    expect(selectChatMessages(store.getState(), 'c1')).toEqual([]);
  });
});

describe('message.new', () => {
  it('известный чат: сообщение в store, последнее сообщение и непрочитанное обновлены', async () => {
    setup();

    await receive(frame(3));

    const state = store.getState();
    expect(selectChatMessages(state, 'c1').map((m) => m.seq)).toEqual([3]);
    expect(selectChatById(state, 'c1')).toMatchObject({ lastSeq: 3, unreadCount: 1 });
    expect(selectChatById(state, 'c1').lastMessage.body).toBe('m3');
  });

  it('открытый чат: непрочитанное не растёт', async () => {
    setup();
    store.dispatch(chatSelected('c1'));

    await receive(frame(3));

    expect(selectChatById(store.getState(), 'c1').unreadCount).toBe(0);
  });

  it('своё сообщение (другая вкладка): непрочитанное не растёт', async () => {
    setup();

    await receive(frame(3, { senderId: 'me' }));

    expect(selectChatById(store.getState(), 'c1')).toMatchObject({ lastSeq: 3, unreadCount: 0 });
  });

  it('дубль (chatId, seq) игнорируется', async () => {
    setup();

    await receive(frame(3));
    await receive(frame(3));

    expect(selectChatMessages(store.getState(), 'c1')).toHaveLength(1);
    expect(selectChatById(store.getState(), 'c1').unreadCount).toBe(1);
  });

  it('разрыв seq: догонка since=lastSeq, сообщения добавляются по порядку', async () => {
    setup();
    chatsApi.fetchMessages.mockResolvedValue([msg(3), msg(4), msg(5)]);

    await receive(frame(5));

    expect(chatsApi.fetchMessages).toHaveBeenCalledWith('c1', { since: 2, limit: 100, signal: expect.any(AbortSignal) });
    const state = store.getState();
    expect(selectChatMessages(state, 'c1').map((m) => m.seq)).toEqual([3, 4, 5]);
    expect(selectChatById(state, 'c1')).toMatchObject({ lastSeq: 5, unreadCount: 3 });
  });

  it('догонка листает страницами по 100, пока не придёт короче 100', async () => {
    setup();
    const page = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => msg(from + i));
    chatsApi.fetchMessages.mockResolvedValueOnce(page(3, 102)).mockResolvedValueOnce(page(103, 110));

    await receive(frame(110));

    expect(chatsApi.fetchMessages).toHaveBeenCalledTimes(2);
    expect(chatsApi.fetchMessages).toHaveBeenNthCalledWith(2, 'c1', { since: 102, limit: 100, signal: expect.any(AbortSignal) });
    expect(selectChatMessages(store.getState(), 'c1')).toHaveLength(108);
  });

  it('если догонка не вернула сообщение кадра, оно всё равно добавляется', async () => {
    setup();
    chatsApi.fetchMessages.mockResolvedValue([msg(3)]);

    await receive(frame(5));

    expect(selectChatMessages(store.getState(), 'c1').map((m) => m.seq)).toEqual([3, 5]);
  });

  it('ошибка догонки глотается, store цел', async () => {
    setup();
    chatsApi.fetchMessages.mockRejectedValue(new TypeError('Failed to fetch'));

    await receive(frame(5));

    expect(selectChatMessages(store.getState(), 'c1')).toEqual([]);
    expect(selectChatById(store.getState(), 'c1').lastSeq).toBe(2);
  });

  it('параллельные кадры одного чата не запускают две догонки', async () => {
    setup();
    let release;
    chatsApi.fetchMessages.mockImplementation(() => new Promise((resolve) => { release = () => resolve([msg(3), msg(4), msg(5), msg(6)]); }));

    options.onFrame(frame(5));
    options.onFrame(frame(6));
    await flush();
    release();
    await flush();

    expect(chatsApi.fetchMessages).toHaveBeenCalledTimes(1);
    expect(selectChatMessages(store.getState(), 'c1').map((m) => m.seq)).toEqual([3, 4, 5, 6]);
    expect(selectChatById(store.getState(), 'c1').unreadCount).toBe(4);
  });

  it('неизвестный чат: GET чата, участники в users, чат в списке, затем сообщение', async () => {
    setup({ withChat: false });
    chatsApi.fetchChat.mockResolvedValue(chatDto('c1', 2));

    await receive(frame(3));

    const state = store.getState();
    expect(chatsApi.fetchChat).toHaveBeenCalledWith('c1', { signal: expect.any(AbortSignal) });
    expect(selectUserById(state, 'u2')).toMatchObject({ name: 'Bob' });
    expect(selectChatById(state, 'c1')).toMatchObject({ title: 'Новый', lastSeq: 3, unreadCount: 1 });
    expect(selectChatMessages(state, 'c1').map((m) => m.seq)).toEqual([3]);
  });

  it('параллельные кадры неизвестного чата ждут один запрос чата', async () => {
    setup({ withChat: false });
    let release;
    chatsApi.fetchChat.mockImplementation(() => new Promise((resolve) => { release = () => resolve(chatDto('c1', 4)); }));

    options.onFrame(frame(3));
    options.onFrame(frame(4));
    await flush();
    release();
    await flush();

    expect(chatsApi.fetchChat).toHaveBeenCalledTimes(1);
    expect(selectChatMessages(store.getState(), 'c1').map((m) => m.seq)).toEqual([3, 4]);
  });

  it('ошибка загрузки чата глотается, сообщение не добавляется', async () => {
    setup({ withChat: false });
    chatsApi.fetchChat.mockRejectedValue(new Error('404'));

    await receive(frame(3));

    expect(selectChatById(store.getState(), 'c1')).toBeUndefined();
    expect(selectChatMessages(store.getState(), 'c1')).toEqual([]);
  });

  it('chat.removed до ответа GET чата: чат не появляется', async () => {
    setup({ withChat: false });
    let release;
    chatsApi.fetchChat.mockImplementation(() => new Promise((resolve) => { release = () => resolve(chatDto('c1', 2)); }));

    options.onFrame(frame(3));
    await flush();
    await receive({ type: 'chat.removed', payload: { chatId: 'c1' } });
    release();
    await flush();

    expect(selectChatById(store.getState(), 'c1')).toBeUndefined();
    expect(selectChatMessages(store.getState(), 'c1')).toEqual([]);
  });

  it('ответ GET чата от прежнего сервиса (после cleanup и смены пользователя) не попадает в store', async () => {
    setup({ withChat: false });
    let release;
    chatsApi.fetchChat.mockImplementation(() => new Promise((resolve) => { release = () => resolve(chatDto('c1', 2)); }));

    options.onFrame(frame(3));
    await flush();
    const { signal } = chatsApi.fetchChat.mock.calls[0][1];
    cleanup();
    store.dispatch(checkSession.fulfilled({ ...me, id: 'other' }, 'req'));
    chatsApi.fetchChat.mockResolvedValue(chatDto('c2', 0));
    cleanup = store.dispatch(startRealtime());
    release();
    await flush();

    expect(signal.aborted).toBe(true);
    expect(selectChatById(store.getState(), 'c1')).toBeUndefined();
    expect(selectChatMessages(store.getState(), 'c1')).toEqual([]);
  });

  it('ответ догонки от прежнего сервиса не попадает в store, signal передан в запрос', async () => {
    setup();
    let release;
    chatsApi.fetchMessages.mockImplementation(() => new Promise((resolve) => { release = () => resolve([msg(3), msg(4)]); }));

    options.onFrame(frame(4));
    await flush();
    const { signal } = chatsApi.fetchMessages.mock.calls[0][1];
    cleanup();
    store.dispatch(checkSession.fulfilled({ ...me, id: 'other' }, 'req'));
    cleanup = store.dispatch(startRealtime());
    release();
    await flush();

    expect(signal.aborted).toBe(true);
    expect(selectChatMessages(store.getState(), 'c1')).toEqual([]);
  });

  it('закрытие сервиса по сигналу onFrame при потере сессии отменяет запросы', async () => {
    setup({ withChat: false });
    chatsApi.fetchChat.mockImplementation(() => new Promise(() => {}));

    options.onFrame(frame(3));
    await flush();
    const { signal } = chatsApi.fetchChat.mock.calls[0][1];
    store.dispatch(checkSession.fulfilled(null, 'req'));
    options.onFrame(frame(4));

    expect(signal.aborted).toBe(true);
  });

  it.each([
    ['без seq', { type: 'message.new', payload: { chatId: 'c1', senderId: 'u2', body: 'x' } }],
    ['seq не число', frame('3')],
    ['seq ноль', frame(0)],
    ['payload не объект', { type: 'message.new', payload: null }],
    ['тело не строка', frame(3, { body: 5 })],
  ])('невалидный payload (%s) игнорируется', async (_, data) => {
    setup();

    await receive(data);

    expect(selectChatMessages(store.getState(), 'c1')).toEqual([]);
    expect(chatsApi.fetchMessages).not.toHaveBeenCalled();
  });

  it('message.new после chat.removed игнорируется', async () => {
    setup();
    await receive({ type: 'chat.removed', payload: { chatId: 'c1' } });

    await receive(frame(3));

    expect(selectChatById(store.getState(), 'c1')).toBeUndefined();
    expect(selectChatMessages(store.getState(), 'c1')).toEqual([]);
    expect(chatsApi.fetchChat).not.toHaveBeenCalled();
  });
});

describe('chat.*', () => {
  it('chat.created: участники в users, чат в списке', async () => {
    setup({ withChat: false });

    await receive({ type: 'chat.created', payload: chatDto('c9', 0) });

    const state = store.getState();
    expect(selectUserById(state, 'u2')).toMatchObject({ name: 'Bob' });
    expect(selectChatById(state, 'c9')).toMatchObject({ title: 'Новый', unreadCount: 0, members: [{ userId: 'me', role: 'owner' }, { userId: 'u2', role: 'member' }] });
  });

  it('chat.created после chat.removed того же id снова принимает сообщения', async () => {
    setup();
    await receive({ type: 'chat.removed', payload: { chatId: 'c1' } });
    await receive({ type: 'chat.created', payload: chatDto('c1', 2) });

    await receive(frame(3));

    expect(selectChatMessages(store.getState(), 'c1').map((m) => m.seq)).toEqual([3]);
  });

  it('chat.updated с title меняет название', async () => {
    setup();

    await receive({ type: 'chat.updated', payload: { chatId: 'c1', title: 'Другое' } });

    expect(selectChatById(store.getState(), 'c1').title).toBe('Другое');
  });

  it('chat.updated с members меняет состав и дополняет users', async () => {
    setup();

    await receive({ type: 'chat.updated', payload: { chatId: 'c1', members: [{ userId: 'u3', name: 'Cat', avatarUrl: '', role: 'owner' }] } });

    const state = store.getState();
    expect(selectChatById(state, 'c1').members).toEqual([{ userId: 'u3', role: 'owner' }]);
    expect(selectUserById(state, 'u3')).toMatchObject({ name: 'Cat' });
  });

  it('chat.removed убирает чат и его сообщения, снимает выбор', async () => {
    setup();
    await receive(frame(3));
    store.dispatch(chatSelected('c1'));

    await receive({ type: 'chat.removed', payload: { chatId: 'c1' } });

    const state = store.getState();
    expect(selectChatById(state, 'c1')).toBeUndefined();
    expect(selectChatMessages(state, 'c1')).toEqual([]);
    expect(state.activeChatId).toBeNull();
  });

  it('chat.updated: title не строка и members не массив не попадают в chatUpdated', async () => {
    setup();

    await receive({ type: 'chat.updated', payload: { chatId: 'c1', title: 5, members: 'x', extra: 1 } });

    expect(selectChatById(store.getState(), 'c1')).toEqual(chat);
  });

  it('chat.updated и chat.created: элементы members, не являющиеся объектами, отбрасываются', async () => {
    setup();

    await receive({ type: 'chat.updated', payload: { chatId: 'c1', members: [null, 'x', { userId: 'u3', name: 'Cat', avatarUrl: '', role: 'owner' }] } });
    await receive({ type: 'chat.created', payload: { ...chatDto('c9', 0), members: [null, 7, ...chatDto().members] } });

    const state = store.getState();
    expect(selectChatById(state, 'c1').members).toEqual([{ userId: 'u3', role: 'owner' }]);
    expect(selectChatById(state, 'c9').members).toEqual([{ userId: 'me', role: 'owner' }, { userId: 'u2', role: 'member' }]);
  });

  it.each([
    ['неизвестный type', { type: 'something.else', payload: {} }],
    ['error', { type: 'error', payload: { code: 'unsupported_type', message: 'x' } }],
    ['chat.created без id', { type: 'chat.created', payload: { members: [] } }],
    ['chat.updated без chatId', { type: 'chat.updated', payload: { title: 'X' } }],
    ['chat.removed без chatId', { type: 'chat.removed', payload: {} }],
  ])('%s игнорируется', async (_, data) => {
    setup();
    const before = store.getState();

    await receive(data);

    expect(store.getState()).toEqual(before);
  });
});
