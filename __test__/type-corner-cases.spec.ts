import { createSlice } from '@reduxjs/toolkit'
import { createThunkFactory, sliceHelper } from '../src'

/**
 * Compile-time guardrails for the typing layer (the fragile "beef"). ts-jest type-checks this
 * file, so a type regression — or a `@ts-expect-error` that no longer matches a real error —
 * fails the suite. Each block pins one corner case of `ThunkArg` / the scalar shortcut.
 */

type ApiResponse<R> = { ok: true; data: R } | { ok: false; problem: any }

const { createThunks, apiThunkFor } = createThunkFactory<{
    state: any
    rejectValue: string
}>()

// Model API fns mirroring the generated client, whose params are `Obj | SingleParam`
// (SingleParam = string | number), plus body/void variants.
const requiredParam = (
    _p?: { id: number } | string | number,
    _d?: undefined,
    _c?: any
): Promise<ApiResponse<string>> => Promise.resolve({ ok: true, data: 'x' })

const optionalParam = (
    _p?: { year?: number } | string | number,
    _d?: undefined,
    _c?: any
): Promise<ApiResponse<string>> => Promise.resolve({ ok: true, data: 'x' })

const objectValuedKey = (
    _p?: { filter: { q: string } } | string | number,
    _d?: undefined,
    _c?: any
): Promise<ApiResponse<string>> => Promise.resolve({ ok: true, data: 'x' })

const unionOfObjects = (
    _p?: { id: number } | { slug: string } | string | number,
    _d?: undefined,
    _c?: any
): Promise<ApiResponse<string>> => Promise.resolve({ ok: true, data: 'x' })

const anyParam = (
    _p?: any,
    _d?: undefined,
    _c?: any
): Promise<ApiResponse<string>> => Promise.resolve({ ok: true, data: 'x' })

const indexSignatureParam = (
    _p?: { [k: string]: string | number } | string | number,
    _d?: undefined,
    _c?: any
): Promise<ApiResponse<string>> => Promise.resolve({ ok: true, data: 'x' })

const singleBodyField = (
    _p?: null | undefined,
    _d?: { note: string },
    _c?: any
): Promise<ApiResponse<string>> => Promise.resolve({ ok: true, data: 'x' })

const t = createThunks({
    requiredParam: apiThunkFor(requiredParam)(),
    optionalParam: apiThunkFor(optionalParam)(),
    objectValuedKey: apiThunkFor(objectValuedKey)(),
    unionOfObjects: apiThunkFor(unionOfObjects)(),
    anyParam: apiThunkFor(anyParam)(),
    indexSignatureParam: apiThunkFor(indexSignatureParam)(),
    singleBodyField: apiThunkFor(singleBodyField)(),
})

// Never executed — its body exists only to be type-checked.
function _argTypeChecks() {
    // Required single primitive param → bare value OR object.
    t.requiredParam(5)
    t.requiredParam({ id: 5 })
    // @ts-expect-error — object missing the required key
    t.requiredParam({})
    // @ts-expect-error — wrong scalar type for a numeric param
    t.requiredParam(true)

    // Optional single param → bare, object, and empty object all valid (undefined stripped).
    t.optionalParam(2026)
    t.optionalParam({ year: 2026 })
    t.optionalParam({})

    // Object-VALUED single key → the scalar shortcut must NOT kick in.
    t.objectValuedKey({ filter: { q: 'x' } })
    // @ts-expect-error — the inner object is not the arg
    t.objectValuedKey({ q: 'x' })
    // @ts-expect-error — no scalar shortcut when the sole key's value is an object
    t.objectValuedKey(5)

    // Union of single-key objects → keyof is never → no scalar; each object accepted.
    t.unionOfObjects({ id: 1 })
    t.unionOfObjects({ slug: 'x' })
    // @ts-expect-error — a union of objects does not enable the scalar shortcut
    t.unionOfObjects(5)

    // `any` params → inference must not crash and must stay permissive (not locked to scalar).
    t.anyParam({})
    t.anyParam(123)
    t.anyParam({ whatever: true })

    // Index-signature params → `keyof { [k: string]: V }` is `string | number` (TS counts
    // numeric keys), so it reads as multi-key → NO scalar shortcut. Pass the object.
    t.indexSignatureParam({ foo: 1 })
    // @ts-expect-error — index-signature params are not eligible for the bare-scalar shortcut
    t.indexSignatureParam(5)

    // Single body field → shortcut applies to the body, not just path/query params.
    t.singleBodyField('a note')
    t.singleBodyField({ note: 'x' })
    // @ts-expect-error — wrong scalar type for a string body field
    t.singleBodyField(123)
}
void _argTypeChecks

describe('ThunkArg — typing corner cases', () => {
    it('compiles (assertions live in the type checker)', () => {
        expect(true).toBe(true)
    })
})

describe('sliceHelper.mapThunksToState — payload/slot type guard', () => {
    type S = {
        list: number[]
        info: { name: string } | null
        fetching: boolean
    }

    const numbersApi = (
        _p?: null | undefined,
        _d?: undefined,
        _c?: any
    ): Promise<ApiResponse<number[]>> =>
        Promise.resolve({ ok: true, data: [] })
    const infoApi = (
        _p?: null | undefined,
        _d?: undefined,
        _c?: any
    ): Promise<ApiResponse<{ name: string }>> =>
        Promise.resolve({ ok: true, data: { name: '' } })
    const stringApi = (
        _p?: null | undefined,
        _d?: undefined,
        _c?: any
    ): Promise<ApiResponse<string>> => Promise.resolve({ ok: true, data: '' })

    const th = createThunks({
        nums: apiThunkFor(numbersApi)(),
        info: apiThunkFor(infoApi)(),
        str: apiThunkFor(stringApi)(),
    })

    it('accepts matching payload→slot maps and rejects mismatches at compile time', () => {
        createSlice({
            name: 'cornerCases',
            initialState: { list: [], info: null, fetching: false } as S,
            reducers: {},
            extraReducers: (builder) => {
                const helper = sliceHelper(builder, th)
                helper.mapThunksToState('fulfilled', {
                    nums: 'list', // number[] → number[]
                    info: 'info', // { name } → { name } | null
                })
                // @ts-expect-error — string payload matches no slot, so the map is rejected
                helper.mapThunksToState('fulfilled', { str: 'list' })
            },
        })

        expect(true).toBe(true)
    })
})
