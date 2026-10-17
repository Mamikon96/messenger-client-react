import { createEntityAdapter, createSelector, createSlice } from '@reduxjs/toolkit'
import { createClientId } from '../services/clientId'
import { selectChatById } from './chats'
import { messageAdded } from './messageEvents'
import { postMessage } from '../services/chatsApi'
import { outboxEnqueued, outboxFailed, outboxSending, selectOutboxItem } from './outbox'
import { fetchOlderMessages, loadChatHistory } from './chatHistory'

// Сообщения лежат по chatId; внутри чата ключ — seq, порядок — по возрастанию seq. Форма — ChatMessageDto (раздел 4 docs/client-integration.md).
const messagesAdapter = createEntityAdapter({
    selectId: (message) => message.seq,
    sortComparer: (a, b) => a.seq - b.seq,
})

// Страница истории с сервера: upsert по seq, порядок задаёт sortComparer. chatId у загрузки и подкачки берётся из аргумента по-разному.
const upsertPage = (state, chatId, messages) => {
    state[chatId] = messagesAdapter.upsertMany(state[chatId] ?? messagesAdapter.getInitialState(), messages)
}

export const messagesSlice = createSlice({
    name: "messages",
    initialState: {},
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(loadChatHistory.fulfilled, (state, action) => upsertPage(state, action.meta.arg, action.payload.messages))
            .addCase(fetchOlderMessages.fulfilled, (state, action) => upsertPage(state, action.meta.arg.chatId, action.payload.messages))
        builder.addCase(messageAdded, (state, action) => {
            const { chatId } = action.payload
            state[chatId] = messagesAdapter.addOne(state[chatId] ?? messagesAdapter.getInitialState(), action.payload)
        })
    },
})

const RETRY_BASE_MS = 1000
const MAX_AUTO_RETRIES = 3

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Повторять стоит сеть (нет статуса), 5xx и 429; 400/404 и прочее 4xx повтор не лечит.
const isRetryable = (error) => !error.status || error.status >= 500 || error.status === 429

// Пауза перед повтором: экспонента 1/2/4 с плюс джиттер до четверти; при 429 — Retry-After сервера.
const retryDelay = (error, attempt) => {
    if (error.status === 429 && error.retryAfter) return error.retryAfter * 1000
    const base = RETRY_BASE_MS * 2 ** attempt
    return base + base * 0.25 * Math.random()
}

// Доставка сообщения из очереди: до 3 автоповторов с тем же clientId, затем failed.
// Перед каждой попыткой и после ответа проверяем, что элемент ещё в очереди (store мог быть сброшен выходом).
const deliver = (clientId) => async (dispatch, getState) => {
    for (let attempt = 0; ; attempt++) {
        const item = selectOutboxItem(getState(), clientId)
        if (!item) return
        try {
            const message = await postMessage(item.chatId, { clientId, body: item.body })
            if (selectOutboxItem(getState(), clientId)) dispatch(messageAdded(message))
            return
        } catch (error) {
            if (!selectOutboxItem(getState(), clientId)) return
            if (!isRetryable(error) || attempt >= MAX_AUTO_RETRIES) {
                dispatch(outboxFailed(clientId))
                return
            }
            await wait(retryDelay(error, attempt))
        }
    }
}

// Отправка: в local-чате сообщение сразу получает seq = lastSeq + 1 (lastSeq хранит только chats, поэтому seq считает thunk);
// в серверном — встаёт в очередь outbox и уходит на сервер, seq назначает ответ. Чата нет — ничего не делает.
export const sendMessage = ({ chatId, senderId, body }) => (dispatch, getState) => {
    const chat = selectChatById(getState(), chatId)
    if (!chat) return
    const clientId = createClientId()
    const createdAt = new Date().toISOString()
    if (chat.local) {
        dispatch(messageAdded({ chatId, seq: chat.lastSeq + 1, senderId, clientId, body, createdAt }))
        return
    }
    dispatch(outboxEnqueued({ clientId, chatId, senderId, body, createdAt }))
    return dispatch(deliver(clientId))
}

// Повтор неотправленного сообщения вручную: только из failed, тот же clientId (сервер отдаст 200 вместо дубля).
export const retryMessage = (clientId) => (dispatch, getState) => {
    if (selectOutboxItem(getState(), clientId)?.status !== 'failed') return
    dispatch(outboxSending(clientId))
    return dispatch(deliver(clientId))
}

const { selectAll } = messagesAdapter.getSelectors()
const noMessages = []

// Сообщения чата по возрастанию seq. Ссылка стабильна, пока не изменились сообщения этого чата.
export const selectChatMessages = createSelector(
    [(state, chatId) => state.messages[chatId]],
    (chatMessages) => (chatMessages ? selectAll(chatMessages) : noMessages)
)

export default messagesSlice.reducer
