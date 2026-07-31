import {
    configureStore,
    createSlice,
    type ActionReducerMapBuilder,
} from '@reduxjs/toolkit'
import { createThunkFactory, sliceHelper } from '../src'

type ApiResponse<R> = { ok: true; data: R } | { ok: false; problem: any }

type ListResponse = { items: number[]; total: number }

describe('apiThunkFor — select projection (runtime)', () => {
    type State = {
        fetching: boolean
        items: number[]
        full: ListResponse | null
    }
    const initialState: State = { fetching: false, items: [], full: null }

    const listApi = jest.fn() as jest.Mock<Promise<ApiResponse<ListResponse>>>

    const { createThunks, apiThunkFor } = createThunkFactory<{
        state: State
        rejectValue: string
    }>()

    // `getItems` projects to the array; `getFull` keeps the whole body (identity default).
    const thunks = createThunks({
        getFull: apiThunkFor(listApi)(),
        getItems: apiThunkFor(listApi)({ select: (d) => d.items }),
    })

    let store: ReturnType<typeof configureStore<State>>

    beforeEach(() => {
        jest.clearAllMocks()
        const slice = createSlice({
            name: 'sel',
            initialState,
            reducers: {},
            extraReducers: (builder) => {
                const helper = sliceHelper(builder, thunks)
                // The projected payload type must line up with each slot — this map only
                // compiles because `select`'s return type flows through as the payload type.
                helper.mapThunksToState('fulfilled', {
                    getItems: 'items',
                    getFull: 'full',
                })
                helper.forEach('fulfilled', (s) => {
                    s.fetching = false
                })
            },
        })
        store = configureStore({ reducer: slice.reducer })
    })

    it('projects the success body via select', async () => {
        listApi.mockResolvedValue({
            ok: true,
            data: { items: [1, 2, 3], total: 3 },
        })
        const res = await store.dispatch(thunks.getItems({}))
        expect(res.payload).toEqual([1, 2, 3])
        expect(store.getState().items).toEqual([1, 2, 3])
    })

    it('returns the whole body when select is omitted (identity default)', async () => {
        listApi.mockResolvedValue({ ok: true, data: { items: [1], total: 1 } })
        const res = await store.dispatch(thunks.getFull({}))
        expect(res.payload).toEqual({ items: [1], total: 1 })
        expect(store.getState().full).toEqual({ items: [1], total: 1 })
    })

    it('projects via select on customApiThunkFor too', async () => {
        const { createThunks: ct, customApiThunkFor } = createThunkFactory<{
            state: State
            rejectValue: string
        }>()
        // ExplicitArg inferred from the annotated `params` arg → select's T also infers.
        const custom = ct({
            getItems: customApiThunkFor(listApi)({
                params: (arg: { page: number }) => arg.page as any,
                select: (d) => d.items,
            }),
        })
        const slice = createSlice({
            name: 'sel3',
            initialState,
            reducers: {},
            extraReducers: (builder) => {
                sliceHelper(builder, custom).mapThunksToState('fulfilled', {
                    getItems: 'items',
                })
            },
        })
        const store3 = configureStore({ reducer: slice.reducer })
        listApi.mockResolvedValue({
            ok: true,
            data: { items: [7, 8], total: 2 },
        })
        const res = await store3.dispatch(custom.getItems({ page: 1 }))
        expect(res.payload).toEqual([7, 8])
        expect(store3.getState().items).toEqual([7, 8])
    })

    it('maps the problem into the reject value via reject', async () => {
        const withReject = createThunks({
            getItems3: apiThunkFor(listApi)({
                reject: (r) => `handled: ${r.problem}`,
            }),
        })
        const slice = createSlice({
            name: 'sel4',
            initialState,
            reducers: {},
            extraReducers: (builder) => {
                sliceHelper(builder, withReject).forEach('rejected', (s) => {
                    s.fetching = false
                })
            },
        })
        const store4 = configureStore({ reducer: slice.reducer })
        listApi.mockResolvedValue({ ok: false, problem: 'BOOM' })
        const res = await store4.dispatch(withReject.getItems3({}))
        expect(res.type).toMatch(/rejected$/)
        expect(res.payload).toBe('handled: BOOM')
    })

    it('maps the problem into the reject value via reject on customApiThunkFor', async () => {
        const { createThunks: ct, customApiThunkFor } = createThunkFactory<{
            state: State
            rejectValue: string
        }>()
        const withReject = ct({
            getItems4: customApiThunkFor(listApi)({
                reject: (r) => `custom: ${r.problem}`,
            }),
        })
        const slice = createSlice({
            name: 'sel5',
            initialState,
            reducers: {},
            extraReducers: (builder) => {
                sliceHelper(builder, withReject).forEach('rejected', (s) => {
                    s.fetching = false
                })
            },
        })
        const store5 = configureStore({ reducer: slice.reducer })
        listApi.mockResolvedValue({ ok: false, problem: 'NOPE' })
        const res = await store5.dispatch(withReject.getItems4({}))
        expect(res.type).toMatch(/rejected$/)
        expect(res.payload).toBe('custom: NOPE')
    })

    it('does not run select on a rejected response', async () => {
        const select = jest.fn((d: ListResponse) => d.items)
        const rejecting = createThunks({
            getItems2: apiThunkFor(listApi)({ select }),
        })
        const slice = createSlice({
            name: 'sel2',
            initialState,
            reducers: {},
            extraReducers: (builder) => {
                sliceHelper(builder, rejecting).forEach('rejected', (s) => {
                    s.fetching = false
                })
            },
        })
        const store2 = configureStore({ reducer: slice.reducer })
        listApi.mockResolvedValue({ ok: false, problem: 'BOOM' })
        const res = await store2.dispatch(rejecting.getItems2({}))
        expect(res.type).toMatch(/rejected$/)
        expect(select).not.toHaveBeenCalled()
    })
})

describe('reject value in state (mapThunksToState "rejected")', () => {
    // A richer response whose failure branch carries `status` (like the real api client).
    type Resp<R> =
        | { ok: true; data: R }
        | { ok: false; problem: string; status: number }
    type ErrState = {
        items: number[]
        error: { code: number; msg: string } | undefined
    }
    const initial: ErrState = { items: [], error: undefined }

    it('stores the reject() value on the rejected action, typed by the slot', async () => {
        const failApi = jest.fn() as jest.Mock<Promise<Resp<ListResponse>>>
        const { createThunks: ct, apiThunkFor: at } = createThunkFactory<{
            state: ErrState
            rejectValue: string
        }>()
        const thunks = ct({
            // `reject`'s return type (an object) overrides the factory-wide `rejectValue: string`
            // for this thunk, and `failure.status` proves the full failure is in scope.
            load: at(failApi)({
                select: (d) => d.items,
                reject: (failure) => ({
                    code: failure.status,
                    msg: `failed: ${failure.problem}`,
                }),
            }),
        })
        const slice = createSlice({
            name: 'err',
            initialState: initial,
            reducers: {},
            extraReducers: (builder) => {
                const helper = sliceHelper(builder, thunks)
                helper.mapThunksToState('fulfilled', { load: 'items' })
                helper.mapThunksToState('rejected', { load: 'error' })
            },
        })
        const store = configureStore({ reducer: slice.reducer })
        failApi.mockResolvedValue({
            ok: false,
            problem: 'CLIENT_ERROR',
            status: 404,
        })
        const res = await store.dispatch(thunks.load({}))
        expect(res.type).toMatch(/rejected$/)
        expect(store.getState().error).toEqual({
            code: 404,
            msg: 'failed: CLIENT_ERROR',
        })
    })

    it('applies the factory default reject, overridable per-thunk', async () => {
        const failApi = jest.fn() as jest.Mock<Promise<Resp<ListResponse>>>
        const { createThunks: ct, apiThunkFor: at } = createThunkFactory<{
            state: ErrState
            rejectValue: string
        }>({}, { reject: (failure: { problem: string }) => `default: ${failure.problem}` })
        const thunks = ct({
            usesDefault: at(failApi)(), // no own reject → inherits the factory default
            ownReject: at(failApi)({ reject: (f) => `own: ${f.problem}` }),
        })
        const slice = createSlice({
            name: 'def',
            initialState: initial,
            reducers: {},
            extraReducers: (b) => {
                sliceHelper(b, thunks).forEach('rejected', () => {})
            },
        })
        const store = configureStore({ reducer: slice.reducer })
        failApi.mockResolvedValue({ ok: false, problem: 'CLIENT_ERROR', status: 404 })

        const a = await store.dispatch(thunks.usesDefault({}))
        const b = await store.dispatch(thunks.ownReject({}))
        expect(a.payload).toBe('default: CLIENT_ERROR')
        expect(b.payload).toBe('own: CLIENT_ERROR')
    })
})

// ─── Compile-time type assertions (ts-jest fails the build if any of these break) ───

const paramPlusOptionalBodyApi = (
    _p?: { id: number },
    _d?: { myId: number; anotherId?: number },
    _c?: any
): Promise<ApiResponse<string>> => Promise.resolve({ ok: true, data: 'x' })

const listApiTyped = (
    _p?: null | undefined,
    _d?: undefined,
    _c?: any
): Promise<ApiResponse<ListResponse>> =>
    Promise.resolve({ ok: true, data: { items: [], total: 0 } })

const {
    createThunks: ctTypes,
    apiThunkFor: atTypes,
    customApiThunkFor: catTypes,
} = createThunkFactory<{
    state: any
    rejectValue: string
}>()

const tt = ctTypes({
    assign: atTypes(paramPlusOptionalBodyApi)(),
    items: atTypes(listApiTyped)({ select: (d) => d.items }),
    full: atTypes(listApiTyped)(),
    // customApiThunkFor: ExplicitArg inferred from the annotated `params` arg; `select`'s `data`
    // is typed `R` with no annotation, and its return becomes the payload.
    customItems: catTypes(listApiTyped)({
        params: (_a: { id: number }) => undefined,
        select: (d) => d.items,
    }),
    // select + reject together — the case that used to collapse `data` to `any`.
    both: atTypes(listApiTyped)({
        select: (data) => data.items,
        reject: (r) => `${r.problem}`,
    }),
})

// Never executed — exists purely so its body is type-checked.
function _typeChecks() {
    // Merge fix: an optional body prop stays optional (before the fix, merging params + body
    // stripped the `?` and forced anotherId to be present).
    tt.assign({ id: 1, myId: 2 })
    tt.assign({ id: 1, myId: 2, anotherId: 3 })
    // @ts-expect-error — a required body prop is still required
    tt.assign({ id: 1 })

    // select return type flows through as the payload type.
    type ItemsPayload = ReturnType<typeof tt.items.fulfilled>['payload']
    type FullPayload = ReturnType<typeof tt.full.fulfilled>['payload']
    const items: number[] = null as unknown as ItemsPayload
    const full: ListResponse = null as unknown as FullPayload
    void items
    void full
    // @ts-expect-error — projected payload is number[], not the full object
    const wrong: ListResponse = null as unknown as ItemsPayload
    void wrong

    // customApiThunkFor select projection flows through the same way.
    type CustomItemsPayload = ReturnType<
        typeof tt.customItems.fulfilled
    >['payload']
    const customItems: number[] = null as unknown as CustomItemsPayload
    void customItems
    // @ts-expect-error — projected payload is number[], not the whole body (catches T collapsing to any)
    const customWrong: ListResponse = null as unknown as CustomItemsPayload
    void customWrong

    // select + reject together still projects to number[] (data was typed R, not any).
    type BothPayload = ReturnType<typeof tt.both.fulfilled>['payload']
    const both: number[] = null as unknown as BothPayload
    void both
    // @ts-expect-error — number[], not any/string; fails if data collapsed to any
    const bothWrong: string = null as unknown as BothPayload
    void bothWrong

    // A: reject's return type becomes the thunk's rejected-payload type (per-thunk, overriding
    // the factory-wide rejectValue). The rejected payload also includes `undefined`.
    const errThunks = ctTypes({
        load: atTypes(listApiTyped)({
            select: (d) => d.items,
            reject: () => ({ code: 500, msg: 'x' }),
        }),
    })
    type LoadRejected = ReturnType<typeof errThunks.load.rejected>['payload']
    const lr: { code: number; msg: string } | undefined =
        null as unknown as LoadRejected
    void lr
    // @ts-expect-error — rejected payload is the reject() object (| undefined), not a string
    const lrWrong: string = null as unknown as LoadRejected
    void lrWrong

    // B: mapThunksToState is state-aware — fulfilled maps the payload, rejected maps the reject
    // value, each checked against the slot (builder is compile-only, never executed).
    type ErrShape = { items: number[]; error: { code: number; msg: string } | undefined }
    const eb = null as unknown as ActionReducerMapBuilder<ErrShape>
    const eh = sliceHelper(eb, errThunks)
    eh.mapThunksToState('fulfilled', { load: 'items' })
    eh.mapThunksToState('rejected', { load: 'error' })
    // @ts-expect-error — reject value object doesn't fit the number[] slot
    eh.mapThunksToState('rejected', { load: 'items' })
    // @ts-expect-error — fulfilled number[] doesn't fit the error-object slot
    eh.mapThunksToState('fulfilled', { load: 'error' })
}
void _typeChecks
