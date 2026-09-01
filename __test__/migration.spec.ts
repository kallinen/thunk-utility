import { configureStore, createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { createThunkFactory, sliceHelper } from '../src'

type State = { user: string | null; legacy: string | null; fetching: boolean }
const initialState: State = { user: null, legacy: null, fetching: false }

type ApiResponse<R> = { ok: true; data: R } | { ok: false; problem: any }
const api = jest.fn() as jest.Mock<Promise<ApiResponse<string>>>
api.mockResolvedValue({ ok: true, data: 'new' })

const f = createThunkFactory<{ state: { mix: State } }>({})
const thunks = f.createThunks({ getUser: f.apiThunkFor(api)() }, 'mix')

// A pre-existing hand-written thunk, untouched by the migration.
const legacyThunk = createAsyncThunk('mix/legacy', async () => 'legacy')

describe('adding thunk-utility to an existing slice', () => {
    it('coexists with hand-written thunks and existing addCase calls', async () => {
        const slice = createSlice({
            name: 'mix',
            initialState,
            reducers: {},
            extraReducers: (builder) => {
                builder.addCase(legacyThunk.fulfilled, (s, a) => {
                    s.legacy = a.payload
                })
                const helper = sliceHelper(builder, thunks)
                helper.mapThunksToState('fulfilled', { getUser: 'user' })
                helper.forEach('pending', (s) => {
                    s.fetching = true
                })
                helper.forEach('fulfilled', (s) => {
                    s.fetching = false
                })
            },
        })
        const store = configureStore({ reducer: { mix: slice.reducer } })
        await store.dispatch(legacyThunk() as any)
        await store.dispatch(thunks.getUser(undefined as any) as any)
        expect(store.getState().mix).toEqual({
            user: 'new',
            legacy: 'legacy',
            fetching: false,
        })
    })

    // RTK forbids addCase after addMatcher; sliceHelper registers around that, so the two
    // methods work in either order and produce the same reducers.
    it.each([
        ['mapThunksToState first', 'map-first'],
        ['forEach first', 'foreach-first'],
    ])('works with %s', async (_label, order) => {
        const slice = createSlice({
            name: 'mix',
            initialState,
            reducers: {},
            extraReducers: (builder) => {
                const helper = sliceHelper(builder, thunks)
                const mapFirst = () =>
                    helper.mapThunksToState('fulfilled', { getUser: 'user' })
                const forEachFirst = () => {
                    helper.forEach('pending', (s) => {
                        s.fetching = true
                    })
                    helper.forEach('fulfilled', (s) => {
                        s.fetching = false
                    })
                }
                if (order === 'map-first') {
                    mapFirst()
                    forEachFirst()
                } else {
                    forEachFirst()
                    mapFirst()
                }
            },
        })

        const store = configureStore({ reducer: { mix: slice.reducer } })
        const promise = store.dispatch(thunks.getUser(undefined as any) as any)
        expect(store.getState().mix.fetching).toBe(true)
        await promise

        expect(store.getState().mix.user).toBe('new')
        expect(store.getState().mix.fetching).toBe(false)
    })

    it('still lands rejected payloads when forEach ran first', async () => {
        type ErrState = { error: string | undefined; fetching: boolean }
        const rejecting = jest.fn() as jest.Mock<Promise<ApiResponse<string>>>
        rejecting.mockResolvedValue({ ok: false, problem: 'NOPE' })
        const errFactory = createThunkFactory<{
            state: { mix: ErrState }
            rejectValue: string
        }>({})
        const errThunks = errFactory.createThunks(
            {
                getUser: errFactory.apiThunkFor(rejecting)({
                    reject: (failure) => failure.problem as string,
                }),
            },
            'err'
        )

        const slice = createSlice({
            name: 'mix',
            initialState: { error: undefined, fetching: false } as ErrState,
            reducers: {},
            extraReducers: (builder) => {
                const helper = sliceHelper(builder, errThunks)
                helper.forEach('rejected', (s) => {
                    s.fetching = false
                })
                helper.mapThunksToState('rejected', { getUser: 'error' })
            },
        })

        const store = configureStore({ reducer: { mix: slice.reducer } })
        await store.dispatch(errThunks.getUser(undefined as any) as any)

        expect(store.getState().mix.error).toBe('NOPE')
        expect(store.getState().mix.fetching).toBe(false)
    })
})
