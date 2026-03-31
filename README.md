# @kallinen/thunk-utility

A strongly typed utility library for creating and using Redux Toolkit thunks with minimal boilerplate.
Designed to work especially well with @kallinen/openapi-axios-client.

The library helps you:

- Create typed thunks easily
- Automatically infer payload types
- Map thunk results to slice state with minimal reducer code

### Installation

```bash
npm install @kallinen/thunk-utility
```

### Usage

```js

// store.ts
export type ThunkState = {
    state: RootState
    dispatch: AppDispatch
}

// my-reducer.slice.ts
import { createSlice } from '@reduxjs/toolkit'
import { createThunkFactory } from '@kallinen/thunk-utility'
import type { ThunkState } from './store'

// thunk setup along with reducer
const { createThunks, apiThunkFor, customApiThunkFor } = createThunkFactory<ThunkState>()

// Define thunks
export const thunks = createThunks({
    // generate simple thunks from API
    simpleThunk: apiThunkFor(api.hello)({
        body: (params) => ({ platform: params.platform }),
    }),
    customThunk: customApiThunkFor(api.hello)<{ customParam: string }>({
        body: ({ customParam }, state) => ({ platform: state.myReducer.platform, customParam })
    })
    fetchUser: async (_: void, { getState, dispatch }) => {
        const state = getState()

        // Return payload
        return {
            id: 1,
            name: 'Alice',
        }
    },
}, 'my')

// Define slice
const mySlice = createSlice({
    name: 'my',
    initialState: {
        user: null as { id: number; name: string } | null,
        hello: null as HelloDto | null
    },
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(thunks.fetchUser.fulfilled, (state, action) => {
                // action.payload is correctly typed
                state.user = action.payload
            })

        // Or use slice helper to map thunks to state
         const helper = sliceHelper(builder, thunks)
        helper.mapThunksToState('fulfilled', {
            fetchUser: 'user',
            simpleThunk: 'hello',
            customThunk: 'hello',
        })
    },
})

export const myReducer = mySlice.reducer

```