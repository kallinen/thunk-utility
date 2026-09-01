import { configureStore, createSlice } from '@reduxjs/toolkit'
import {
    axiosAdapter,
    type DefaultClient,
    createThunkFactory,
    defaultAdapter,
    sliceHelper,
} from '../src'

type User = { id: number; name: string }
type State = {
    user: string | null
    error: string | undefined
    fetching: boolean
}
const initialState: State = { user: null, error: undefined, fetching: false }

// What axios resolves with, and what it throws.
type AxiosResponse<T> = { data: T; status: number }
const axiosError = (status: number, body: unknown) =>
    Object.assign(new Error(`Request failed with status code ${status}`), {
        code: `ERR_BAD_REQUEST`,
        response: { status, data: body },
    })

const makeFactory = () =>
    createThunkFactory<{
        state: { a: State }
        rejectValue: string
        client: 'axios'
    }>({}, { adapter: axiosAdapter })

const makeStore = (thunks: Record<string, any>) => {
    const slice = createSlice({
        name: 'a',
        initialState,
        reducers: {},
        extraReducers: (builder) => {
            const helper = sliceHelper(builder, thunks as any)
            helper.forEach('pending', (s) => {
                s.fetching = true
            })
            helper.forEach('fulfilled', (s) => {
                s.fetching = false
            })
            helper.forEach('rejected', (s) => {
                s.fetching = false
            })
        },
    })
    return configureStore({ reducer: { a: slice.reducer } })
}

describe('axios adapter', () => {
    it('treats a resolved response as success and unwraps data', async () => {
        const get = jest.fn() as jest.Mock<
            Promise<AxiosResponse<{ user: User }>>
        >
        get.mockResolvedValue({
            data: { user: { id: 1, name: 'Ada' } },
            status: 200,
        })

        const f = makeFactory()
        const thunks = f.createThunks({
            getUser: f.customApiThunkFor(get)({
                params: (arg: { id: number }) => arg,
                select: (data) => data.user.name,
            }),
        })

        const store = makeStore(thunks)
        const result = await store.dispatch(thunks.getUser({ id: 1 }) as any)

        expect((result as any).payload).toBe('Ada')
        expect(store.getState().a.fetching).toBe(false)
    })

    it('turns a thrown AxiosError into a failure carrying status and error body', async () => {
        const get = jest.fn() as jest.Mock<
            Promise<AxiosResponse<{ user: User }>>
        >
        get.mockRejectedValue(axiosError(422, { detail: 'bad id' }))

        const f = makeFactory()
        const seen: any[] = []
        const thunks = f.createThunks({
            getUser: f.customApiThunkFor(get)({
                params: (arg: { id: number }) => arg,
                reject: (failure) => {
                    seen.push(failure)
                    return `${failure.status}`
                },
            }),
        })

        const store = makeStore(thunks)
        const result = await store.dispatch(thunks.getUser({ id: 1 }) as any)

        expect((result as any).payload).toBe('422')
        expect(seen[0]).toMatchObject({
            ok: false,
            status: 422,
            problem: 'ERR_BAD_REQUEST',
            data: { detail: 'bad id' },
        })
        expect(seen[0].originalError).toBeInstanceOf(Error)
    })

    it('reports status 0 when the request never got a response', async () => {
        const get = jest.fn() as jest.Mock<Promise<AxiosResponse<unknown>>>
        get.mockRejectedValue(
            Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })
        )

        const f = makeFactory()
        const thunks = f.createThunks({
            getUser: f.customApiThunkFor(get)({
                params: (arg: { id: number }) => arg,
                reject: (failure) => `${failure.problem}:${failure.status}`,
            }),
        })

        const store = makeStore(thunks)
        const result = await store.dispatch(thunks.getUser({ id: 1 }) as any)

        expect((result as any).payload).toBe('ERR_NETWORK:0')
    })

    it('leaves aborts as aborts', async () => {
        const get = jest.fn((_p: any, _b: any, config: any) => {
            return new Promise<AxiosResponse<unknown>>((_res, rej) => {
                config.signal.addEventListener('abort', () =>
                    rej(
                        Object.assign(new Error('canceled'), {
                            code: 'ERR_CANCELED',
                        })
                    )
                )
            })
        })

        const f = makeFactory()
        const thunks = f.createThunks({
            getUser: f.customApiThunkFor(get)({
                params: (arg: { id: number }) => arg,
            }),
        })

        const store = makeStore(thunks)
        const promise = store.dispatch(thunks.getUser({ id: 1 }) as any)
        promise.abort()
        const result: any = await promise

        expect(result.meta.aborted).toBe(true)
        expect(result.payload).toBeUndefined()
    })

    it('warns when an axios-shaped response meets the default adapter', async () => {
        const warn = jest.fn()
        const get = jest.fn().mockResolvedValue({ data: 'x', status: 200 })
        const f = createThunkFactory<{ state: { a: State } }>(
            {},
            { onWarning: warn }
        )
        const thunks = f.createThunks({
            getUser: f.customApiThunkFor(get)({ params: (arg: void) => arg }),
        })

        const store = makeStore(thunks)
        await store.dispatch(thunks.getUser(undefined as any) as any)

        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('looks like an axios response')
        )
    })
})

// ─── Compile-time assertions ───

declare const axiosGet: (
    params: { id: number },
    body?: undefined,
    config?: { signal?: AbortSignal }
) => Promise<AxiosResponse<{ user: User }>>

function _typeChecks() {
    const f = createThunkFactory<{
        state: { a: State }
        rejectValue: string
        client: 'axios'
    }>({}, { adapter: axiosAdapter })

    const thunks = f.createThunks({
        getUser: f.customApiThunkFor(axiosGet)({
            params: (arg: { id: number }) => arg,
            // `data` is AxiosResponse['data'], not the whole envelope
            select: (data) => data.user.name,
            // failure is the normalized AxiosFailure
            reject: (failure) => `${failure.status}:${String(failure.data)}`,
        }),
    })
    const _payload: string = thunks.getUser.fulfilled({} as any, '', {
        id: 1,
    }).payload
    void _payload

    // @ts-expect-error — a Config declaring client: 'axios' must supply the adapter
    createThunkFactory<{ state: { a: State }; client: 'axios' }>({}, {})

    // Known gap: omitting the options object entirely can't be caught by the type (the parameter
    // has a default), so the mismatch surfaces at runtime as the axios-shape warning instead.
    createThunkFactory<{ state: { a: State }; client: 'axios' }>({})

    // A misspelled kind is caught right here, not as an `unknown` at a later `select`.
    // @ts-expect-error — 'axois' is not a ClientKind
    createThunkFactory<{ state: { a: State }; client: 'axois' }>(
        {},
        { adapter: axiosAdapter }
    )

    // The default kind still resolves to the `{ ok, data }` contract, spelled either way.
    const rf = createThunkFactory<{ state: { a: State } }>(
        {},
        { adapter: defaultAdapter }
    )
    const rf2 = createThunkFactory<{
        state: { a: State }
        client: DefaultClient
    }>({})
    void [rf, rf2]
}
void _typeChecks

describe('axios adapter (types)', () => {
    it('type-level assertions compile', () => {
        expect(true).toBe(true)
    })
})
