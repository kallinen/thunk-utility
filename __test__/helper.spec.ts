import { createSlice, configureStore, PayloadAction } from '@reduxjs/toolkit'
import { createThunkFactory, sliceHelper } from '../src'

type TestState = {
    fetching: boolean
    products: number[]
    customerInfo: { name: string } | null
}

describe('sliceHelper (reducers)', () => {
    let store: ReturnType<typeof configureStore<TestState>>
    type TestConfig = {
        state: TestState
        dispatch: typeof store.dispatch
        rejectValue: string
    }

    const { createThunks } = createThunkFactory<TestConfig>()

    const thunks = createThunks({
        getProducts: async (_: void) => [1, 2, 3],
        getCustomerInfo: async (_: void) => ({ name: 'Alice' }),
    })

    beforeEach(() => {
        const slice = createSlice({
            name: 'test',
            initialState: {
                fetching: false,
                products: [],
                customerInfo: null,
            } as TestState,
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

        store = configureStore({
            reducer: slice.reducer,
        })
    })

    it('should set fetching true when pending', async () => {
        const action = thunks.getProducts.pending('')
        store.dispatch(action)
        expect(store.getState().fetching).toBe(true)
    })

    it('should set fetching false when fulfilled', async () => {
        const action = thunks.getProducts.fulfilled([10, 20], '', undefined)
        store.dispatch(action)
        expect(store.getState().fetching).toBe(false)
    })

    it('should set fetching false when rejected', async () => {
        const action = thunks.getProducts.rejected(new Error(), '', undefined)
        store.dispatch(action)
        expect(store.getState().fetching).toBe(false)
    })

    it('should map payload to state correctly (products)', async () => {
        const action = thunks.getProducts.fulfilled([5, 6, 7], '', undefined)
        store.dispatch(action)
        expect(store.getState().products).toEqual([5, 6, 7])
    })

    it('should map payload to state correctly (customerInfo)', async () => {
        const action = thunks.getCustomerInfo.fulfilled(
            { name: 'Bob' },
            '',
            undefined
        )
        store.dispatch(action)
        expect(store.getState().customerInfo).toEqual({ name: 'Bob' })
    })
})
