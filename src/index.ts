import {
    ActionReducerMapBuilder,
    AsyncThunk,
    AsyncThunkConfig,
    AsyncThunkPayloadCreator,
    CaseReducer,
    createAsyncThunk,
    Draft,
    isAnyOf,
    PayloadAction,
} from '@reduxjs/toolkit'

type PayloadOf<T> = T extends AsyncThunkPayloadCreator<infer P, any, any>
    ? P
    : never

type ArgOf<T> = T extends AsyncThunkPayloadCreator<any, infer A, any> ? A : void

type CfgOf<T, DefaultCfg> = T extends AsyncThunkPayloadCreator<
    any,
    any,
    infer C
>
    ? C
    : DefaultCfg

type ActionMap = Record<string, AsyncThunkPayloadCreator<any, any, any>>

type ThunksOf<M extends ActionMap, DefaultCfg> = {
    [K in keyof M]: AsyncThunk<
        PayloadOf<M[K]>,
        ArgOf<M[K]>,
        CfgOf<M[K], DefaultCfg>
    >
}

type OnlyObject<T> = Extract<T, Record<string, any>>

// `B` wins on overlapping keys. Written as `Omit<A, keyof B> & B` rather than a mapped type
// over `keyof A | keyof B`: that key-union form is non-homomorphic and strips the `?` optional
// modifiers, turning every optional body/param prop into a required one. Omit + Pick (homomorphic)
// and intersection both preserve optionality.
type Merge<A, B> = [A] extends [never]
    ? B
    : [B] extends [never]
    ? A
    : Omit<A, keyof B> & B

/** Primitive param values eligible for the bare-scalar dispatch shortcut. */
type ScalarParam = string | number | boolean

/** Distributes over each key of `All`, yielding `true` for a key that is the sole one. */
type EachIsSole<All, K extends All = All> = K extends any
    ? [Exclude<All, K>] extends [never]
        ? true
        : false
    : never

/** `true` iff `O` has exactly one key. */
type IsSingleKey<O> = [keyof O] extends [never]
    ? false
    : [EachIsSole<keyof O>] extends [true]
    ? true
    : false

/**
 * A single-key operation may be dispatched with the bare param value instead of an object,
 * provided that value is primitive: `getById(5)` alongside `getById({ id: 5 })`. Multi-key
 * (or object-valued) operations still require the object form.
 */
type WithScalarShortcut<O> = IsSingleKey<O> extends true
    ? NonNullable<O[keyof O]> extends ScalarParam
        ? O | NonNullable<O[keyof O]>
        : O
    : O

type MergedThunkArg<P extends any[]> = Merge<
    OnlyObject<NonNullable<P[0]>>,
    OnlyObject<NonNullable<P[1]>>
>

type ThunkArg<P extends any[]> = [MergedThunkArg<P>] extends [never]
    ? void
    : WithScalarShortcut<MergedThunkArg<P>>

type ApiMetaShape = Record<
    string,
    {
        paramsKeys: readonly string[]
        queryKeys: readonly string[]
        bodyKeys: readonly string[]
    }
>

/** Success payload carried by a response union's `ok: true` branch. */
type OkDataOf<Res> = Extract<Res, { ok: true }> extends { data: infer D }
    ? D
    : never

/** The `ok: false` branch of a response union — the failure `reject` receives. */
type ErrOf<Res> = Extract<Res, { ok: false }>

export function createThunkFactory<Config extends AsyncThunkConfig>(
    apiMetadata: ApiMetaShape = {}
) {
    function createThunks<M extends ActionMap, DefaultCfg>(
        actionTypes: M,
        namespace?: string
    ): ThunksOf<M, DefaultCfg> {
        const result = {} as ThunksOf<M, DefaultCfg>
        for (const k in actionTypes) {
            const key = k as keyof M
            result[key] = createAsyncThunk<
                PayloadOf<M[typeof key]>,
                ArgOf<M[typeof key]>,
                CfgOf<M[typeof key], DefaultCfg>
            >(
                namespace ? `${namespace}/${k}` : k,
                actionTypes[key]
            ) as ThunksOf<M, DefaultCfg>[typeof key]
        }
        return result
    }

    function apiThunkFor<Res extends { ok: boolean }, P extends any[]>(
        apiFn: (...args: P) => Promise<Res>
    ) {
        type R = OkDataOf<Res>
        type Err = ErrOf<Res>

        const pick = <T extends object>(obj: T, keys: readonly string[]) => {
            const out: Partial<T> = {}
            for (const k of keys) {
                if (k in obj) out[k as keyof T] = obj[k as keyof T]
            }
            return out
        }

        // `select` optionally projects the success body into the shape you store, e.g.
        // `{ select: (data) => data.positions }` — its return type becomes the payload type.
        // `reject` optionally maps the failure (`status`, `problem`, `originalError`, …) into the
        // reject value; it's a transform, the thunk still rejects. Overloaded, with
        // the `select` overload FIRST so `{ select, reject }` binds `data` to `R` (a `reject`-first
        // order would greedily match `select` as an excess prop and collapse `data` to `any`); the
        // second overload keeps the no-`select` / bare `()` call pinned to `R`.
        function payloadCreator<T>(options: {
            select: (data: R) => T
            reject?: (failure: Err) => Config['rejectValue']
        }): AsyncThunkPayloadCreator<T, ThunkArg<P>, Config>
        function payloadCreator(options?: {
            reject?: (failure: Err) => Config['rejectValue']
        }): AsyncThunkPayloadCreator<R, ThunkArg<P>, Config>
        function payloadCreator<T = R>(
            options: {
                select?: (data: R) => T
                reject?: (failure: Err) => Config['rejectValue']
            } = {}
        ): AsyncThunkPayloadCreator<T, ThunkArg<P>, Config> {
            return (async (arg: any, { rejectWithValue }: any) => {
                const metaKey = (apiFn as any).__meta?.key
                const fnParamsSplit: ApiMetaShape[string] = (metaKey &&
                    apiMetadata[metaKey]) ?? {
                    bodyKeys: [],
                    paramsKeys: [],
                    queryKeys: [],
                }

                const paramKeys = [
                    ...fnParamsSplit.paramsKeys,
                    ...fnParamsSplit.queryKeys,
                ]

                const knownKeys = [...paramKeys, ...fnParamsSplit.bodyKeys]

                // A single-param/body operation may be dispatched with a bare scalar instead of
                // an object; wrap it into the { key: value } shape the split logic expects.
                const pickableArg: Record<string, any> =
                    arg !== null && typeof arg === 'object'
                        ? (arg as Record<string, any>)
                        : arg !== undefined && knownKeys.length === 1
                        ? { [knownKeys[0]]: arg }
                        : {}

                const allKnownKeys = new Set(knownKeys)

                for (const key of Object.keys(pickableArg)) {
                    if (!allKnownKeys.has(key)) {
                        console.warn(
                            `[apiThunkFor]: Unknown key "${key}" passed to ${metaKey}`
                        )
                    }
                }

                const params = pick(pickableArg, paramKeys)
                const body = pick(pickableArg, fnParamsSplit.bodyKeys)

                const finalParams = Object.keys(params).length
                    ? params
                    : undefined

                const finalBody = Object.keys(body).length ? body : undefined

                const finalConfig = undefined

                const response = await (
                    apiFn as (...args: any[]) => Promise<any>
                )(finalParams, finalBody, finalConfig)
                if (response.ok) {
                    const data = response.data as R
                    return options.select
                        ? options.select(data)
                        : (data as unknown as T)
                }
                return rejectWithValue(
                    options.reject
                        ? options.reject(response as Err)
                        : response.problem,
                    {} as any
                )
            }) as AsyncThunkPayloadCreator<T, ThunkArg<P>, Config>
        }

        return payloadCreator
    }

    function customApiThunkFor<Res extends { ok: boolean }, P extends any[]>(
        apiFn: (...args: P) => Promise<Res>
    ) {
        type R = OkDataOf<Res>
        type Err = ErrOf<Res>

        // Mirrors apiThunkFor: `select` projects the success body (its return becomes the payload
        // type), `reject` maps the full error response into the reject value. Overloaded with the
        // `select` overload first (a `reject`-first order would greedily match `select` as an
        // excess prop and collapse `data` to `any`); `reject` receives the failure. `ExplicitArg`
        // (the dispatch-arg type) is
        // inferred by annotating the callback arg (`params: (arg: Foo) => …`) — the annotation form
        // is the intended usage and makes `select`/`reject` "just work". It can also be passed as
        // `<Foo>` for a no-`select` call, but that form can't be combined with `select`.
        function customPayloadCreator<ExplicitArg, T>(map: {
            params?: (arg: ExplicitArg, state: Config['state']) => P[0]
            body?: (arg: ExplicitArg, state: Config['state']) => P[1]
            config?: (arg: ExplicitArg, state: Config['state']) => P[2]
            select: (data: R) => T
            reject?: (failure: Err) => Config['rejectValue']
        }): AsyncThunkPayloadCreator<T, ExplicitArg, Config>
        function customPayloadCreator<ExplicitArg>(map?: {
            params?: (arg: ExplicitArg, state: Config['state']) => P[0]
            body?: (arg: ExplicitArg, state: Config['state']) => P[1]
            config?: (arg: ExplicitArg, state: Config['state']) => P[2]
            reject?: (failure: Err) => Config['rejectValue']
        }): AsyncThunkPayloadCreator<R, ExplicitArg, Config>
        function customPayloadCreator<ExplicitArg, T = R>(
            map: {
                params?: (arg: ExplicitArg, state: Config['state']) => P[0]
                body?: (arg: ExplicitArg, state: Config['state']) => P[1]
                config?: (arg: ExplicitArg, state: Config['state']) => P[2]
                select?: (data: R) => T
                reject?: (failure: Err) => Config['rejectValue']
            } = {}
        ): AsyncThunkPayloadCreator<T, ExplicitArg, Config> {
            return (async (arg, { rejectWithValue, getState }) => {
                const state = getState() as Config['state']
                const response = await (
                    apiFn as (...args: any[]) => Promise<any>
                )(
                    map.params?.(arg, state),
                    map.body?.(arg, state),
                    map.config?.(arg, state)
                )
                if (response.ok) {
                    const data = response.data as R
                    return map.select ? map.select(data) : (data as unknown as T)
                }
                return rejectWithValue(
                    map.reject
                        ? map.reject(response as Err)
                        : response.problem,
                    {} as any
                )
            }) as AsyncThunkPayloadCreator<T, ExplicitArg, Config>
        }

        return customPayloadCreator
    }

    return {
        createThunks: function <
            M extends Record<string, AsyncThunkPayloadCreator<any, any, Config>>
        >(map: M, namespace?: string) {
            return createThunks<M, Config>(map, namespace)
        },
        apiThunkFor,
        customApiThunkFor,
    }
}

type AsyncState = 'fulfilled' | 'pending' | 'rejected'

type FulfilledPayload<T> = T extends { fulfilled: (...args: any) => infer A }
    ? A extends PayloadAction<infer P>
        ? P
        : never
    : never

type MapThunkToState<S, T extends Record<string, any>> = Partial<{
    [K in keyof T]: {
        [SK in keyof S]: FulfilledPayload<T[K]> extends S[SK] ? SK : never
    }[keyof S]
}>

export function sliceHelper<S, M extends ActionMap, DefaultCfg>(
    builder: ActionReducerMapBuilder<S>,
    thunks: ThunksOf<M, DefaultCfg>
) {
    return {
        forEach: (state: AsyncState, reducer: CaseReducer<S>) => {
            const thunkMatchers = Object.entries(thunks).map(
                ([_, thunk]) => thunk[state]
            )
            builder.addMatcher(isAnyOf(...thunkMatchers), reducer)
        },
        mapThunksToState: (
            state: AsyncState,
            map: MapThunkToState<S, ThunksOf<M, DefaultCfg>>
        ) => {
            Object.entries(map).forEach(([thunkName, stateKey]) => {
                const thunk = thunks[thunkName]

                builder.addCase(
                    thunk[state],
                    (stateObj: Draft<S>, action: PayloadAction<any>) => {
                        stateObj[stateKey as keyof Draft<S>] = action.payload
                    }
                )
            })
        },
    }
}
