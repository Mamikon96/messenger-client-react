import { createSlice } from '@reduxjs/toolkit'
import { createWsService } from '../services/wsService'
import { fetchChat, fetchMessages } from '../services/chatsApi'
import { fetchSession } from '../services/authApi'
import { getWsUrl } from '../services/wsUrl'
import { selectAuthStatus, selectAuthUserId, sessionClosed } from './auth'
import { chatReceived, chatUpdated, selectChatById, toChatFromDto } from './chats'
import { chatRemoved, messageAdded } from './messageEvents'
import { selectActiveChatId } from './activeChatId'
import { usersReceived } from './users'

// Статус WebSocket (FE-41): closed / connecting / open / reconnecting / displaced. Меняет только сервис через onStatus.
// Сброс store (выход, закрытая сессия) возвращает closed — сокет к этому моменту уже закрыт.
export const realtimeSlice = createSlice({
    name: 'realtime',
    initialState: { status: 'closed' },
    reducers: {
        realtimeStatusChanged: (state, action) => {
            state.status = action.payload
        },
    },
})

export const { realtimeStatusChanged } = realtimeSlice.actions

export const selectRealtimeStatus = (state) => state.realtime.status

const CATCH_UP_LIMIT = 100

// Сервис живёт вне store (сокет несериализуем) и один на приложение; thunks ниже — единственный способ им управлять.
// stopCurrent закрывает его и отменяет его запросы (GET чата, догонка): ответ прежнего владельца сессии store не меняет.
let service = null
let stopCurrent = null
// Чаты, удалённые событием chat.removed: опоздавшие кадры message.new не должны воскрешать их через GET чата.
let removedChatIds = new Set()
// Загрузка чата или догонка по chatId: параллельные кадры того же чата ждут одну операцию.
let pendingByChat = new Map()

const isObject = (value) => typeof value === 'object' && value !== null
const isString = (value) => typeof value === 'string' && value !== ''

const isValidMessage = (payload) =>
    isObject(payload) &&
    isString(payload.chatId) &&
    Number.isInteger(payload.seq) &&
    payload.seq > 0 &&
    isString(payload.senderId) &&
    typeof payload.body === 'string'

// Элементы members приходят извне: не объекты отбрасываем, чтобы они не роняли разбор.
const onlyObjects = (members) => members.filter(isObject)

const toUsers = (members) => members.map(({ userId, name, avatarUrl }) => ({ id: userId, name, avatarUrl }))

// Операция над чатом (загрузка, догонка) сериализуется по chatId. Ошибка сети глотается: результат — true/false.
const runForChat = (chatId, work) => {
    const promise = work()
        .then(() => true, () => false)
        .finally(() => {
            if (pendingByChat.get(chatId) === promise) pendingByChat.delete(chatId)
        })
    pendingByChat.set(chatId, promise)
    return promise
}

const hasMessage = (state, { chatId, seq }) => Boolean(state.messages[chatId]?.entities[seq])

const addMessage = (message) => (dispatch, getState) => {
    const state = getState()
    if (hasMessage(state, message)) return
    const mine = message.senderId === selectAuthUserId(state)
    dispatch(messageAdded(message, { unread: !mine && selectActiveChatId(state) !== message.chatId }))
}

const canContinue = (getState, chatId, signal) =>
    !signal.aborted && selectAuthStatus(getState()) === 'authenticated' && !removedChatIds.has(chatId)

const loadChat = (chatId, signal) => async (dispatch, getState) => {
    const dto = await fetchChat(chatId, { signal })
    if (!canContinue(getState, chatId, signal)) return
    dispatch(usersReceived(toUsers(dto.members)))
    dispatch(chatReceived(toChatFromDto(dto, selectAuthUserId(getState()))))
}

// Догонка пропущенных сообщений: since = последний известный seq, страницами по CATCH_UP_LIMIT.
const catchUp = (chatId, signal) => async (dispatch, getState) => {
    let since = selectChatById(getState(), chatId).lastSeq
    for (;;) {
        const page = await fetchMessages(chatId, { since, limit: CATCH_UP_LIMIT, signal })
        if (!canContinue(getState, chatId, signal)) return
        page.forEach((message) => dispatch(addMessage(message)))
        if (page.length < CATCH_UP_LIMIT) return
        since = page[page.length - 1].seq
    }
}

const handleMessageNew = (message, signal) => async (dispatch, getState) => {
    const { chatId } = message
    if (removedChatIds.has(chatId)) return
    while (pendingByChat.has(chatId)) await pendingByChat.get(chatId)
    if (!canContinue(getState, chatId, signal)) return
    if (!selectChatById(getState(), chatId)) {
        if (!(await runForChat(chatId, () => dispatch(loadChat(chatId, signal)))) || !canContinue(getState, chatId, signal)) return
    }
    if (message.seq > selectChatById(getState(), chatId).lastSeq + 1) {
        if (!(await runForChat(chatId, () => dispatch(catchUp(chatId, signal)))) || !canContinue(getState, chatId, signal)) return
    }
    dispatch(addMessage(message))
}

const handleFrame = ({ type, payload }, signal) => (dispatch, getState) => {
    if (!isObject(payload)) return
    switch (type) {
        case 'message.new':
            if (isValidMessage(payload)) dispatch(handleMessageNew(payload, signal))
            break
        case 'chat.created':
            if (!isString(payload.id) || !Array.isArray(payload.members)) return
            removedChatIds.delete(payload.id)
            dispatch(usersReceived(toUsers(onlyObjects(payload.members))))
            dispatch(chatReceived(toChatFromDto({ ...payload, members: onlyObjects(payload.members) }, selectAuthUserId(getState()))))
            break
        case 'chat.updated':
            if (!isString(payload.chatId)) return
            {
                const members = Array.isArray(payload.members) ? onlyObjects(payload.members) : undefined
                if (members) dispatch(usersReceived(toUsers(members)))
                dispatch(chatUpdated({ chatId: payload.chatId, title: typeof payload.title === 'string' ? payload.title : undefined, members }))
            }
            break
        case 'chat.removed':
            if (!isString(payload.chatId)) return
            removedChatIds.add(payload.chatId)
            dispatch(chatRemoved(payload.chatId))
            break
        default:
    }
}

// Запуск сокета при показе мессенджера; возвращает cleanup. Повторный запуск (StrictMode) закрывает прежний сервис.
export const startRealtime = () => (dispatch, getState) => {
    stopCurrent?.()
    removedChatIds = new Set()
    pendingByChat = new Map()
    const controller = new AbortController()
    const instance = createWsService({
        url: getWsUrl(),
        createSocket: (url) => new WebSocket(url),
        setTimer: (callback, ms) => setTimeout(callback, ms),
        clearTimer: (id) => clearTimeout(id),
        random: Math.random,
        checkSession: fetchSession,
        onStatus: (status) => dispatch(realtimeStatusChanged(status)),
        onSessionClosed: () => dispatch(sessionClosed()),
        onFrame: (frame) => {
            // Кадр после потери сессии не принимаем: store уже сброшен или будет сброшен.
            if (selectAuthStatus(getState()) !== 'authenticated') {
                stop()
                return
            }
            dispatch(handleFrame(frame, controller.signal))
        },
    })
    const stop = () => {
        controller.abort()
        instance.close()
    }
    service = instance
    stopCurrent = stop
    instance.connect()
    return () => {
        stop()
        if (service === instance) {
            service = null
            stopCurrent = null
        }
    }
}

// Пауза на время выхода: сокет закрывается до запроса logout, чтобы кадры не пришли в сбрасываемый store.
export const pauseRealtime = () => () => {
    service?.close()
}

// Возобновление: после неудачного выхода и по кнопке «Подключиться» при вытеснении (4008).
export const resumeRealtime = () => () => {
    service?.connect()
}

export default realtimeSlice.reducer
