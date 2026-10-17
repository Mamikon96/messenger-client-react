import { createEntityAdapter, createSlice } from '@reduxjs/toolkit'
import { fetchChats } from './chats'
import { loadChatHistory } from './chatHistory'

// Пользователи по UserSummary (раздел 4 docs/client-integration.md); наполняет сервер (FE-38, FE-39, FE-41).
const usersAdapter = createEntityAdapter()

export const usersSlice = createSlice({
    name: "users",
    initialState: usersAdapter.getInitialState(),
    reducers: {
        usersReceived: usersAdapter.upsertMany,
    },
    extraReducers: (builder) => {
        // peer из ChatListItemDto (только у direct) — собеседники списка чатов.
        builder.addCase(fetchChats.fulfilled, (state, action) => {
            usersAdapter.upsertMany(state, action.payload.flatMap((chat) => (chat.peer ? [chat.peer] : [])))
        })
        // Участники открытого чата: имя автора сообщения берётся отсюда (в сообщении только senderId).
        builder.addCase(loadChatHistory.fulfilled, (state, action) => {
            usersAdapter.upsertMany(state, action.payload.chat.members.map(({ userId, name, avatarUrl }) => ({ id: userId, name, avatarUrl })))
        })
    }
})

export const { usersReceived } = usersSlice.actions

export const { selectAll: selectUsers, selectById: selectUserById, selectEntities: selectUserEntities } =
    usersAdapter.getSelectors((state) => state.users)

export default usersSlice.reducer
