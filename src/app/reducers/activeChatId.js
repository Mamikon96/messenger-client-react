import { createSlice } from '@reduxjs/toolkit'
import { selectChatById } from './chats'

export const activeChatIdSlice = createSlice({
    name: "activeChatId",
    initialState: null,
    reducers: {
        chatSelected: (state, action) => action.payload,
    }
})

export const { chatSelected } = activeChatIdSlice.actions

export const selectActiveChatId = (state) => state.activeChatId
export const selectActiveChat = (state) => selectChatById(state, selectActiveChatId(state))

export default activeChatIdSlice.reducer
