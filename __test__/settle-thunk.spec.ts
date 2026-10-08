import {
    configureStore,
    createAsyncThunk,
    type SerializedError,
} from '@reduxjs/toolkit'
import { settleThunk } from '../src'

type User = { id: number; name: string }
type TestError = { code: string }

const store = configureStore({
    reducer: (state: number = 0) => state,
})

const loadUser = createAsyncThunk<User, number, { rejectValue: TestError }>(
    'users/load',
    async (id) => ({ id, name: 'Ada' })
)

const rejectUser = createAsyncThunk<User, void, { rejectValue: TestError }>(
    'users/reject',
    async (_, { rejectWithValue }) => rejectWithValue({ code: 'NOT_FOUND' })
)

const throwUser = createAsyncThunk<User>('users/throw', async () => {
    throw new Error('transport failed')
})

const noContent = createAsyncThunk<void>(
    'content/archive',
    async () => undefined
)

// Never executed — ts-jest compiles it to guard the inferred result types.
const _typeChecks = async () => {
    const result = await settleThunk(store.dispatch(loadUser(1)))

    if (result.ok) {
        const value: User = result.value
        const payload: User = result.action.payload
        // @ts-expect-error — the fulfilled value remains the thunk's exact payload type
        const wrong: string = result.value
        void value
        void payload
        void wrong
    } else {
        const error: TestError | SerializedError | undefined = result.error
        const rejectedAction = result.action
        void error
        void rejectedAction
    }
}
void _typeChecks

describe('settleThunk', () => {
    it('returns the fulfilled payload and original action', async () => {
        const result = await settleThunk(store.dispatch(loadUser(7)))

        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error('Expected a fulfilled result')
        expect(result.value).toEqual({ id: 7, name: 'Ada' })
        expect(result.action.type).toBe('users/load/fulfilled')
        expect(result.action.meta.arg).toBe(7)
    })

    it('returns a rejectWithValue payload as the error', async () => {
        const result = await settleThunk(store.dispatch(rejectUser()))

        expect(result.ok).toBe(false)
        if (result.ok) throw new Error('Expected a rejected result')
        expect(result.error).toEqual({ code: 'NOT_FOUND' })
        expect(result.action.meta.rejectedWithValue).toBe(true)
    })

    it('returns RTK serialized errors for thrown failures', async () => {
        const result = await settleThunk(store.dispatch(throwUser()))

        expect(result.ok).toBe(false)
        if (result.ok) throw new Error('Expected a rejected result')
        expect(result.error).toMatchObject({
            name: 'Error',
            message: 'transport failed',
        })
        expect(result.action.meta.rejectedWithValue).toBe(false)
    })

    it('does not mistake an undefined fulfilled payload for rejection', async () => {
        const result = await settleThunk(store.dispatch(noContent()))

        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error('Expected a fulfilled result')
        expect(result.value).toBeUndefined()
        expect(result.action.meta.requestStatus).toBe('fulfilled')
    })
})
