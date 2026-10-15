import { createEntityAdapter, createSlice } from '@reduxjs/toolkit'
import { createClientId } from '../services/clientId'
import { messageAdded } from './messageEvents'

// Элемент списка чатов по ChatListItemDto (docs/client-integration.md, раздел 4). Порядок — порядок добавления.
const chatsAdapter = createEntityAdapter()

export const chatsSlice = createSlice({
    name: "chats",
    initialState: chatsAdapter.getInitialState(),
    reducers: {
        chatCreated: {
            reducer: chatsAdapter.addOne,
            prepare: ({ title }) => ({
                payload: { id: createClientId(), type: "group", title, lastSeq: 0, lastMessage: null, unreadCount: 0 }
            }),
        },
    },
    extraReducers: (builder) => {
        builder.addCase(messageAdded, (state, action) => {
            const chat = state.entities[action.payload.chatId]
            if (!chat || action.payload.seq <= chat.lastSeq) return
            chat.lastSeq = action.payload.seq
            chat.lastMessage = action.payload
        })
    },
})

export const { chatCreated } = chatsSlice.actions

export const { selectAll: selectChats, selectById: selectChatById } =
    chatsAdapter.getSelectors((state) => state.chats)

export default chatsSlice.reducer
