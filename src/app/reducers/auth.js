import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import {
    fetchSession,
    login as loginRequest,
    logout as logoutRequest,
    register as registerRequest,
} from '../services/authApi'
import { toFormError } from '../services/authFormError'

// loading — идёт проверка сессии (начальное), anonymous — сессии нет,
// authenticated — вошли, error — проверить сессию не удалось (сеть, 5xx, битый ответ).
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
    reducers: {},
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
export const selectAuthUser = (state) => state.auth.user

export default authSlice.reducer
