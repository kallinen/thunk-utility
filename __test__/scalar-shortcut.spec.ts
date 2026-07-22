import { createThunkFactory } from '../src'

type ApiResponse<R> = { ok: true; data: R } | { ok: false; problem: any }

type Meta = { paramsKeys: string[]; queryKeys: string[]; bodyKeys: string[] }

const makeThunk = (metaKey: string, meta: Meta) => {
    const apiFn = jest.fn().mockResolvedValue({ ok: true, data: 'ok' })
    Object.defineProperty(apiFn, '__meta', { value: { key: metaKey } })
    const factory = createThunkFactory({ [metaKey]: meta })
    return { apiFn, thunk: factory.apiThunkFor(apiFn)() }
}

const run = (thunk: any, arg: any) =>
    thunk(arg, { rejectWithValue: jest.fn(), getState: () => ({}) } as any)

describe('apiThunkFor — single-param scalar shortcut (runtime)', () => {
    it('wraps a bare scalar into the sole path param', async () => {
        const { apiFn, thunk } = makeThunk('single', {
            paramsKeys: ['id'],
            queryKeys: [],
            bodyKeys: [],
        })
        await run(thunk, 123)
        expect(apiFn).toHaveBeenCalledWith({ id: 123 }, undefined, undefined)
    })

    it('wraps a bare scalar into the sole query param', async () => {
        const { apiFn, thunk } = makeThunk('singleQuery', {
            paramsKeys: [],
            queryKeys: ['year'],
            bodyKeys: [],
        })
        await run(thunk, 2026)
        expect(apiFn).toHaveBeenCalledWith({ year: 2026 }, undefined, undefined)
    })

    it('wraps a bare scalar into the sole body field', async () => {
        const { apiFn, thunk } = makeThunk('singleBody', {
            paramsKeys: [],
            queryKeys: [],
            bodyKeys: ['response'],
        })
        await run(thunk, 'attending')
        expect(apiFn).toHaveBeenCalledWith(
            undefined,
            { response: 'attending' },
            undefined
        )
    })

    it('still accepts the object form for a single-param op', async () => {
        const { apiFn, thunk } = makeThunk('single', {
            paramsKeys: ['id'],
            queryKeys: [],
            bodyKeys: [],
        })
        await run(thunk, { id: 7 })
        expect(apiFn).toHaveBeenCalledWith({ id: 7 }, undefined, undefined)
    })

    it('handles a falsy-but-valid scalar (0)', async () => {
        const { apiFn, thunk } = makeThunk('single', {
            paramsKeys: ['id'],
            queryKeys: [],
            bodyKeys: [],
        })
        await run(thunk, 0)
        expect(apiFn).toHaveBeenCalledWith({ id: 0 }, undefined, undefined)
    })

    it('does not wrap a scalar when there are multiple known keys', async () => {
        const { apiFn, thunk } = makeThunk('multi', {
            paramsKeys: ['id'],
            queryKeys: [],
            bodyKeys: ['name'],
        })
        await run(thunk, 5) // ambiguous → ignored
        expect(apiFn).toHaveBeenCalledWith(undefined, undefined, undefined)
    })

    it('ignores a bare scalar when the op has no known keys', async () => {
        const { apiFn, thunk } = makeThunk('none', {
            paramsKeys: [],
            queryKeys: [],
            bodyKeys: [],
        })
        await run(thunk, 5)
        expect(apiFn).toHaveBeenCalledWith(undefined, undefined, undefined)
    })

    it('still splits a multi-key object into params + body', async () => {
        const { apiFn, thunk } = makeThunk('multi', {
            paramsKeys: ['id'],
            queryKeys: [],
            bodyKeys: ['name'],
        })
        await run(thunk, { id: 1, name: 'John' })
        expect(apiFn).toHaveBeenCalledWith(
            { id: 1 },
            { name: 'John' },
            undefined
        )
    })
})

// ─── Compile-time type assertions (ts-jest fails the build if any of these break) ───

const singleParamApi = (
    _p?: { id: number } | string | number,
    _d?: undefined,
    _c?: any
): Promise<ApiResponse<string>> => Promise.resolve({ ok: true, data: 'x' })

const singleQueryApi = (
    _p?: { year?: number } | string | number,
    _d?: undefined,
    _c?: any
): Promise<ApiResponse<string>> => Promise.resolve({ ok: true, data: 'x' })

const noArgApi = (
    _p?: null | undefined,
    _d?: undefined,
    _c?: any
): Promise<ApiResponse<string>> => Promise.resolve({ ok: true, data: 'x' })

const bodyApi = (
    _p?: null | undefined,
    _d?: { name: string; age: number },
    _c?: any
): Promise<ApiResponse<string>> => Promise.resolve({ ok: true, data: 'x' })

const paramPlusBodyApi = (
    _p?: { id: number } | string | number,
    _d?: { name: string },
    _c?: any
): Promise<ApiResponse<string>> => Promise.resolve({ ok: true, data: 'x' })

const { createThunks, apiThunkFor } = createThunkFactory<{
    state: any
    rejectValue: string
}>()

const t = createThunks({
    single: apiThunkFor(singleParamApi)(),
    singleQuery: apiThunkFor(singleQueryApi)(),
    noArg: apiThunkFor(noArgApi)(),
    body: apiThunkFor(bodyApi)(),
    paramPlusBody: apiThunkFor(paramPlusBodyApi)(),
})

// Never executed — this function exists purely so its body is type-checked.
function _typeChecks() {
    t.single(5) // bare scalar accepted
    t.single({ id: 5 }) // object form still accepted
    t.singleQuery(2026) // optional single query param, bare
    t.singleQuery({ year: 2026 })
    t.noArg() // void arg
    t.body({ name: 'a', age: 1 }) // multi-field body → object
    t.paramPlusBody({ id: 1, name: 'a' }) // params + body merged → object

    // @ts-expect-error — a multi-field body cannot be a bare scalar
    t.body('a')
    // @ts-expect-error — params + body merge to >1 key, so no scalar shortcut
    t.paramPlusBody(1)
    // @ts-expect-error — wrong scalar type for a numeric param
    t.single(true)
    // @ts-expect-error — object missing the required key
    t.single({})
}
void _typeChecks

describe('apiThunkFor — scalar shortcut (types)', () => {
    it('type-level assertions compile', () => {
        expect(true).toBe(true)
    })
})
