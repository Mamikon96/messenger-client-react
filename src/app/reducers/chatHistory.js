import { createAsyncThunk } from '@reduxjs/toolkit'
import { fetchChat, fetchMessages } from '../services/chatsApi'

// Размер страницы истории: последние сообщения при открытии чата и каждая подкачка старых (docs/client-integration.md, §3.9).
export const PAGE_SIZE = 50

// Лежит отдельно от слайсов, чтобы chats, users и messages обрабатывали загрузку истории без импорта друг друга.
// Состояние загрузки хранится в `history` самого чата (слайс chats); ответ устаревшего запроса отклоняется как 'stale'.
const chatHistory = (getState, chatId) => getState().chats.entities[chatId]?.history

// Загрузка серверного чата при открытии: карточка с участниками и последние PAGE_SIZE сообщений.
// Не грузит локальные чаты (из Join), неизвестные, уже загруженные и загружаемые; упавшую загрузку повторяет.
export const loadChatHistory = createAsyncThunk(
    'chats/loadChatHistory',
    async (chatId, { signal, requestId, getState, rejectWithValue }) => {
        const [chat, messages] = await Promise.all([
            fetchChat(chatId, { signal }),
            fetchMessages(chatId, { limit: PAGE_SIZE, signal }),
        ])
        // Store могли сбросить или запустить новую загрузку, пока шёл запрос: устаревший ответ не записывается.
        if (chatHistory(getState, chatId)?.requestId !== requestId) return rejectWithValue('stale')
        return { chat, messages, hasMore: messages.length >= PAGE_SIZE }
    },
    {
        condition: (chatId, { getState }) => {
            const chat = getState().chats.entities[chatId]
            if (!chat || chat.local) return false
            return !['loading', 'succeeded'].includes(chat.history?.status)
        },
    }
)

// Подкачка старых сообщений: `before` — минимальный загруженный seq. Конец истории — пришло меньше PAGE_SIZE.
export const fetchOlderMessages = createAsyncThunk(
    'chats/fetchOlderMessages',
    async ({ chatId, before }, { signal, requestId, getState, rejectWithValue }) => {
        const messages = await fetchMessages(chatId, { before, limit: PAGE_SIZE, signal })
        if (chatHistory(getState, chatId)?.olderRequestId !== requestId) return rejectWithValue('stale')
        return { messages, hasMore: messages.length >= PAGE_SIZE }
    },
    {
        condition: ({ chatId }, { getState }) => {
            const history = chatHistory(getState, chatId)
            return history?.status === 'succeeded' && history.hasMore && history.olderStatus !== 'loading'
        },
    }
)

// Подкачка старых для чата: before — минимальный загруженный seq (нет сообщений — подкачивать нечего).
export const loadOlderMessages = (chatId) => (dispatch, getState) => {
    const before = getState().messages[chatId]?.ids[0]
    if (before === undefined) return
    return dispatch(fetchOlderMessages({ chatId, before }))
}
