# @kallinen/thunk-utility

This library provides a clean strongly typed way to use Thunks with Redux Toolkit.

### Usage

```js

// thunks setup in the same file where reducers are set
const createThunks = createThunkFactory<TestConfig>()

// ui.slice.ts
import { createSlice } from '@reduxjs/toolkit'
import { createThunks } from './createThunks'

// Define thunks
export const thunks = createThunks({
    fetchUser: async (_: void, { getState, dispatch }) => {
        const state = getState()

        // Return payload
        return {
            id: 1,
            name: 'Alice',
        }
    },
}, 'ui')

// Define slice
const uiSlice = createSlice({
    name: 'ui',
    initialState: {
        user: null as { id: number; name: string } | null,
    },
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(thunks.fetchUser.fulfilled, (state, action) => {
                // action.payload is correctly typed
                state.user = action.payload
            })
    },
})

export const uiReducer = uiSlice.reducer

```