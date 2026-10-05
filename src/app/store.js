import { combineReducers, configureStore } from '@reduxjs/toolkit'
// import chatsReducer from './reducers/chatsReducer'
import chatsSlice from './reducers/chats'
import activeChatSlice from './reducers/activeChat'
import usersSlice from './reducers/users'
import authSlice, { logout } from './reducers/auth'

const appReducer = combineReducers({
  chats: chatsSlice,
  activeChat: activeChatSlice,
  users: usersSlice,
  auth: authSlice
})

// Выход сбрасывает весь store одним действием: все слайсы возвращаются к начальному состоянию.
export const rootReducer = (state, action) =>
  appReducer(logout.fulfilled.match(action) ? undefined : state, action)

export default configureStore({
  reducer: rootReducer,
})