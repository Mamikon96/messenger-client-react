import { createEntityAdapter, createSlice } from '@reduxjs/toolkit'

// Пользователи по UserSummary (раздел 4 docs/client-integration.md); наполняет сервер (FE-38, FE-39, FE-41).
const usersAdapter = createEntityAdapter()

export const usersSlice = createSlice({
    name: "users",
    initialState: usersAdapter.getInitialState(),
    reducers: {
        usersReceived: usersAdapter.upsertMany,
    }
})

export const { usersReceived } = usersSlice.actions

export const { selectAll: selectUsers, selectById: selectUserById } =
    usersAdapter.getSelectors((state) => state.users)

export default usersSlice.reducer
