import { configureStore, createSlice } from '@reduxjs/toolkit'
import { createThunkFactory, sliceHelper } from '../src'

type ApiResponse<R> = { ok: true; data: R } | { ok: false; problem: any }

describe('apiThunkFor', () => {
    type TestState = {
        fetching: boolean
        products: number[]
        customerInfo: { name: string } | null
    }

    const initialState: TestState = {
        fetching: false,
        products: [],
        customerInfo: null,
    }

    const mockApiFn = jest.fn() as jest.Mock<Promise<ApiResponse<any>>>

    const { createThunks, apiThunkFor } = createThunkFactory<{
        state: TestState
        rejectValue: string
    }>()

    const thunks = createThunks({
        getProducts: apiThunkFor(mockApiFn)({
            body: (arg) => arg,
        }),
        getCustomerInfo: apiThunkFor(mockApiFn)({
            body: (arg) => arg,
        }),
    })

    let store: ReturnType<typeof configureStore<TestState>>

    beforeEach(() => {
        jest.clearAllMocks()

        const slice = createSlice({
            name: 'test',
            initialState,
            reducers: {},
            extraReducers: (builder) => {
                const helper = sliceHelper(builder, thunks)
                helper.mapThunksToState('fulfilled', {
                    getProducts: 'products',
                    getCustomerInfo: 'customerInfo',
                })
                helper.forEach('pending', (state) => {
                    state.fetching = true
                })
                helper.forEach('fulfilled', (state) => {
                    state.fetching = false
                })
                helper.forEach('rejected', (state) => {
                    state.fetching = false
                })
            },
        })

        store = configureStore({ reducer: slice.reducer })
    })

    it('should create a thunk with correct runtime shape', () => {
        expect(thunks.getProducts).toBeDefined()
        expect(typeof thunks.getProducts).toBe('function')
        expect(thunks.getProducts.pending).toBeDefined()
        expect(thunks.getProducts.fulfilled).toBeDefined()
        expect(thunks.getProducts.rejected).toBeDefined()
    })

    it('should return data on ok response', async () => {
        const mockData = [1, 2, 3]
        mockApiFn.mockResolvedValue({ ok: true, data: mockData })

        const result = await store.dispatch(thunks.getProducts({}))
        expect(result.payload).toEqual(mockData)
    })

    it('should rejectWithValue on non-ok response', async () => {
        mockApiFn.mockResolvedValue({ ok: false, problem: 'SERVER_ERROR' })

        const result = await store.dispatch(thunks.getProducts({}))
        expect(result.meta.requestStatus).toBe('rejected')
        expect((result as any).payload).toBe('SERVER_ERROR')
    })

    it('should call apiFn with mapped body', async () => {
        mockApiFn.mockResolvedValue({ ok: true, data: [] })

        const thunksWithBody = createThunks({
            test: apiThunkFor(mockApiFn)({
                body: (arg) => ({
                    platform: arg.platform,
                }),
            }),
        })

        await store.dispatch(thunksWithBody.test({ platform: 'ios' }))
        expect(mockApiFn).toHaveBeenCalledWith(
            undefined,
            { platform: 'ios' },
            undefined
        )
    })

    it('should call apiFn with mapped params', async () => {
        mockApiFn.mockResolvedValue({ ok: true, data: [] })

        const thunksWithParams = createThunks({
            test: apiThunkFor(mockApiFn)({
                params: (arg) => ({ id: arg.id }),
            }),
        })

        await store.dispatch(thunksWithParams.test({ id: '123' }))
        expect(mockApiFn).toHaveBeenCalledWith(
            { id: '123' },
            undefined,
            undefined
        )
    })

    it('should set fetching to true while pending', async () => {
        let resolveFn!: (v: any) => void
        mockApiFn.mockReturnValue(
            new Promise((res) => {
                resolveFn = res
            })
        )

        const dispatchPromise = store.dispatch(thunks.getProducts({}))
        expect(store.getState().fetching).toBe(true)

        resolveFn({ ok: true, data: [] })
        await dispatchPromise
        expect(store.getState().fetching).toBe(false)
    })

    it('should set fetching to false on rejection', async () => {
        mockApiFn.mockResolvedValue({ ok: false, problem: 'SERVER_ERROR' })

        await store.dispatch(thunks.getProducts({}))
        expect(store.getState().fetching).toBe(false)
    })

    it('should map fulfilled payload to state via mapThunksToState', async () => {
        const mockProducts = [1, 2, 3]
        mockApiFn.mockResolvedValue({ ok: true, data: mockProducts })

        await store.dispatch(thunks.getProducts({}))
        expect(store.getState().products).toEqual(mockProducts)
    })

    it('should map customerInfo to state via mapThunksToState', async () => {
        const mockCustomer = { name: 'John' }
        mockApiFn.mockResolvedValue({ ok: true, data: mockCustomer })

        await store.dispatch(thunks.getCustomerInfo({}))
        expect(store.getState().customerInfo).toEqual(mockCustomer)
    })

    it('should not update state on rejected thunk', async () => {
        mockApiFn.mockResolvedValue({ ok: false, problem: 'SERVER_ERROR' })

        await store.dispatch(thunks.getProducts({}))
        expect(store.getState().products).toEqual([])
    })
})

describe('customApiThunkFor', () => {
    type TestState = {
        fetching: boolean
        value: number
        result: { id: number; name: string } | null
    }

    const initialState: TestState = {
        fetching: false,
        value: 42,
        result: null,
    }

    const mockApiFn = jest.fn() as jest.Mock<
        Promise<ApiResponse<{ id: number; name: string }>>
    >

    const { createThunks, customApiThunkFor } = createThunkFactory<{
        state: TestState
        rejectValue: string
    }>()

    const thunks = createThunks({
        getResult: customApiThunkFor(mockApiFn)<{ platform: string }>({
            body: (arg) => ({ platform: arg.platform }),
        }),
    })

    let store: ReturnType<typeof configureStore<TestState>>

    beforeEach(() => {
        jest.clearAllMocks()

        const slice = createSlice({
            name: 'test',
            initialState,
            reducers: {},
            extraReducers: (builder) => {
                const helper = sliceHelper(builder, thunks)
                helper.mapThunksToState('fulfilled', {
                    getResult: 'result',
                })
                helper.forEach('pending', (state) => {
                    state.fetching = true
                })
                helper.forEach('fulfilled', (state) => {
                    state.fetching = false
                })
                helper.forEach('rejected', (state) => {
                    state.fetching = false
                })
            },
        })

        store = configureStore({ reducer: slice.reducer })
    })

    it('should create a thunk with correct runtime shape', () => {
        expect(thunks.getResult).toBeDefined()
        expect(typeof thunks.getResult).toBe('function')
        expect(thunks.getResult.pending).toBeDefined()
        expect(thunks.getResult.fulfilled).toBeDefined()
        expect(thunks.getResult.rejected).toBeDefined()
    })

    it('should return data on ok response', async () => {
        const mockData = { id: 1, name: 'test' }
        mockApiFn.mockResolvedValue({ ok: true, data: mockData })

        const result = await store.dispatch(
            thunks.getResult({ platform: 'ios' })
        )
        expect(result.payload).toEqual(mockData)
    })

    it('should rejectWithValue on non-ok response', async () => {
        mockApiFn.mockResolvedValue({ ok: false, problem: 'SERVER_ERROR' })

        const result = await store.dispatch(
            thunks.getResult({ platform: 'ios' })
        )
        expect(result.meta.requestStatus).toBe('rejected')
        expect((result as any).payload).toBe('SERVER_ERROR')
    })

    it('should call apiFn with mapped body using explicit arg', async () => {
        mockApiFn.mockResolvedValue({ ok: true, data: { id: 1, name: 'test' } })

        await store.dispatch(thunks.getResult({ platform: 'android' }))
        expect(mockApiFn).toHaveBeenCalledWith(
            undefined,
            { platform: 'android' },
            undefined
        )
    })

    it('should have access to state in map functions', async () => {
        mockApiFn.mockResolvedValue({ ok: true, data: { id: 1, name: 'test' } })

        const thunksWithState = createThunks({
            test: customApiThunkFor(mockApiFn)<{ platform: string }>({
                body: (arg, state) => ({
                    platform: arg.platform,
                    value: state.value,
                }),
            }),
        })

        await store.dispatch(thunksWithState.test({ platform: 'ios' }))
        expect(mockApiFn).toHaveBeenCalledWith(
            undefined,
            { platform: 'ios', value: 42 },
            undefined
        )
    })

    it('should set fetching to true while pending', async () => {
        let resolveFn!: (v: any) => void
        mockApiFn.mockReturnValue(
            new Promise((res) => {
                resolveFn = res
            })
        )

        const dispatchPromise = store.dispatch(
            thunks.getResult({ platform: 'ios' })
        )
        expect(store.getState().fetching).toBe(true)

        resolveFn({ ok: true, data: { id: 1, name: 'test' } })
        await dispatchPromise
        expect(store.getState().fetching).toBe(false)
    })

    it('should map fulfilled payload to state via mapThunksToState', async () => {
        const mockData = { id: 1, name: 'test' }
        mockApiFn.mockResolvedValue({ ok: true, data: mockData })

        await store.dispatch(thunks.getResult({ platform: 'ios' }))
        expect(store.getState().result).toEqual(mockData)
    })

    it('should not update state on rejected thunk', async () => {
        mockApiFn.mockResolvedValue({ ok: false, problem: 'SERVER_ERROR' })

        await store.dispatch(thunks.getResult({ platform: 'ios' }))
        expect(store.getState().result).toBeNull()
    })

    it('should set fetching to false on rejection', async () => {
        mockApiFn.mockResolvedValue({ ok: false, problem: 'SERVER_ERROR' })

        await store.dispatch(thunks.getResult({ platform: 'ios' }))
        expect(store.getState().fetching).toBe(false)
    })
})
