import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import {
    fetchSession,
    login as loginRequest,
    logout as logoutRequest,
    register as registerRequest,
} from '../services/authApi'
import { toFormError } from '../services/authFormError'

// loading — идёт проверка сессии (начальное), anonymous — сессии нет,
// authenticated — вошли, error — проверить сессию не удалось (сеть, 5xx, битый ответ),
// sessionClosed — сессию закрыли вне этой вкладки (401 unauthorized): как anonymous, но экран входа объясняет причину.
export const checkSession = createAsyncThunk(
    'auth/checkSession',
    (_, { signal }) => fetchSession({ signal })
)

// Вход и регистрация по паролю: user приходит в ответе. При ошибке статус не меняется (anonymous),
// а thunk отклоняется с payload — моделью ошибки формы (toFormError), по которой Login выбирает текст.
const submitCredentials = (type, request) =>
    createAsyncThunk(type, async (credentials, { rejectWithValue }) => {
        try {
            return await request(credentials)
        } catch (error) {
            return rejectWithValue(toFormError(error))
        }
    })

export const login = submitCredentials('auth/login', loginRequest)
export const register = submitCredentials('auth/register', registerRequest)

// Перечитывание сессии после 403 csrf_invalid (хук apiClient, подключает src/index.js). Результат — можно ли повторять исходный запрос:
// тот же пользователь → true (новый токен уже записан fetchSession); другой пользователь → userSwitched, false;
// сессии нет (401) → sessionClosed, false. Сбой перечитывания отклоняет thunk.
export const recoverCsrf = createAsyncThunk('auth/recoverCsrf', async (_, { dispatch, getState }) => {
    const user = await fetchSession()
    if (selectAuthStatus(getState()) !== 'authenticated') {
        return false
    }
    if (!user) {
        dispatch(sessionClosed())
        return false
    }
    if (user.id !== selectAuthUserId(getState())) {
        dispatch(userSwitched(user))
        return false
    }
    return true
})

const setAuthenticated = (state, action) => {
    state.user = action.payload
    state.status = 'authenticated'
}

// Выход: после успешного запроса корневой редьюсер (store.js) сбрасывает весь store,
// а auth переходит в anonymous. При ошибке состояние не меняется.
export const logout = createAsyncThunk('auth/logout', () => logoutRequest())

export const authSlice = createSlice({
    name: 'auth',
    initialState: { status: 'loading', user: null },
    reducers: {
        // Событие, а не сеттер: сервер ответил 401 unauthorized на запрос уже открытой сессии. Регистрирует хук src/index.js.
        // Имеет смысл только у вошедшего: в остальных статусах (выход, экран входа, загрузка) запоздавший 401 игнорируется.
        sessionClosed: (state) => {
            if (state.status !== 'authenticated') return
            state.user = null
            state.status = 'sessionClosed'
        },
        // Событие: после 403 csrf_invalid выяснилось, что в другой вкладке вошёл другой пользователь. Корневой редьюсер (store.js) сбрасывает остальные слайсы.
        // Как и sessionClosed, имеет смысл только у вошедшего: в остальных статусах запоздавшее событие игнорируется.
        userSwitched: (state, action) => {
            if (state.status !== 'authenticated') return
            state.user = action.payload
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(checkSession.pending, (state) => {
                state.status = 'loading'
            })
            .addCase(checkSession.fulfilled, (state, action) => {
                state.user = action.payload
                state.status = action.payload ? 'authenticated' : 'anonymous'
            })
            .addCase(checkSession.rejected, (state, action) => {
                if (action.meta.aborted) {
                    return
                }
                state.user = null
                state.status = 'error'
            })
            .addCase(login.fulfilled, setAuthenticated)
            .addCase(register.fulfilled, setAuthenticated)
            .addCase(logout.fulfilled, (state) => {
                state.user = null
                state.status = 'anonymous'
            })
    }
})

export const selectAuthStatus = (state) => state.auth.status
export const selectSessionClosed = (state) => state.auth.status === 'sessionClosed'
export const selectAuthUser = (state) => state.auth.user
export const selectAuthUserId = (state) => state.auth.user?.id

export const { sessionClosed, userSwitched } = authSlice.actions

export default authSlice.reducer
