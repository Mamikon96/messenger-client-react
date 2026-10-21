import { createAsyncThunk, createEntityAdapter, createSlice } from '@reduxjs/toolkit'
import { fetchChat, fetchChats as fetchChatsRequest, postChatMember, postDirectChat, postGroupChat, postRead } from '../services/chatsApi'
import { ApiError } from '../services/apiClient'
import { selectAuthUserId } from './auth'
import { chatRemoved, messageAdded } from './messageEvents'
import { fetchOlderMessages, loadChatHistory } from './chatHistory'

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

// Открыть direct-чат с пользователем (POST /api/chats: 201 — создан, 200 — уже был). Ошибка отклоняет thunk кодом:
// 'not_found' — пользователь недоступен (404), 'failed' — прочее, 'stale' — store сбросили, пока шёл запрос. Слайсы activeChatId и users подписаны на fulfilled.
export const createDirectChat = createAsyncThunk(
    'chats/createDirectChat',
    async (userId, { signal, requestId, getState, rejectWithValue }) => {
        try {
            const dto = await postDirectChat(userId, { signal })
            // Store могли сбросить (выход, закрытая сессия, другой пользователь), пока шёл запрос: ответ прежнего пользователя не пишем.
            if (getState().chats.createRequestId !== requestId) return rejectWithValue('stale')
            // chat — элемент списка (peerId зависит от текущего пользователя), members — участники с именами для слайса users.
            return { chat: toChatFromDto(dto, selectAuthUserId(getState())), members: dto.members }
        } catch (error) {
            if (getState().chats.createRequestId !== requestId) return rejectWithValue('stale')
            return rejectWithValue(error instanceof ApiError && error.status === 404 ? 'not_found' : 'failed')
        }
    }
)

// Создать группу с названием (POST /api/chats: 201). Пока запрос идёт, повторный запуск отменяется (condition). Ошибка отклоняет thunk кодом:
// 'invalid' — сервер отверг название (400), 'failed' — прочее, 'stale' — store сбросили, пока шёл запрос. Слайсы activeChatId и users подписаны на fulfilled.
export const createGroupChat = createAsyncThunk(
    'chats/createGroupChat',
    async (title, { signal, requestId, getState, rejectWithValue }) => {
        try {
            const dto = await postGroupChat(title, { signal })
            if (getState().chats.groupRequestId !== requestId) return rejectWithValue('stale')
            return { chat: toChatFromDto(dto, selectAuthUserId(getState())), members: dto.members }
        } catch (error) {
            if (getState().chats.groupRequestId !== requestId) return rejectWithValue('stale')
            return rejectWithValue(error instanceof ApiError && error.status === 400 ? 'invalid' : 'failed')
        }
    },
    { condition: (_, { getState }) => getState().chats.groupRequestId === null }
)

// Код отказа приглашения по статусу ответа: 403 — не owner, 404 — нет группы или человека, 400 — лимит участников.
const INVITE_ERRORS = { 403: 'forbidden', 404: 'not_found', 400: 'limit' }

// Добавить человека в группу chatId (POST /api/chats/{id}/members: 204), затем перечитать карточку (GET /api/chats/{id}): состав берётся оттуда.
// 409 already_member — тоже успех; сбой GET после успешного POST — тоже успех (без нового состава). Пока приглашение идёт, повторный запуск отменяется (condition). Ошибка отклоняет thunk кодом:
// 'forbidden' / 'not_found' / 'limit' / 'failed', 'stale' — store сбросили, пока шёл запрос. Слайс users подписан на fulfilled.
export const addChatMember = createAsyncThunk(
    'chats/addChatMember',
    async ({ chatId, userId }, { signal, requestId, getState, rejectWithValue }) => {
        try {
            try {
                await postChatMember(chatId, userId, { signal })
            } catch (error) {
                if (!(error instanceof ApiError && error.status === 409)) throw error
            }
            // Приглашение уже выполнено: сбой перечитывания не его ошибка, состав остаётся прежним (members: undefined).
            let members
            try {
                members = (await fetchChat(chatId, { signal })).members
            } catch {
                members = undefined
            }
            if (getState().chats.inviteRequestId !== requestId) return rejectWithValue('stale')
            return { chatId, members }
        } catch (error) {
            if (getState().chats.inviteRequestId !== requestId) return rejectWithValue('stale')
            return rejectWithValue((error instanceof ApiError && INVITE_ERRORS[error.status]) || 'failed')
        }
    },
    { condition: (_, { getState }) => getState().chats.inviteRequestId === null }
)

// Отметить чат прочитанным до seq (POST /api/chats/{id}/read). Ошибка запроса отклоняет thunk, счётчик остаётся как был.
export const markChatRead = createAsyncThunk(
    'chats/markChatRead',
    async ({ chatId, seq }, { signal }) => {
        await postRead(chatId, { seq, signal })
    }
)

// ChatListItemDto → элемент списка: peer (только у direct) заменяется на peerId.
export const toChat = ({ peer, ...chat }) => (peer ? { ...chat, peerId: peer.id } : chat)

// ChatDto (GET /api/chats/{id}, chat.created) → элемент списка: lastMessage и непрочитанных у только что полученного чата нет.
// У direct peerId — второй участник (в чате с собой — я сам).
export const toChatFromDto = ({ id, type, title, lastSeq, members }, meId) => {
    const chat = {
        id, type, title, lastSeq, lastMessage: null, unreadCount: 0,
        members: members.map(({ userId, role }) => ({ userId, role })),
    }
    if (type !== 'direct') return chat
    return { ...chat, peerId: members.find(({ userId }) => userId !== meId)?.userId ?? meId }
}

// Сверка списка с сервером после переподключения (ChatListItemDto[]): чаты сервера в его порядке, history и сообщения сохраняются.
// payload: chats — ответ сервера; syncedIds — чаты, догнанные до lastSeq сервера (только им поднимаются lastSeq и lastMessage:
// на lastSeq стоит since, пока подкачка не прошла, пропуск нельзя скрывать); openChatId — открытый чат, его непрочитанные считает клиент;
// unreadExtra — чужие сообщения, пришедшие уже после снимка списка (сервер их в unreadCount не учёл).
// Текущие чаты, которых нет в ответе (локальные, пришедшие событием после снимка), остаются; исчезнувшие убирает вызывающий через chatRemoved.
const reconcile = (state, { chats, syncedIds, openChatId, unreadExtra = {} }) => {
    const merged = chats.map((server) => {
        const current = state.entities[server.id]
        if (!current) return toChat(server)
        const next = { ...current, title: server.title }
        if (server.id !== openChatId) next.unreadCount = server.unreadCount + (unreadExtra[server.id] ?? 0)
        const synced = syncedIds.includes(server.id)
        if (synced && server.lastSeq > current.lastSeq) next.lastSeq = server.lastSeq
        if (synced && server.lastMessage && (!current.lastMessage || server.lastMessage.seq > current.lastMessage.seq)) next.lastMessage = server.lastMessage
        return next
    })
    const serverIds = new Set(chats.map(({ id }) => id))
    const kept = state.ids.filter((id) => !serverIds.has(id)).map((id) => state.entities[id])
    chatsAdapter.setAll(state, [...merged, ...kept])
}

export const chatsSlice = createSlice({
    name: "chats",
    // status: idle — ещё не грузили, loading — идёт загрузка, succeeded — список получен, failed — загрузить не удалось.
    // requestId — запрос, чей ответ ждём (null вне загрузки): ответы остальных запросов игнорируются.
    // pendingUserId — пользователь, чей direct-чат открывается сейчас (null — ничего не открывается);
    // openedWhileLoadingIds — чаты, открытые через createDirectChat или createGroupChat, пока шла загрузка списка: ответ списка их не затирает.
    // createRequestId — запрос этого открытия, чей ответ ждём (после сброса store ответ прежнего запроса отбрасывается).
    // groupRequestId — запрос создания группы, чей ответ ждём (null — группа не создаётся).
    // inviteRequestId и invitingUserId — запрос приглашения в группу, чей ответ ждём, и приглашаемый (null — приглашения нет).
    initialState: chatsAdapter.getInitialState({ status: 'idle', requestId: null, pendingUserId: null, createRequestId: null, groupRequestId: null, inviteRequestId: null, invitingUserId: null, openedWhileLoadingIds: [] }),
    reducers: {
        // Чат, пришедший с сервера по событию: повтор с тем же id ничего не меняет.
        chatReceived: chatsAdapter.addOne,
        chatsReconciled: (state, action) => reconcile(state, action.payload),
        chatUpdated: (state, action) => {
            const { chatId, title, members } = action.payload
            const chat = state.entities[chatId]
            if (!chat) return
            if (title !== undefined) chat.title = title
            if (members) chat.members = members.map(({ userId, role }) => ({ userId, role }))
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchChats.pending, (state, action) => {
                state.status = 'loading'
                state.requestId = action.meta.requestId
                state.openedWhileLoadingIds = []
            })
            .addCase(fetchChats.fulfilled, (state, action) => {
                if (action.meta.requestId !== state.requestId) return
                // Чаты, открытые через createDirectChat или createGroupChat, пока список грузился, в ответе могут отсутствовать: остаются (как kept в reconcile).
                const fromServer = action.payload.map(toChat)
                const serverIds = new Set(fromServer.map(({ id }) => id))
                const kept = state.openedWhileLoadingIds.filter((id) => !serverIds.has(id) && state.entities[id]).map((id) => state.entities[id])
                chatsAdapter.setAll(state, [...fromServer, ...kept])
                state.openedWhileLoadingIds = []
                state.status = 'succeeded'
                state.requestId = null
            })
            .addCase(fetchChats.rejected, (state, action) => {
                if (action.meta.aborted || action.meta.requestId !== state.requestId) return
                state.status = 'failed'
                state.requestId = null
            })
        builder
            .addCase(createDirectChat.pending, (state, action) => {
                state.pendingUserId = action.meta.arg
                state.createRequestId = action.meta.requestId
            })
            .addCase(createDirectChat.fulfilled, (state, { payload }) => {
                state.pendingUserId = null
                state.createRequestId = null
                // Чат уже в списке (200): lastMessage и unreadCount актуальнее ответа, не перезаписываем.
                chatsAdapter.addOne(state, payload.chat)
                if (state.requestId !== null) state.openedWhileLoadingIds.push(payload.chat.id)
            })
            .addCase(createDirectChat.rejected, (state, action) => {
                if (action.meta.requestId !== state.createRequestId) return
                state.pendingUserId = null
                state.createRequestId = null
            })
        builder
            .addCase(createGroupChat.pending, (state, action) => {
                state.groupRequestId = action.meta.requestId
            })
            .addCase(createGroupChat.fulfilled, (state, { payload }) => {
                state.groupRequestId = null
                chatsAdapter.addOne(state, payload.chat)
                if (state.requestId !== null) state.openedWhileLoadingIds.push(payload.chat.id)
            })
            .addCase(createGroupChat.rejected, (state, action) => {
                if (action.meta.requestId !== state.groupRequestId) return
                state.groupRequestId = null
            })
        builder
            .addCase(addChatMember.pending, (state, action) => {
                state.inviteRequestId = action.meta.requestId
                state.invitingUserId = action.meta.arg.userId
            })
            .addCase(addChatMember.fulfilled, (state, { payload }) => {
                state.inviteRequestId = null
                state.invitingUserId = null
                const chat = state.entities[payload.chatId]
                if (chat && payload.members) chat.members = payload.members.map(({ userId, role }) => ({ userId, role }))
            })
            .addCase(addChatMember.rejected, (state, action) => {
                if (action.meta.requestId !== state.inviteRequestId) return
                state.inviteRequestId = null
                state.invitingUserId = null
            })
        // История чата (поле history): status — idle (поля нет) / loading / succeeded / failed; hasMore — есть ли старее;
        // olderStatus — подкачка старых (idle / loading / failed). requestId и olderRequestId — запросы, чьи ответы ждём.
        builder
            .addCase(loadChatHistory.pending, (state, action) => {
                const chat = state.entities[action.meta.arg]
                if (!chat) return
                chat.history = { status: 'loading', requestId: action.meta.requestId, hasMore: false, olderStatus: 'idle', olderRequestId: null }
            })
            .addCase(loadChatHistory.fulfilled, (state, action) => {
                const chat = state.entities[action.meta.arg]
                if (chat?.history?.requestId !== action.meta.requestId) return
                const { chat: dto, hasMore } = action.payload
                chat.title = dto.title
                chat.lastSeq = Math.max(chat.lastSeq, dto.lastSeq)
                chat.members = dto.members.map(({ userId, role }) => ({ userId, role }))
                chat.history = { ...chat.history, status: 'succeeded', requestId: null, hasMore }
            })
            .addCase(loadChatHistory.rejected, (state, action) => {
                const chat = state.entities[action.meta.arg]
                if (action.meta.aborted || chat?.history?.requestId !== action.meta.requestId) return
                chat.history = { ...chat.history, status: 'failed', requestId: null }
            })
            .addCase(fetchOlderMessages.pending, (state, action) => {
                const history = state.entities[action.meta.arg.chatId]?.history
                if (!history) return
                history.olderStatus = 'loading'
                history.olderRequestId = action.meta.requestId
            })
            .addCase(fetchOlderMessages.fulfilled, (state, action) => {
                const history = state.entities[action.meta.arg.chatId]?.history
                if (history?.olderRequestId !== action.meta.requestId) return
                history.hasMore = action.payload.hasMore
                history.olderStatus = 'idle'
                history.olderRequestId = null
            })
            .addCase(fetchOlderMessages.rejected, (state, action) => {
                const history = state.entities[action.meta.arg.chatId]?.history
                if (action.meta.aborted || history?.olderRequestId !== action.meta.requestId) return
                history.olderStatus = 'failed'
                history.olderRequestId = null
            })
        builder.addCase(messageAdded, (state, action) => {
            const chat = state.entities[action.payload.chatId]
            const { seq } = action.payload
            if (!chat || (chat.lastMessage && seq <= chat.lastMessage.seq)) return
            if (action.meta?.unread) chat.unreadCount += 1
            // lastSeq мог быть известен заранее (карточка чата), а lastMessage — ещё нет: более старое сообщение
            // считается непрочитанным, но не становится последним и не откатывает lastSeq.
            if (!chat.lastMessage && seq < chat.lastSeq) return
            chat.lastSeq = Math.max(chat.lastSeq, seq)
            chat.lastMessage = action.payload
        })
        // Сообщение, пришедшее после отправленного seq (lastSeq вырос), остаётся непрочитанным.
        builder.addCase(markChatRead.fulfilled, (state, action) => {
            const chat = state.entities[action.meta.arg.chatId]
            if (chat && action.meta.arg.seq >= chat.lastSeq) chat.unreadCount = 0
        })
        builder.addCase(chatRemoved, chatsAdapter.removeOne)
    },
})

export const { chatReceived, chatsReconciled, chatUpdated } = chatsSlice.actions

export const { selectAll: selectChats, selectById: selectChatById } =
    chatsAdapter.getSelectors((state) => state.chats)

export const selectChatsStatus = (state) => state.chats.status

export const selectPendingUserId = (state) => state.chats.pendingUserId

export const selectIsCreatingGroup = (state) => state.chats.groupRequestId !== null

// Id человека, которого приглашают в группу сейчас, или null.
export const selectInvitingUserId = (state) => state.chats.invitingUserId

// Я — owner чата: false, пока состав не загружен, у direct и неизвестного чата.
export const selectIsChatOwner = (state, chatId) => {
    const meId = selectAuthUserId(state)
    return Boolean(meId) && Boolean(state.chats.entities[chatId]?.members?.some(({ userId, role }) => userId === meId && role === 'owner'))
}

// Состояние загрузки истории чата или undefined, пока чат не открывали.
export const selectChatHistory = (state, chatId) => state.chats.entities[chatId]?.history

// Seq последнего своего сообщения, прочитанного собеседником (поле readSeq чата), или undefined, пока бэкенд его не присылает (FE-160).
export const selectChatReadSeq = (state, chatId) => state.chats.entities[chatId]?.readSeq

// Отображаемое имя чата: у группы — title, у direct — имя собеседника из users; нет данных — пустая строка.
export const selectChatName = (state, chatId) => {
    const chat = state.chats.entities[chatId]
    if (!chat) return ''
    if (chat.peerId) return state.users.entities[chat.peerId]?.name ?? ''
    return chat.title ?? ''
}

// Число участников группы или null: у direct, неизвестного чата и пока состав не загружен (members нет).
export const selectChatMembersCount = (state, chatId) => {
    const chat = state.chats.entities[chatId]
    if (!chat || chat.type !== 'group' || !chat.members) return null
    return chat.members.length
}

export default chatsSlice.reducer
