import reducer, {
    outboxEnqueued,
    outboxFailed,
    outboxSending,
    selectChatOutbox,
    selectOutboxItem,
} from './outbox';
import { messageAdded } from './messageEvents';
import { fetchOlderMessages, loadChatHistory } from './chatHistory';

const item = (clientId, chatId = 'c1') => ({
    clientId,
    chatId,
    senderId: 'u1',
    body: `текст ${clientId}`,
    createdAt: '2026-10-17T10:00:00.000Z',
});

const wrap = (outbox) => ({ outbox });

describe('outbox reducer', () => {
    it('начальное состояние — пусто', () => {
        expect(reducer(undefined, { type: '@@init' })).toEqual({ ids: [], entities: {} });
    });

    it('outboxEnqueued кладёт сообщение по clientId со статусом sending', () => {
        const state = reducer(undefined, outboxEnqueued(item('k1')));

        expect(state.ids).toEqual(['k1']);
        expect(state.entities.k1).toEqual({ ...item('k1'), status: 'sending' });
    });

    it('outboxFailed и outboxSending переключают статус', () => {
        let state = reducer(undefined, outboxEnqueued(item('k1')));

        state = reducer(state, outboxFailed('k1'));
        expect(state.entities.k1.status).toBe('failed');

        state = reducer(state, outboxSending('k1'));
        expect(state.entities.k1.status).toBe('sending');
    });

    it('смена статуса неизвестного clientId ничего не меняет', () => {
        const state = reducer(undefined, outboxEnqueued(item('k1')));

        expect(reducer(state, outboxFailed('nope'))).toEqual(state);
    });

    it('messageAdded с тем же clientId убирает сообщение из очереди', () => {
        let state = reducer(undefined, outboxEnqueued(item('k1')));
        state = reducer(state, outboxEnqueued(item('k2')));

        state = reducer(state, messageAdded({ ...item('k1'), seq: 5 }));

        expect(state.ids).toEqual(['k2']);
    });

    it('messageAdded с чужим clientId очередь не трогает', () => {
        const state = reducer(undefined, outboxEnqueued(item('k1')));

        expect(reducer(state, messageAdded({ ...item('other'), seq: 5 }))).toBe(state);
    });

    describe('селекторы', () => {
        it('selectChatOutbox отдаёт сообщения чата в порядке постановки; ссылка стабильна', () => {
            let state = reducer(undefined, outboxEnqueued(item('k1')));
            state = reducer(state, outboxEnqueued(item('k2', 'c2')));
            state = reducer(state, outboxEnqueued(item('k3')));

            expect(selectChatOutbox(wrap(state), 'c1').map((m) => m.clientId)).toEqual(['k1', 'k3']);
            expect(selectChatOutbox(wrap(state), 'c1')).toBe(selectChatOutbox(wrap(state), 'c1'));
            expect(selectChatOutbox(wrap(state), 'none')).toEqual([]);
        });

        it('selectOutboxItem находит сообщение по clientId', () => {
            const state = reducer(undefined, outboxEnqueued(item('k1')));

            expect(selectOutboxItem(wrap(state), 'k1')).toMatchObject({ clientId: 'k1', status: 'sending' });
            expect(selectOutboxItem(wrap(state), 'nope')).toBeUndefined();
        });
    });

    describe('сообщения из истории', () => {
        const serverMessage = (clientId, seq) => ({ chatId: 'c1', seq, senderId: 'u1', clientId, body: 'x', createdAt: '2026-10-17T10:00:00.000Z' });
        const filled = () => ['k1', 'k2', 'k3'].reduce((state, id) => reducer(state, outboxEnqueued(item(id))), undefined);

        it('loadChatHistory.fulfilled убирает из очереди сообщения, чей clientId пришёл с сервера', () => {
            const payload = { chat: {}, messages: [serverMessage('k1', 1), serverMessage('other', 2)], hasMore: false };

            const state = reducer(filled(), loadChatHistory.fulfilled(payload, 'r', 'c1'));

            expect(state.ids).toEqual(['k2', 'k3']);
        });

        it('fetchOlderMessages.fulfilled убирает из очереди сообщения, чей clientId пришёл с сервера', () => {
            const payload = { messages: [serverMessage('k3', 1)], hasMore: false };

            const state = reducer(filled(), fetchOlderMessages.fulfilled(payload, 'r', { chatId: 'c1', before: 5 }));

            expect(state.ids).toEqual(['k1', 'k2']);
        });
    });
});
