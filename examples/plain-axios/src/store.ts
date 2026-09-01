import { configureStore, createSlice } from '@reduxjs/toolkit'
import {
    axiosAdapter,
    createThunkFactory,
    sliceHelper,
} from '@kallinen/thunk-utility'
import { createApi, type User } from './api.js'

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

export const buildStore = (baseUrl: string) => {
    const api = createApi(baseUrl)

    // `client: 'axios'` on the Config is what switches the types over; `adapter: axiosAdapter` is
    // the runtime half. Declared once, here — no call site mentions axios again.
    const { createThunks, customApiThunkFor } = createThunkFactory<{
        state: RootState
        rejectValue: string
        client: 'axios'
    }>(
        {},
        {
            adapter: axiosAdapter,
            // `failure.data` is the error body the server sent — for this API, { detail }.
            reject: (failure) =>
                failure.status === 404
                    ? ((failure.data as { detail?: string })?.detail ??
                      'Not found')
                    : `Request failed (${failure.problem})`,
        }
    )

    // Plain axios functions carry no metadata, so arguments are mapped explicitly. In exchange
    // the dispatch argument is whatever you want it to be, independent of the request shape.
    const thunks = createThunks(
        {
            listUsers: customApiThunkFor(api.listUsers)({
                params: (arg: { team?: string } | void) => arg || {},
                select: (data) => data.users,
            }),
            getUser: customApiThunkFor(api.getUser)({
                params: (arg: number) => ({ id: arg }),
                select: (data) => data.user,
                condition: (_arg, { getState }) => !getState().users.fetching,
            }),
            createUser: customApiThunkFor(api.createUser)({
                params: (arg: { teamId: number; name: string; email: string }) => ({
                    teamId: arg.teamId,
                }),
                body: (arg) => ({ name: arg.name, email: arg.email }),
                select: (data) => data.user,
            }),
        },
        'users'
    )

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
