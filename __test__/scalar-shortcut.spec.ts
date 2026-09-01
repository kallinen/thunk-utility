import { createThunkFactory } from '../src'

type ApiResponse<R> = { ok: true; data: R } | { ok: false; problem: any }

type Meta = { paramsKeys: string[]; queryKeys: string[]; bodyKeys: string[] }

const makeThunk = (metaKey: string, meta: Meta) => {
    const apiFn = jest.fn().mockResolvedValue({ ok: true, data: 'ok' })
    Object.defineProperty(apiFn, '__meta', { value: { key: metaKey } })
    const factory = createThunkFactory({ [metaKey]: meta })
    return { apiFn, thunk: factory.apiThunkFor(apiFn)() }
}

const signal = new AbortController().signal

const run = (thunk: any, arg: any) =>
    thunk(arg, {
        rejectWithValue: jest.fn(),
        getState: () => ({}),
        signal,
    } as any)

describe('apiThunkFor — single-param scalar shortcut (runtime)', () => {
    it('wraps a bare scalar into the sole path param', async () => {
        const { apiFn, thunk } = makeThunk('single', {
            paramsKeys: ['id'],
            queryKeys: [],
            bodyKeys: [],
        })
        await run(thunk, 123)
        expect(apiFn).toHaveBeenCalledWith({ id: 123 }, undefined, { signal })
    })

    it('wraps a bare scalar into the sole query param', async () => {
        const { apiFn, thunk } = makeThunk('singleQuery', {
            paramsKeys: [],
            queryKeys: ['year'],
            bodyKeys: [],
        })
        await run(thunk, 2026)
        expect(apiFn).toHaveBeenCalledWith({ year: 2026 }, undefined, { signal })
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
            { signal }
        )
    })

    it('still accepts the object form for a single-param op', async () => {
        const { apiFn, thunk } = makeThunk('single', {
            paramsKeys: ['id'],
            queryKeys: [],
            bodyKeys: [],
        })
        await run(thunk, { id: 7 })
        expect(apiFn).toHaveBeenCalledWith({ id: 7 }, undefined, { signal })
    })

    it('handles a falsy-but-valid scalar (0)', async () => {
        const { apiFn, thunk } = makeThunk('single', {
            paramsKeys: ['id'],
            queryKeys: [],
            bodyKeys: [],
        })
        await run(thunk, 0)
        expect(apiFn).toHaveBeenCalledWith({ id: 0 }, undefined, { signal })
    })

    it('does not wrap a scalar when there are multiple known keys', async () => {
        const { apiFn, thunk } = makeThunk('multi', {
            paramsKeys: ['id'],
            queryKeys: [],
            bodyKeys: ['name'],
        })
        await run(thunk, 5) // ambiguous → ignored
        expect(apiFn).toHaveBeenCalledWith(undefined, undefined, { signal })
    })

    it('ignores a bare scalar when the op has no known keys', async () => {
        const { apiFn, thunk } = makeThunk('none', {
            paramsKeys: [],
            queryKeys: [],
            bodyKeys: [],
        })
        await run(thunk, 5)
        expect(apiFn).toHaveBeenCalledWith(undefined, undefined, { signal })
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
            { signal }
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

const allOptionalApi = (
    _p?: { team?: string; page?: number },
    _d?: undefined,
    _c?: any
): Promise<ApiResponse<string>> => Promise.resolve({ ok: true, data: 'x' })

const optionalPlusRequiredApi = (
    _p?: { team?: string },
    _d?: { name: string },
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
    allOptional: apiThunkFor(allOptionalApi)(),
    optionalPlusRequired: apiThunkFor(optionalPlusRequiredApi)(),
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

    // Every parameter optional → dispatchable with nothing at all, and still with the object.
    t.singleQuery()
    t.allOptional()
    t.allOptional({})
    t.allOptional({ team: 'x' })
    t.allOptional({ team: 'x', page: 2 })

    // One required key anywhere in the merge keeps the argument required.
    t.optionalPlusRequired({ name: 'a' })
    // @ts-expect-error — `name` is required, so the argument cannot be omitted
    t.optionalPlusRequired()
    // @ts-expect-error — still required when the object is present but incomplete
    t.optionalPlusRequired({ team: 'x' })
}
void _typeChecks

describe('apiThunkFor — omitted argument (runtime)', () => {
    it('sends no params or body when an all-optional arg is omitted', async () => {
        const { apiFn, thunk } = makeThunk('allOptional', {
            paramsKeys: [],
            queryKeys: ['team', 'page'],
            bodyKeys: [],
        })
        await run(thunk, undefined)
        expect(apiFn).toHaveBeenCalledWith(undefined, undefined, { signal })
    })

    it('still sends what is given when the arg is partially filled', async () => {
        const { apiFn, thunk } = makeThunk('allOptional', {
            paramsKeys: [],
            queryKeys: ['team', 'page'],
            bodyKeys: [],
        })
        await run(thunk, { team: 'x' })
        expect(apiFn).toHaveBeenCalledWith({ team: 'x' }, undefined, { signal })
    })

    it('warns about nothing when the arg is omitted', async () => {
        const warn = jest.fn()
        const apiFn = jest.fn().mockResolvedValue({ ok: true, data: 'ok' })
        const factory = createThunkFactory({}, { onWarning: warn })
        await run(factory.apiThunkFor(apiFn)(), undefined)
        expect(warn).not.toHaveBeenCalled()
    })
})

describe('apiThunkFor — scalar shortcut (types)', () => {
    it('type-level assertions compile', () => {
        expect(true).toBe(true)
    })
})
