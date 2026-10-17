import { createEntityAdapter, createSelector, createSlice } from '@reduxjs/toolkit'
import { messageAdded } from './messageEvents'
import { fetchOlderMessages, loadChatHistory } from './chatHistory'

// Исходящие сообщения серверных чатов, ещё не подтверждённые сервером, по clientId. Живут только в памяти (FE-D15(1)).
// Статус: sending | failed. Подтверждённое сообщение приходит как messageAdded с тем же clientId и покидает очередь.
const outboxAdapter = createEntityAdapter({
    selectId: (item) => item.clientId,
})

// Сообщение, уже пришедшее с сервера в истории (например, отправленное до обрыва ответа), покидает очередь.
const removeDelivered = (state, action) => {
    outboxAdapter.removeMany(state, action.payload.messages.map((message) => message.clientId).filter((id) => id in state.entities))
}

const setStatus = (status) => (state, action) => {
    outboxAdapter.updateOne(state, { id: action.payload, changes: { status } })
}

export const outboxSlice = createSlice({
    name: 'outbox',
    initialState: outboxAdapter.getInitialState(),
    reducers: {
        outboxEnqueued: (state, action) => {
            outboxAdapter.addOne(state, { ...action.payload, status: 'sending' })
        },
        outboxSending: setStatus('sending'),
        outboxFailed: setStatus('failed'),
    },
    extraReducers: (builder) => {
        builder.addCase(messageAdded, (state, action) => {
            if (action.payload.clientId in state.entities) outboxAdapter.removeOne(state, action.payload.clientId)
        })
        builder.addCase(loadChatHistory.fulfilled, removeDelivered)
        builder.addCase(fetchOlderMessages.fulfilled, removeDelivered)
    },
})

export const { outboxEnqueued, outboxSending, outboxFailed } = outboxSlice.actions

const { selectAll, selectById } = outboxAdapter.getSelectors((state) => state.outbox)

export const selectOutboxItem = selectById

// Сообщения чата в порядке постановки. Ссылка стабильна, пока очередь не менялась.
export const selectChatOutbox = createSelector(
    [selectAll, (state, chatId) => chatId],
    (items, chatId) => items.filter((item) => item.chatId === chatId)
)

export default outboxSlice.reducer
