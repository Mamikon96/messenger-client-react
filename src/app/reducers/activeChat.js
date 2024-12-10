import { createSlice } from '@reduxjs/toolkit'

export const activeChatSlice = createSlice({
    name: "activeChat",
    initialState: {},
    reducers: {
        setActiveChat: (state, action) => {
            return ({...state, ...action.payload});
        },
    }
})

export const { setActiveChat } = activeChatSlice.actions

export default activeChatSlice.reducer