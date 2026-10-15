import { createAsyncThunk, createEntityAdapter, createSlice } from '@reduxjs/toolkit'
import { createClientId } from '../services/clientId'
import { fetchChats as fetchChatsRequest } from '../services/chatsApi'
import { messageAdded } from './messageEvents'

// Элемент списка чатов по ChatListItemDto (docs/client-integration.md, раздел 4), но у direct вместо вложенного peer — peerId
// (сам peer лежит в слайсе users). Порядок — порядок добавления: после загрузки это порядок сервера, без клиентской сортировки.
const chatsAdapter = createEntityAdapter()

// Загрузка списка чатов: ответ сервера заменяет список целиком. Ошибка запроса отклоняет thunk.
export const fetchChats = createAsyncThunk(
    'chats/fetchChats',
    async (_, { signal, requestId, getState, rejectWithValue }) => {
        const chats = await fetchChatsRequest({ signal })
        // Store могли сбросить (выход, закрытая сессия) или запустить новую загрузку, пока шёл запрос:
        // устаревший ответ не должен дойти до fulfilled, иначе слайсы (в т. ч. users) запишут чужие данные.
        if (getState().chats.requestId !== requestId) return rejectWithValue('stale')
        return chats
    }
)

// ChatListItemDto → элемент списка: peer (только у direct) заменяется на peerId.
export const toChat = ({ peer, ...chat }) => (peer ? { ...chat, peerId: peer.id } : chat)

export const chatsSlice = createSlice({
    name: "chats",
    // status: idle — ещё не грузили, loading — идёт загрузка, succeeded — список получен, failed — загрузить не удалось.
    // requestId — запрос, чей ответ ждём (null вне загрузки): ответы остальных запросов игнорируются.
    initialState: chatsAdapter.getInitialState({ status: 'idle', requestId: null }),
    reducers: {
        chatCreated: {
            reducer: chatsAdapter.addOne,
            prepare: ({ title }) => ({
                payload: { id: createClientId(), type: "group", title, lastSeq: 0, lastMessage: null, unreadCount: 0 }
            }),
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchChats.pending, (state, action) => {
                state.status = 'loading'
                state.requestId = action.meta.requestId
            })
            .addCase(fetchChats.fulfilled, (state, action) => {
                if (action.meta.requestId !== state.requestId) return
                chatsAdapter.setAll(state, action.payload.map(toChat))
                state.status = 'succeeded'
                state.requestId = null
            })
            .addCase(fetchChats.rejected, (state, action) => {
                if (action.meta.aborted || action.meta.requestId !== state.requestId) return
                state.status = 'failed'
                state.requestId = null
            })
        builder.addCase(messageAdded, (state, action) => {
            const chat = state.entities[action.payload.chatId]
            if (!chat || action.payload.seq <= chat.lastSeq) return
            chat.lastSeq = action.payload.seq
            chat.lastMessage = action.payload
        })
    },
})

export const { chatCreated } = chatsSlice.actions

export const { selectAll: selectChats, selectById: selectChatById } =
    chatsAdapter.getSelectors((state) => state.chats)

export const selectChatsStatus = (state) => state.chats.status

// Отображаемое имя чата: у группы — title, у direct — имя собеседника из users; нет данных — пустая строка.
export const selectChatName = (state, chatId) => {
    const chat = state.chats.entities[chatId]
    if (!chat) return ''
    if (chat.peerId) return state.users.entities[chat.peerId]?.name ?? ''
    return chat.title ?? ''
}

export default chatsSlice.reducer
