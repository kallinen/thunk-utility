import { createThunkFactory } from './'
import { configureStore } from '@reduxjs/toolkit'

const store = configureStore({
  reducer: (state: TestState = { value: 0 }) => state,
})

type Dispatch = typeof store.dispatch
const dispatch = store.dispatch

/**
 * Test types
 */
type TestState = {
    value: number
}

type TestConfig = {
    state: TestState
    dispatch: Dispatch
    rejectValue: string
}

/**
 * Create factory
 */
const createTestThunks = createThunkFactory<TestConfig>()

describe('createThunkFactory (typing + runtime)', () => {
    it('should create thunks with correct runtime shape', () => {
        const thunks = createTestThunks({
            test: async (arg: number) => {
                return arg * 2
            },
        })

        expect(thunks.test).toBeDefined()
        expect(typeof thunks.test).toBe('function')
        expect(thunks.test.pending).toBeDefined()
        expect(thunks.test.fulfilled).toBeDefined()
        expect(thunks.test.rejected).toBeDefined()
    })

    it('should infer return type correctly', async () => {
        const thunks = createTestThunks({
            test: async (arg: number) => {
                return arg * 2
            },
        })

        type Result = Awaited<ReturnType<typeof thunks.test>>

        const _assert: Result = thunks.test(5)

        expect(_assert).toBeDefined()
    })

    it('should type thunk API correctly (state + dispatch + rejectValue)', () => {
        const thunks = createTestThunks({
            test: async (
                arg: number,
                { getState, dispatch, rejectWithValue }
            ) => {
                const state = getState()

                // state typing
                const value: number = state.value

                // dispatch typing
                dispatch({ type: 'TEST' })

                // rejectValue typing
                return rejectWithValue('error')
            },
        })

        expect(thunks.test).toBeDefined()
    })

    it('should enforce argument types', () => {
        const thunks = createTestThunks({
            test: async (arg: number) => arg,
        })

        // correct usage
        thunks.test(123)

        // uncommenting should fail typecheck
        // thunks.test('wrong')
    })

    it('should infer payload type correctly', () => {
        const thunks = createTestThunks({
            test: async (_: void) => {
                return { ok: true as const }
            },
        })

        const result = dispatch(thunks.test())

        type Payload = Awaited<ReturnType<typeof result.unwrap>>

        const _assert: Payload = { ok: true }

        expect(_assert.ok).toBe(true)
    })
})

describe('createThunks namespace support', () => {
  it('should generate thunks with correct typePrefix when no namespace is given', () => {
    const thunks = createTestThunks({
      myAction: async () => 123,
    })

    expect(thunks.myAction.typePrefix).toBe('myAction')
    expect(thunks.myAction.pending.type).toBe('myAction/pending')
    expect(thunks.myAction.fulfilled.type).toBe('myAction/fulfilled')
    expect(thunks.myAction.rejected.type).toBe('myAction/rejected')
  })

  it('should generate thunks with correct typePrefix when a namespace is provided', () => {
    const thunks = createTestThunks(
      {
        fetchData: async () => 'ok',
      },
      'user'
    )

    expect(thunks.fetchData.typePrefix).toBe('user/fetchData')
    expect(thunks.fetchData.pending.type).toBe('user/fetchData/pending')
    expect(thunks.fetchData.fulfilled.type).toBe('user/fetchData/fulfilled')
    expect(thunks.fetchData.rejected.type).toBe('user/fetchData/rejected')
  })

  it('should generate multiple namespaced thunks correctly', () => {
    const thunks = createTestThunks(
      {
        load: async () => 1,
        save: async () => 2,
      },
      'app'
    )

    expect(thunks.load.typePrefix).toBe('app/load')
    expect(thunks.save.typePrefix).toBe('app/save')

    expect(thunks.load.pending.type).toBe('app/load/pending')
    expect(thunks.save.fulfilled.type).toBe('app/save/fulfilled')
  })
})
