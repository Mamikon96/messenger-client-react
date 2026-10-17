import { combineReducers, configureStore } from '@reduxjs/toolkit'
import chatsSlice from './reducers/chats'
import activeChatIdSlice from './reducers/activeChatId'
import messagesSlice from './reducers/messages'
import outboxSlice from './reducers/outbox'
import usersSlice from './reducers/users'
import realtimeSlice from './reducers/realtime'
import authSlice, { logout, selectAuthStatus, sessionClosed } from './reducers/auth'

const appReducer = combineReducers({
  chats: chatsSlice,
  activeChatId: activeChatIdSlice,
  messages: messagesSlice,
  outbox: outboxSlice,
  users: usersSlice,
  realtime: realtimeSlice,
  auth: authSlice
})

// Выход сбрасывает весь store одним действием: все слайсы возвращаются к начальному состоянию.
// Закрытая вне вкладки сессия сбрасывает store так же, но только у вошедшего: запоздавший 401
// после обычного выхода или на экране входа не должен показывать сообщение о закрытой сессии.
// Слайс auth сам решает, принять ли событие, поэтому его новое состояние берётся из редьюсера, а остальные слайсы — начальные.
export const rootReducer = (state, action) => {
  if (sessionClosed.match(action)) {
    if (!state || selectAuthStatus(state) !== 'authenticated') return state
    return { ...appReducer(undefined, action), auth: appReducer(state, action).auth }
  }
  return appReducer(logout.fulfilled.match(action) ? undefined : state, action)
}

export default configureStore({
  reducer: rootReducer,
})