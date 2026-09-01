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

describe('thunk options — declared next to select/reject', () => {
    it('applies a condition that blocks dispatch', async () => {
        const apiFn = jest.fn().mockResolvedValue({ ok: true, data: 'ok' })
        const factory = createThunkFactory<{ state: TestState }>({})

        const thunks = factory.createThunks({
            getValue: factory.apiThunkFor(apiFn)({
                condition: (_arg, { getState }) => !getState().fetching,
            }),
        })

        const store = makeStore(thunks, { fetching: true, value: null })
        const result = await store.dispatch(
            thunks.getValue(undefined as any) as any
        )

        expect(apiFn).not.toHaveBeenCalled()
        expect((result as any).meta.condition).toBe(true)
    })

    it('runs the thunk when the condition passes, keeping select', async () => {
        const apiFn = jest.fn() as jest.Mock<
            Promise<ApiResponse<{ name: string }>>
        >
        apiFn.mockResolvedValue({ ok: true, data: { name: 'Ada' } })
        const factory = createThunkFactory<{ state: TestState }>({})

        const thunks = factory.createThunks({
            getValue: factory.apiThunkFor(apiFn)({
                select: (data) => data.name,
                condition: (_arg, { getState }) => !getState().fetching,
            }),
        })

        const store = makeStore(thunks, { fetching: false, value: null })
        const result = await store.dispatch(
            thunks.getValue(undefined as any) as any
        )

        expect(apiFn).toHaveBeenCalledTimes(1)
        expect((result as any).payload).toBe('Ada')
    })

    it('honours a custom idGenerator', async () => {
        const apiFn = jest.fn().mockResolvedValue({ ok: true, data: 'ok' })
        const factory = createThunkFactory<{ state: TestState }>({})

        const thunks = factory.createThunks(
            {
                getValue: factory.apiThunkFor(apiFn)({
                    idGenerator: () => 'fixed-id',
                }),
            },
            'test'
        )

        const store = makeStore(thunks, { fetching: false, value: null })
        const result = await store.dispatch(
            thunks.getValue(undefined as any) as any
        )

        expect((result as any).meta.requestId).toBe('fixed-id')
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

        const thunks = factory.createThunks({
            getA: factory.apiThunkFor(a)(),
            getB: factory.apiThunkFor(b)({ condition: () => true }),
        })

        const store = makeStore(thunks, { fetching: false, value: null })
        await store.dispatch(thunks.getA(undefined as any) as any)
        await store.dispatch(thunks.getB(undefined as any) as any)

        expect(a).not.toHaveBeenCalled()
        expect(b).toHaveBeenCalledTimes(1)
    })

    it('merges factory and per-thunk options key by key', async () => {
        const apiFn = jest.fn().mockResolvedValue({ ok: true, data: 'ok' })
        const factory = createThunkFactory<{ state: TestState }>(
            {},
            { thunkOptions: { idGenerator: () => 'from-factory' } }
        )

        const thunks = factory.createThunks({
            getValue: factory.apiThunkFor(apiFn)({ condition: () => true }),
        })

        const store = makeStore(thunks, { fetching: false, value: null })
        const result = await store.dispatch(
            thunks.getValue(undefined as any) as any
        )

        expect((result as any).meta.requestId).toBe('from-factory')
        expect(apiFn).toHaveBeenCalledTimes(1)
    })

    it('works on customApiThunkFor too', async () => {
        const apiFn = jest.fn().mockResolvedValue({ ok: true, data: 'ok' })
        const factory = createThunkFactory<{ state: TestState }>({})

        const thunks = factory.createThunks({
            getValue: factory.customApiThunkFor(apiFn)({
                params: (arg: { id: number }) => ({ id: arg.id }),
                condition: (_arg, { getState }) => !getState().fetching,
            }),
        })

        const store = makeStore(thunks, { fetching: true, value: null })
        await store.dispatch(thunks.getValue({ id: 1 }) as any)

        expect(apiFn).not.toHaveBeenCalled()
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

    it('does not leak the options key into the payload creator as an own enumerable prop', () => {
        const apiFn = jest.fn().mockResolvedValue({ ok: true, data: 'ok' })
        const factory = createThunkFactory<{ state: TestState }>({})
        const creator = factory.apiThunkFor(apiFn)({ condition: () => true })

        expect(Object.keys(creator)).toEqual([])
        expect(typeof creator).toBe('function')
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
    // `arg` is the thunk's own arg type, `getState()` the factory Config state, and `select`
    // still types `data` and the resulting payload.
    const creator = typedFactory.apiThunkFor(api)({
        select: (data) => data.length,
        condition: (arg, { getState }) => {
            const _id: { id: number } | number | undefined = arg
            void _id
            return !getState().fetching
        },
    })
    const thunks = typedFactory.createThunks({ getOne: creator }, 'ns')
    const _payload: number = thunks.getOne.fulfilled({} as any, '', 0).payload
    void _payload

    typedFactory.apiThunkFor(api)({
        // @ts-expect-error — not a valid createAsyncThunk option
        notAnOption: true,
    })

    // @ts-expect-error — not a valid createAsyncThunk option
    typedFactory.customApiThunkFor(api)({
        params: (arg: { id: number }) => arg,
        notAnOption: true,
    })

    typedFactory.createThunks(
        { getOne: creator },
        'ns',
        // @ts-expect-error — createThunks no longer takes a per-thunk options map
        { getOne: { condition: () => true } }
    )
}
void _typeChecks

describe('thunk options (types)', () => {
    it('type-level assertions compile', () => {
        expect(true).toBe(true)
    })
})
