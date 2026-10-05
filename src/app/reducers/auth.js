import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { fetchSession } from '../services/authApi'

// loading — идёт проверка сессии (начальное), anonymous — сессии нет,
// authenticated — вошли, error — проверить сессию не удалось (сеть, 5xx, битый ответ).
export const checkSession = createAsyncThunk(
    'auth/checkSession',
    (_, { signal }) => fetchSession({ signal })
)

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
    }
})

export default authSlice.reducer
