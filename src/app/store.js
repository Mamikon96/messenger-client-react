import { configureStore } from '@reduxjs/toolkit'
// import chatsReducer from './reducers/chatsReducer'
import chatsSlice from './reducers/chats'
import activeChatSlice from './reducers/activeChat'
import usersSlice from './reducers/users'
import authSlice from './reducers/auth'

export default configureStore({
  reducer: {
    chats: chatsSlice,
    activeChat: activeChatSlice,
    users: usersSlice,
    auth: authSlice
  },
})