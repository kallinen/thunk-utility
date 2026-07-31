import { configureStore, createSlice } from '@reduxjs/toolkit'
import { createThunkFactory } from '../src'

type ApiResponse<R> = { ok: true; data: R } | { ok: false; problem: any }

type TestState = { fetching: boolean; value: string | null }

const makeStore = (thunks: Record<string, any>, initial: TestState) => {
    const slice = createSlice({
        name: 'test',
        initialState: initial,
        reducers: {},
        extraReducers: (builder) => {
            Object.values(thunks).forEach((t) => {
                builder.addCase(t.pending, (s) => {
                    s.fetching = true
                })
                builder.addCase(t.fulfilled, (s) => {
                    s.fetching = false
                })
            })
        },
    })
    return configureStore({ reducer: slice.reducer })
}

describe('createThunks — per-thunk createAsyncThunk options', () => {
    it('applies a per-thunk condition that blocks dispatch', async () => {
        const apiFn = jest.fn().mockResolvedValue({ ok: true, data: 'ok' })
        const factory = createThunkFactory<{ state: TestState }>({})

        const thunks = factory.createThunks(
            { getValue: factory.apiThunkFor(apiFn)() },
            'test',
            {
                getValue: {
                    condition: (_arg, { getState }) => !getState().fetching,
                },
            }
        )

        const store = makeStore(thunks, { fetching: true, value: null })
        const result = await store.dispatch(thunks.getValue(undefined as any) as any)

        expect(apiFn).not.toHaveBeenCalled()
        expect((result as any).meta.condition).toBe(true)
    })

    it('runs the thunk when the condition passes', async () => {
        const apiFn = jest.fn().mockResolvedValue({ ok: true, data: 'ok' })
        const factory = createThunkFactory<{ state: TestState }>({})

        const thunks = factory.createThunks(
            { getValue: factory.apiThunkFor(apiFn)() },
            'test',
            {
                getValue: {
                    condition: (_arg, { getState }) => !getState().fetching,
                },
            }
        )

        const store = makeStore(thunks, { fetching: false, value: null })
        await store.dispatch(thunks.getValue(undefined as any) as any)

        expect(apiFn).toHaveBeenCalledTimes(1)
    })

    it('applies a factory-wide default to every thunk', async () => {
        const a = jest.fn().mockResolvedValue({ ok: true, data: 'a' })
        const b = jest.fn().mockResolvedValue({ ok: true, data: 'b' })
        const factory = createThunkFactory<{ state: TestState }>(
            {},
            { thunkOptions: { condition: () => false } }
        )

        const thunks = factory.createThunks({
            getA: factory.apiThunkFor(a)(),
            getB: factory.apiThunkFor(b)(),
        })

        const store = makeStore(thunks, { fetching: false, value: null })
        await store.dispatch(thunks.getA(undefined as any) as any)
        await store.dispatch(thunks.getB(undefined as any) as any)

        expect(a).not.toHaveBeenCalled()
        expect(b).not.toHaveBeenCalled()
    })

    it('lets a per-thunk option override the factory default', async () => {
        const a = jest.fn().mockResolvedValue({ ok: true, data: 'a' })
        const b = jest.fn().mockResolvedValue({ ok: true, data: 'b' })
        const factory = createThunkFactory<{ state: TestState }>(
            {},
            { thunkOptions: { condition: () => false } }
        )

        const thunks = factory.createThunks(
            {
                getA: factory.apiThunkFor(a)(),
                getB: factory.apiThunkFor(b)(),
            },
            undefined,
            { getB: { condition: () => true } }
        )

        const store = makeStore(thunks, { fetching: false, value: null })
        await store.dispatch(thunks.getA(undefined as any) as any)
        await store.dispatch(thunks.getB(undefined as any) as any)

        expect(a).not.toHaveBeenCalled()
        expect(b).toHaveBeenCalledTimes(1)
    })

    it('honours a custom idGenerator', async () => {
        const apiFn = jest.fn().mockResolvedValue({ ok: true, data: 'ok' })
        const factory = createThunkFactory<{ state: TestState }>({})

        const thunks = factory.createThunks(
            { getValue: factory.apiThunkFor(apiFn)() },
            'test',
            { getValue: { idGenerator: () => 'fixed-id' } }
        )

        const store = makeStore(thunks, { fetching: false, value: null })
        const result = await store.dispatch(thunks.getValue(undefined as any) as any)

        expect((result as any).meta.requestId).toBe('fixed-id')
    })

    it('still works when no options are given at all', async () => {
        const apiFn = jest.fn().mockResolvedValue({ ok: true, data: 'ok' })
        const factory = createThunkFactory<{ state: TestState }>({})
        const thunks = factory.createThunks({
            getValue: factory.apiThunkFor(apiFn)(),
        })

        const store = makeStore(thunks, { fetching: false, value: null })
        await store.dispatch(thunks.getValue(undefined as any) as any)

        expect(apiFn).toHaveBeenCalledTimes(1)
    })
})

// ─── Compile-time assertions ───

const api = (
    _p?: { id: number } | number,
    _d?: undefined,
    _c?: any
): Promise<ApiResponse<string>> => Promise.resolve({ ok: true, data: 'x' })

const typedFactory = createThunkFactory<{
    state: { fetching: boolean }
    rejectValue: string
}>()

function _typeChecks() {
    typedFactory.createThunks(
        { getOne: typedFactory.apiThunkFor(api)() },
        'ns',
        {
            getOne: {
                // `arg` is the thunk's own arg type, `getState()` the factory Config state
                condition: (arg, { getState }) => {
                    const _id: { id: number } | number | undefined = arg
                    void _id
                    return !getState().fetching
                },
            },
        }
    )

    typedFactory.createThunks({ getOne: typedFactory.apiThunkFor(api)() }, 'ns', {
        // @ts-expect-error — not a thunk in the map
        nope: { condition: () => true },
    })

    typedFactory.createThunks({ getOne: typedFactory.apiThunkFor(api)() }, 'ns', {
        // @ts-expect-error — not a valid createAsyncThunk option
        getOne: { notAnOption: true },
    })
}
void _typeChecks

describe('createThunks options (types)', () => {
    it('type-level assertions compile', () => {
        expect(true).toBe(true)
    })
})
