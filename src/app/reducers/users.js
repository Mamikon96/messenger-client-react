import { createEntityAdapter, createSlice } from '@reduxjs/toolkit'
import { fetchChats } from './chats'

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
    }
})

export const { usersReceived } = usersSlice.actions

export const { selectAll: selectUsers, selectById: selectUserById } =
    usersAdapter.getSelectors((state) => state.users)

export default usersSlice.reducer
