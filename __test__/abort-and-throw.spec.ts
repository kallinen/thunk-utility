import { configureStore, createSlice } from '@reduxjs/toolkit'
import { createThunkFactory } from '../src'

type TestState = { value: string | null; error: any }

const makeStore = (thunks: Record<string, any>) => {
    const slice = createSlice({
        name: 'test',
        initialState: { value: null, error: null } as TestState,
        reducers: {},
        extraReducers: (builder) => {
            Object.values(thunks).forEach((t) => {
                builder.addCase(t.rejected, (s, a: any) => {
                    s.error = a.payload
                })
            })
        },
    })
    return configureStore({ reducer: slice.reducer })
}

describe('AbortSignal forwarding', () => {
    it('passes the thunk signal to the api function', async () => {
        const apiFn = jest.fn().mockResolvedValue({ ok: true, data: 'ok' })
        Object.defineProperty(apiFn, '__meta', { value: { key: 'op' } })

        const factory = createThunkFactory<{ state: TestState }>({
            op: { paramsKeys: ['id'], queryKeys: [], bodyKeys: [] },
        })
        const thunks = factory.createThunks({ get: factory.apiThunkFor(apiFn)() })
        const store = makeStore(thunks)

        await store.dispatch(thunks.get(1 as any) as any)

        const config = apiFn.mock.calls[0][2]
        expect(config.signal).toBeInstanceOf(AbortSignal)
        expect(config.signal.aborted).toBe(false)
    })

    it('the forwarded signal aborts when the thunk is aborted', async () => {
        let seen: AbortSignal | undefined
        const apiFn = jest.fn().mockImplementation(
            (_p: any, _d: any, config: any) =>
                new Promise((resolve) => {
                    seen = config.signal
                    config.signal.addEventListener('abort', () =>
                        resolve({ ok: false, problem: 'CANCEL_ERROR' })
                    )
                })
        )

        const factory = createThunkFactory<{ state: TestState }>({})
        const thunks = factory.createThunks({ get: factory.apiThunkFor(apiFn)() })
        const store = makeStore(thunks)

        const promise = store.dispatch(thunks.get(undefined as any) as any)
        expect(seen!.aborted).toBe(false)
        promise.abort()
        await promise

        expect(seen!.aborted).toBe(true)
    })

    it('customApiThunkFor forwards the signal, and an explicit config wins', async () => {
        const apiFn = jest.fn().mockResolvedValue({ ok: true, data: 'ok' })
        const factory = createThunkFactory<{ state: TestState }>({})

        const thunks = factory.createThunks({
            withDefault: factory.customApiThunkFor(apiFn)<void>({}),
            withConfig: factory.customApiThunkFor(apiFn)<void>({
                config: () => ({ headers: { 'X-Test': '1' } }) as any,
            }),
            overriding: factory.customApiThunkFor(apiFn)<void>({
                config: () => ({ signal: undefined }) as any,
            }),
        })
        const store = makeStore(thunks)

        await store.dispatch(thunks.withDefault() as any)
        expect(apiFn.mock.calls[0][2].signal).toBeInstanceOf(AbortSignal)

        await store.dispatch(thunks.withConfig() as any)
        expect(apiFn.mock.calls[1][2].signal).toBeInstanceOf(AbortSignal)
        expect(apiFn.mock.calls[1][2].headers).toEqual({ 'X-Test': '1' })

        await store.dispatch(thunks.overriding() as any)
        expect(apiFn.mock.calls[2][2].signal).toBeUndefined()
    })
})

describe('thrown errors are routed through reject', () => {
    it('applies the factory default reject to a thrown error', async () => {
        const apiFn = jest.fn().mockRejectedValue(new Error('boom'))
        const factory = createThunkFactory<
            { state: TestState; rejectValue: string },
            { problem: string; originalError: unknown; status: number }
        >({}, { reject: (f) => `${f.problem}:${(f.originalError as Error).message}` })

        const thunks = factory.createThunks({ get: factory.apiThunkFor(apiFn)() })
        const store = makeStore(thunks)

        const result: any = await store.dispatch(thunks.get(undefined as any) as any)

        expect(result.type).toBe('get/rejected')
        expect(result.payload).toBe('UNKNOWN_ERROR:boom')
        expect(store.getState().error).toBe('UNKNOWN_ERROR:boom')
    })

    it('applies a per-thunk reject to a thrown error', async () => {
        const apiFn = jest.fn().mockRejectedValue(new Error('nope'))
        const factory = createThunkFactory<{ state: TestState }>({})

        const thunks = factory.createThunks({
            get: factory.apiThunkFor(apiFn)({
                reject: (f: any) => ({ status: f.status, problem: f.problem }),
            }),
        })
        const store = makeStore(thunks)

        const result: any = await store.dispatch(thunks.get(undefined as any) as any)

        expect(result.payload).toEqual({ status: 0, problem: 'UNKNOWN_ERROR' })
    })

    it('falls back to the problem code when no reject is configured', async () => {
        const apiFn = jest.fn().mockRejectedValue(new Error('bare'))
        const factory = createThunkFactory<{ state: TestState }>({})
        const thunks = factory.createThunks({ get: factory.apiThunkFor(apiFn)() })
        const store = makeStore(thunks)

        const result: any = await store.dispatch(thunks.get(undefined as any) as any)

        expect(result.payload).toBe('UNKNOWN_ERROR')
    })

    it('routes throws from customApiThunkFor too', async () => {
        const apiFn = jest.fn().mockRejectedValue(new Error('custom boom'))
        const factory = createThunkFactory<{ state: TestState }>({})

        const thunks = factory.createThunks({
            get: factory.customApiThunkFor(apiFn)<void>({
                reject: (f: any) => f.problem,
            }),
        })
        const store = makeStore(thunks)

        const result: any = await store.dispatch(thunks.get() as any)

        expect(result.payload).toBe('UNKNOWN_ERROR')
    })

    it('does not swallow an abort — it stays an abort, not a reject value', async () => {
        const factory = createThunkFactory<{ state: TestState }>({})
        const apiFn = jest.fn().mockImplementation(
            (_p: any, _d: any, config: any) =>
                new Promise((_resolve, rejectPromise) => {
                    config.signal.addEventListener('abort', () =>
                        rejectPromise(new Error('aborted by transport'))
                    )
                })
        )

        const thunks = factory.createThunks({
            get: factory.apiThunkFor(apiFn)({ reject: () => 'MAPPED' }),
        })
        const store = makeStore(thunks)

        const promise = store.dispatch(thunks.get(undefined as any) as any)
        promise.abort()
        const result: any = await promise

        expect(result.meta.aborted).toBe(true)
        expect(result.payload).toBeUndefined()
    })
})

describe('onWarning', () => {
    const makeUnknownKeyThunk = (onWarning?: any) => {
        const apiFn = jest.fn().mockResolvedValue({ ok: true, data: 'ok' })
        Object.defineProperty(apiFn, '__meta', { value: { key: 'op' } })
        const factory = createThunkFactory<{ state: TestState }>(
            { op: { paramsKeys: ['id'], queryKeys: [], bodyKeys: [] } },
            onWarning === undefined ? {} : { onWarning }
        )
        return factory.apiThunkFor(apiFn)()
    }

    const run = (thunk: any, arg: any) =>
        thunk(arg, {
            rejectWithValue: jest.fn(),
            getState: () => ({}),
            signal: new AbortController().signal,
        })

    it('defaults to console.warn', async () => {
        const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
        await run(makeUnknownKeyThunk(), { id: 1, bogus: 2 })

        expect(spy).toHaveBeenCalledWith(
            '[apiThunkFor]: Unknown key "bogus" passed to op'
        )
        spy.mockRestore()
    })

    it('routes warnings to a custom logger', async () => {
        const onWarning = jest.fn()
        await run(makeUnknownKeyThunk(onWarning), { id: 1, bogus: 2 })

        expect(onWarning).toHaveBeenCalledWith(
            '[apiThunkFor]: Unknown key "bogus" passed to op'
        )
    })

    it('is silenced by onWarning: false', async () => {
        const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
        await run(makeUnknownKeyThunk(false), { id: 1, bogus: 2 })

        expect(spy).not.toHaveBeenCalled()
        spy.mockRestore()
    })

    it('reports missing metadata once instead of per key', async () => {
        const onWarning = jest.fn()
        const apiFn = jest.fn().mockResolvedValue({ ok: true, data: 'ok' })
        const factory = createThunkFactory<{ state: TestState }>({}, { onWarning })

        await run(factory.apiThunkFor(apiFn)(), { a: 1, b: 2, c: 3 })

        expect(onWarning).toHaveBeenCalledTimes(1)
        expect(onWarning).toHaveBeenCalledWith(
            '[apiThunkFor]: No api metadata for this operation; arguments were dropped.'
        )
    })

    it('names the operation when metadata is missing for a known key', async () => {
        const onWarning = jest.fn()
        const apiFn = jest.fn().mockResolvedValue({ ok: true, data: 'ok' })
        Object.defineProperty(apiFn, '__meta', { value: { key: 'missingOp' } })
        const factory = createThunkFactory<{ state: TestState }>({}, { onWarning })

        await run(factory.apiThunkFor(apiFn)(), { a: 1 })

        expect(onWarning).toHaveBeenCalledWith(
            '[apiThunkFor]: No api metadata for "missingOp"; arguments were dropped.'
        )
    })

    it('says nothing when every key is routed', async () => {
        const onWarning = jest.fn()
        await run(makeUnknownKeyThunk(onWarning), { id: 1 })

        expect(onWarning).not.toHaveBeenCalled()
    })
})
