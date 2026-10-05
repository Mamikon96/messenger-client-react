import { createSlice, nanoid } from '@reduxjs/toolkit'

export const messagesSlice = createSlice({
    name: "messages",
    initialState: [],
    reducers: {
        addMessage: {
            reducer: (state, action) => {
                state.push(action.payload)
            },
            prepare: ({ chatId, authorId, text }) => ({
                payload: { id: nanoid(), chatId, authorId, text, ts: Date.now() }
            }),
        },
    }
})

export const { addMessage } = messagesSlice.actions

export default messagesSlice.reducer
