import { configureStore, createSlice } from '@reduxjs/toolkit'
import { createThunkFactory, sliceHelper } from '@kallinen/thunk-utility'
import { createTypedApi } from '@kallinen/openapi-axios-client'
import spec from '../openapi.json' with { type: 'json' }
import {
    apiMetadata,
    type Components,
    type OperationMethods,
    type PathsDictionary,
} from './generated/api-types.js'

type User = Components.Schemas.User

export type UsersState = {
    users: User[]
    current: User | null
    error: string | undefined
    fetching: boolean
}

const initialState: UsersState = {
    users: [],
    current: null,
    error: undefined,
    fetching: false,
}

export type RootState = { users: UsersState }

/** What every thunk in this app rejects with. */
export type AppError = string

export const buildStore = (baseUrl: string) => {
    // 1. The generated client. Every method carries the metadata thunk-utility reads.
    const api = createTypedApi<OperationMethods, PathsDictionary>(spec, {
        url: baseUrl,
    })

    // 2. One factory for the whole app: the api metadata, plus a default failure mapping so no
    //    thunk has to spell out its own.
    const { createThunks, apiThunkFor } = createThunkFactory<{
        state: RootState
        rejectValue: AppError
    }>(apiMetadata, {
        reject: (failure) =>
            failure.status === 404
                ? 'Not found'
                : `Request failed (${failure.problem})`,
    })

    // 3. The thunks. No payload types, no argument types, no try/catch — the generated client
    //    already knows all of it. `select` is the only thing worth saying out loud.
    const thunks = createThunks(
        {
            listUsers: apiThunkFor(api.listUsers)({
                select: (data) => data.users,
            }),
            getUser: apiThunkFor(api.getUser)({
                select: (data) => data.user,
                // Skip the dispatch entirely while a request is already in flight.
                condition: (_arg, { getState }) => !getState().users.fetching,
            }),
            createUser: apiThunkFor(api.createUser)({
                select: (data) => data.user,
            }),
        },
        'users'
    )

    // 4. The slice. `mapThunksToState` type-checks each payload against the field it lands in;
    //    `forEach` runs one reducer across every thunk.
    const slice = createSlice({
        name: 'users',
        initialState,
        reducers: {},
        extraReducers: (builder) => {
            const helper = sliceHelper(builder, thunks)
            helper.mapThunksToState('fulfilled', {
                listUsers: 'users',
                getUser: 'current',
                createUser: 'current',
            })
            helper.mapThunksToState('rejected', { getUser: 'error' })
            helper.forEach('pending', (s) => {
                s.fetching = true
                s.error = undefined
            })
            helper.forEach('fulfilled', (s) => {
                s.fetching = false
            })
            helper.forEach('rejected', (s) => {
                s.fetching = false
            })
        },
    })

    const store = configureStore({ reducer: { users: slice.reducer } })
    return { store, thunks }
}
