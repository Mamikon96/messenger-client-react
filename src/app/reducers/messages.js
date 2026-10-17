import { createEntityAdapter, createSelector, createSlice } from '@reduxjs/toolkit'
import { createClientId } from '../services/clientId'
import { selectChatById } from './chats'
import { messageAdded } from './messageEvents'
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

// Локальная отправка: seq = lastSeq чата + 1 (lastSeq хранит только chats, поэтому seq считает thunk по getState).
// Чата нет — ничего не делает. Слайсы получают готовое событие messageAdded.
export const sendMessage = ({ chatId, senderId, body }) => (dispatch, getState) => {
    const chat = selectChatById(getState(), chatId)
    if (!chat) return
    dispatch(messageAdded({
        chatId,
        seq: chat.lastSeq + 1,
        senderId,
        clientId: createClientId(),
        body,
        createdAt: new Date().toISOString(),
    }))
}

const { selectAll } = messagesAdapter.getSelectors()
const noMessages = []

// Сообщения чата по возрастанию seq. Ссылка стабильна, пока не изменились сообщения этого чата.
export const selectChatMessages = createSelector(
    [(state, chatId) => state.messages[chatId]],
    (chatMessages) => (chatMessages ? selectAll(chatMessages) : noMessages)
)

export default messagesSlice.reducer
