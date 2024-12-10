import { createSlice, nanoid } from '@reduxjs/toolkit'

export const chatsSlice = createSlice({
    name: "chats",
    initialState: [],
    reducers: {
        addChat: (state, action) => {
            state.push({...action.payload, id: nanoid()})
        },
    }
})

export const { addChat } = chatsSlice.actions

export default chatsSlice.reducer