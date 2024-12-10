import { createSlice, nanoid } from '@reduxjs/toolkit'

export const usersSlice = createSlice({
    name: "users",
    initialState: [],
    reducers: {
        addUser: (state, action) => {
            state.push({...action.payload, id: nanoid()})
        },
    }
})

export const { addUser } = usersSlice.actions

export default usersSlice.reducer