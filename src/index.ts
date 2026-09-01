import {
    ActionReducerMapBuilder,
    AsyncThunk,
    AsyncThunkConfig,
    AsyncThunkOptions,
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

/**
 * `true` when every key of `O` is optional — an empty object already satisfies it, so a dispatch
 * has nothing it is obliged to pass.
 */
type IsAllOptional<O> = {} extends O ? true : false

/**
 * An operation whose parameters are all optional is dispatchable with no argument at all:
 * `listUsers()` alongside `listUsers({ team: 'x' })`. RTK makes the argument optional as soon as
 * `void` is part of the union, so that is all this adds.
 */
type ThunkArg<P extends any[]> = [MergedThunkArg<P>] extends [never]
    ? void
    : IsAllOptional<MergedThunkArg<P>> extends true
    ? WithScalarShortcut<MergedThunkArg<P>> | void
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

/** The success body for this client kind: the `ok: true` branch's data, or axios's `data`. */
type SuccessOf<Config, Res> = KindOf<Config> extends 'axios'
    ? Res extends { data: infer D }
        ? D
        : never
    : OkDataOf<Res>

/** What `reject` receives: the `ok: false` branch, or the failure assembled from an AxiosError. */
type FailureOf<Config, Res> = KindOf<Config> extends 'axios'
    ? AxiosFailure
    : ErrOf<Res>

/**
 * The api client resolves failures as an `ok: false` response rather than throwing, so a real
 * throw means something outside that contract broke (an interceptor, a serialization bug, a
 * transport that never produced a response). We still route it through `reject` so a factory-wide
 * error normalization applies uniformly — otherwise exactly the failures nobody anticipated would
 * be the ones that skip it. Shaped like the client's `ApiErrorResponse`, with `status: 0` marking
 * "no response was received".
 */
const thrownAsFailure = (error: unknown) => ({
    ok: false as const,
    problem: 'UNKNOWN_ERROR',
    originalError: error,
    status: 0,
})

/**
 * The contract this library assumes unless told otherwise: every request resolves, and the
 * response says whether it succeeded — `{ ok: true, data }` or `{ ok: false, … }`. Both apisauce
 * and `@kallinen/openapi-axios-client` work this way.
 */
export type DefaultClient = 'default'

/** Plain axios: resolves only on success, and throws an `AxiosError` on everything else. */
export type AxiosClient = 'axios'

/**
 * Which response contract the api client follows. Declare it as `client` on your `Config` — the
 * factory can't infer it from the adapter value, because naming `Config` explicitly stops
 * TypeScript inferring any later type parameter.
 */
export type ClientKind = DefaultClient | AxiosClient

type KindOf<Config> = Config extends { client: infer K extends ClientKind }
    ? K
    : DefaultClient

/**
 * The failure an axios client produces. Axios throws on a non-2xx, so this is assembled from the
 * `AxiosError`: `data` is the error body the server sent (where an API puts its error detail),
 * and `status: 0` means the request never got a response at all.
 */
export type AxiosFailure = {
    ok: false
    status: number
    problem: string
    data: unknown
    originalError: unknown
}

/**
 * Normalizes one client's responses into the success/failure split the payload creators work with.
 * `toResult` handles a resolved call, `fromError` a thrown one.
 */
export type ResponseAdapter = {
    kind: ClientKind
    toResult: (
        raw: any
    ) => { ok: true; data: any } | { ok: false; failure: any }
    fromError: (error: unknown) => any
}

/** Used unless a factory says otherwise. The response itself says whether it succeeded. */
export const defaultAdapter: ResponseAdapter = {
    kind: 'default',
    toResult: (raw) =>
        raw?.ok ? { ok: true, data: raw.data } : { ok: false, failure: raw },
    fromError: thrownAsFailure,
}

/**
 * Plain axios (or anything axios-shaped): a resolved promise is a success and its `data` is the
 * body; a rejection carries the status and error body on `error.response`.
 */
export const axiosAdapter: ResponseAdapter = {
    kind: 'axios',
    toResult: (raw) => ({ ok: true, data: raw?.data }),
    fromError: (error: any) => ({
        ok: false as const,
        status: error?.response?.status ?? 0,
        problem: error?.code ?? error?.message ?? 'UNKNOWN_ERROR',
        data: error?.response?.data,
        originalError: error,
    }),
}

/**
 * An axios response run through the default adapter would look like a failure (no `ok` field), so
 * a success would land in `reject` with no clue why. Cheap to spot, and worth saying out loud.
 */
const looksLikeAxios = (raw: any) =>
    raw !== null &&
    typeof raw === 'object' &&
    !('ok' in raw) &&
    'status' in raw &&
    'data' in raw

/**
 * Where a payload creator carries the `createAsyncThunk` options declared alongside its
 * `select`/`reject` — read back by `createThunks`. `Symbol.for` so two copies of the library in
 * one bundle still agree on the key.
 */
const THUNK_OPTIONS = Symbol.for('thunk-utility.thunkOptions')

/**
 * Split an options object into the keys the payload creator itself consumes (`ownKeys`) and the
 * rest, which are `createAsyncThunk` options; stash the latter on the creator for `createThunks`.
 * Non-enumerable so the creator still looks like a plain function to anything iterating it.
 */
const attachThunkOptions = <F extends object>(
    fn: F,
    options: Record<string, any>,
    ownKeys: readonly string[]
): F => {
    const thunkOptions: Record<string, any> = {}
    for (const key of Object.keys(options)) {
        if (!ownKeys.includes(key)) thunkOptions[key] = options[key]
    }
    if (Object.keys(thunkOptions).length) {
        Object.defineProperty(fn, THUNK_OPTIONS, { value: thunkOptions })
    }
    return fn
}

export function createThunkFactory<
    // `client` is optional and defaults to `DefaultClient`; naming it in the constraint means a
    // typo ('axois') is an error here rather than a puzzling `unknown` at some later `select`.
    Config extends AsyncThunkConfig & { client?: ClientKind },
    Failure = any
>(
    apiMetadata: ApiMetaShape = {},
    factoryOptions: {
        /**
         * A default `reject` applied to every thunk that doesn't define its own — e.g. normalize
         * all failures into your app's error type. Must return the factory-wide
         * `Config['rejectValue']` (set `rejectValue` in your Config to make that type useful).
         * A per-thunk `reject` overrides it. Annotate `failure` or set the factory's `Failure`
         * type param to type it (defaults to `any`).
         */
        reject?: (failure: Failure) => Config['rejectValue']
        /**
         * Default `createAsyncThunk` options applied to every thunk — e.g. a shared `condition`
         * that skips dispatch while a request is already in flight. Merged shallowly with the
         * options a payload creator declares next to its `select`/`reject`, which win key by key.
         */
        thunkOptions?: AsyncThunkOptions<any, Config>
        /**
         * Where `apiThunkFor`'s argument-routing warnings go — dispatch arguments it had to drop
         * because no metadata claimed them. Defaults to `console.warn`; pass your own logger to
         * redirect it, or `false` to silence it. The library deliberately does not sniff
         * `NODE_ENV` to decide this for you.
         */
        onWarning?: ((message: string) => void) | false
    } & (KindOf<Config> extends DefaultClient
        ? { adapter?: ResponseAdapter }
        : {
              /**
               * Required because this factory's `Config` declares a non-default `client`. Pass the
               * matching adapter — `axiosAdapter` for `client: 'axios'`.
               */
              adapter: ResponseAdapter
          }) = {} as any
) {
    const warn =
        factoryOptions.onWarning === undefined
            ? (message: string) => console.warn(message)
            : factoryOptions.onWarning

    const adapter: ResponseAdapter =
        (factoryOptions as { adapter?: ResponseAdapter }).adapter ??
        defaultAdapter

    // Turn a resolved response into the payload, or hand the failure to `reject`.
    const settle = (
        response: any,
        select: ((data: any) => any) | undefined,
        perThunkReject: ((failure: any) => any) | undefined,
        rejectWithValue: (value: any, meta: any) => any
    ) => {
        if (warn && adapter.kind === 'default' && looksLikeAxios(response)) {
            warn(
                '[thunk-utility]: the response has no `ok` field but looks like an axios ' +
                    "response — pass `adapter: axiosAdapter` (and `client: 'axios'` on your " +
                    'Config) or it will be treated as a failure.'
            )
        }
        const result = adapter.toResult(response)
        if (result.ok) {
            return select ? select(result.data) : result.data
        }
        return reject(result.failure, perThunkReject, rejectWithValue)
    }
    /**
     * `createAsyncThunk` options usable next to `select`/`reject` on a payload creator, typed
     * against that thunk's own dispatch arg and the factory `Config`. `Partial` because a
     * `pendingMeta` in the config makes `getPendingMeta` required on the bare type.
     */
    type ThunkOptions<A> = Partial<AsyncThunkOptions<A, Config>>

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
            >(namespace ? `${namespace}/${k}` : k, actionTypes[key], {
                // Factory-wide defaults first, then the options the creator carries — the
                // narrower one wins key by key.
                ...factoryOptions.thunkOptions,
                ...(actionTypes[key] as any)[THUNK_OPTIONS],
            } as any) as ThunksOf<M, DefaultCfg>[typeof key]
        }
        return result
    }

    /**
     * Turn a failure into the thunk's rejected action. `reject` (per-thunk, else the factory
     * default) maps it; with neither, the payload falls back to the client's `problem` code.
     */
    const reject = (
        failure: any,
        perThunk: ((failure: any) => any) | undefined,
        rejectWithValue: (value: any, meta: any) => any
    ) => {
        const rejecter = perThunk ?? factoryOptions.reject
        return rejectWithValue(
            (rejecter ? rejecter(failure) : failure.problem) as any,
            {} as any
        )
    }

    function apiThunkFor<Res extends object, P extends any[]>(
        apiFn: (...args: P) => Promise<Res>
    ) {
        type R = SuccessOf<Config, Res>
        type Err = FailureOf<Config, Res>

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
        // reject value; it's a transform, the thunk still rejects. Any remaining key is a
        // `createAsyncThunk` option (`condition`, `idGenerator`, …), applied to the thunk
        // `createThunks` builds from this creator. Overloaded, with
        // the `select` overload FIRST so `{ select, reject }` binds `data` to `R` (a `reject`-first
        // order would greedily match `select` as an excess prop and collapse `data` to `any`); the
        // second overload keeps the no-`select` / bare `()` call pinned to `R`.
        function payloadCreator<T, RV = Config['rejectValue']>(
            options: {
                select: (data: R) => T
                reject?: (failure: Err) => RV
            } & ThunkOptions<ThunkArg<P>>
        ): AsyncThunkPayloadCreator<
            T,
            ThunkArg<P>,
            Config & { rejectValue: RV }
        >
        function payloadCreator<RV = Config['rejectValue']>(
            options?: {
                reject?: (failure: Err) => RV
            } & ThunkOptions<ThunkArg<P>>
        ): AsyncThunkPayloadCreator<
            R,
            ThunkArg<P>,
            Config & { rejectValue: RV }
        >
        function payloadCreator<T = R, RV = Config['rejectValue']>(
            options: {
                select?: (data: R) => T
                reject?: (failure: Err) => RV
            } & ThunkOptions<ThunkArg<P>> = {}
        ): AsyncThunkPayloadCreator<
            T,
            ThunkArg<P>,
            Config & { rejectValue: RV }
        > {
            const creator = (async (
                arg: any,
                { rejectWithValue, signal }: any
            ) => {
                const metaKey = (apiFn as any).__meta?.key
                const meta = metaKey ? apiMetadata[metaKey] : undefined
                const fnParamsSplit: ApiMetaShape[string] = meta ?? {
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

                if (warn && Object.keys(pickableArg).length) {
                    // No metadata at all means every key is dropped — report that once, rather
                    // than emitting a misleading "unknown key" line per key against `undefined`.
                    if (!meta) {
                        warn(
                            `[apiThunkFor]: No api metadata for ${
                                metaKey ? `"${metaKey}"` : 'this operation'
                            }; arguments were dropped.`
                        )
                    } else {
                        for (const key of Object.keys(pickableArg)) {
                            if (!allKnownKeys.has(key)) {
                                warn(
                                    `[apiThunkFor]: Unknown key "${key}" passed to ${metaKey}`
                                )
                            }
                        }
                    }
                }

                const params = pick(pickableArg, paramKeys)
                const body = pick(pickableArg, fnParamsSplit.bodyKeys)

                const finalParams = Object.keys(params).length
                    ? params
                    : undefined

                const finalBody = Object.keys(body).length ? body : undefined

                // Forward RTK's AbortSignal as the request config so `dispatch(...).abort()`
                // cancels the in-flight HTTP request, not just the thunk.
                try {
                    const response = await (
                        apiFn as (...args: any[]) => Promise<any>
                    )(finalParams, finalBody, { signal })
                    return settle(
                        response,
                        options.select,
                        options.reject,
                        rejectWithValue
                    )
                } catch (error) {
                    // An abort is RTK's to report — it already races the payload creator against
                    // the signal, and swallowing it here would mask `meta.aborted`. (An axios
                    // CanceledError arrives here too, and the aborted signal catches it.)
                    if (signal?.aborted) throw error
                    return reject(
                        adapter.fromError(error),
                        options.reject,
                        rejectWithValue
                    )
                }
            }) as AsyncThunkPayloadCreator<
                T,
                ThunkArg<P>,
                Config & { rejectValue: RV }
            >

            return attachThunkOptions(creator, options, ['select', 'reject'])
        }

        return payloadCreator
    }

    function customApiThunkFor<Res extends object, P extends any[]>(
        apiFn: (...args: P) => Promise<Res>
    ) {
        type R = SuccessOf<Config, Res>
        type Err = FailureOf<Config, Res>

        // Mirrors apiThunkFor: `select` projects the success body (its return becomes the payload
        // type), `reject` maps the full error response into the reject value, and any remaining
        // key is a `createAsyncThunk` option (`condition`, …) declared alongside them.
        // Overloaded with the
        // `select` overload first (a `reject`-first order would greedily match `select` as an
        // excess prop and collapse `data` to `any`); `reject` receives the failure. `ExplicitArg`
        // (the dispatch-arg type) is
        // inferred by annotating the callback arg (`params: (arg: Foo) => …`) — the annotation form
        // is the intended usage and makes `select`/`reject` "just work". It can also be passed as
        // `<Foo>` for a no-`select` call, but that form can't be combined with `select`.
        function customPayloadCreator<
            ExplicitArg,
            T,
            RV = Config['rejectValue']
        >(
            map: {
                params?: (arg: ExplicitArg, state: Config['state']) => P[0]
                body?: (arg: ExplicitArg, state: Config['state']) => P[1]
                config?: (arg: ExplicitArg, state: Config['state']) => P[2]
                select: (data: R) => T
                reject?: (failure: Err) => RV
            } & ThunkOptions<ExplicitArg>
        ): AsyncThunkPayloadCreator<
            T,
            ExplicitArg,
            Config & { rejectValue: RV }
        >
        function customPayloadCreator<ExplicitArg, RV = Config['rejectValue']>(
            map?: {
                params?: (arg: ExplicitArg, state: Config['state']) => P[0]
                body?: (arg: ExplicitArg, state: Config['state']) => P[1]
                config?: (arg: ExplicitArg, state: Config['state']) => P[2]
                reject?: (failure: Err) => RV
            } & ThunkOptions<ExplicitArg>
        ): AsyncThunkPayloadCreator<
            R,
            ExplicitArg,
            Config & { rejectValue: RV }
        >
        function customPayloadCreator<
            ExplicitArg,
            T = R,
            RV = Config['rejectValue']
        >(
            map: {
                params?: (arg: ExplicitArg, state: Config['state']) => P[0]
                body?: (arg: ExplicitArg, state: Config['state']) => P[1]
                config?: (arg: ExplicitArg, state: Config['state']) => P[2]
                select?: (data: R) => T
                reject?: (failure: Err) => RV
            } & ThunkOptions<ExplicitArg> = {}
        ): AsyncThunkPayloadCreator<
            T,
            ExplicitArg,
            Config & { rejectValue: RV }
        > {
            const creator = (async (
                arg,
                { rejectWithValue, getState, signal }
            ) => {
                const state = getState() as Config['state']
                try {
                    // `signal` is the base so abort works by default; an explicit `config`
                    // mapper still wins if it sets its own.
                    const response = await (
                        apiFn as (...args: any[]) => Promise<any>
                    )(map.params?.(arg, state), map.body?.(arg, state), {
                        signal,
                        ...map.config?.(arg, state),
                    })
                    return settle(
                        response,
                        map.select,
                        map.reject,
                        rejectWithValue
                    )
                } catch (error) {
                    if (signal?.aborted) throw error
                    return reject(
                        adapter.fromError(error),
                        map.reject,
                        rejectWithValue
                    )
                }
            }) as AsyncThunkPayloadCreator<
                T,
                ExplicitArg,
                Config & { rejectValue: RV }
            >

            return attachThunkOptions(creator, map, [
                'params',
                'body',
                'config',
                'select',
                'reject',
            ])
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

/**
 * The payload of a thunk's `rejected` action — the `reject()` value (see apiThunkFor), or
 * `undefined` when the thunk rejects by throwing instead of via reject()/rejectWithValue.
 */
type RejectedPayload<T> = T extends { rejected: (...args: any) => infer A }
    ? A extends { payload: infer P }
        ? P
        : never
    : never

type MapFulfilledToState<S, T extends Record<string, any>> = Partial<{
    [K in keyof T]: {
        [SK in keyof S]: FulfilledPayload<T[K]> extends S[SK] ? SK : never
    }[keyof S]
}>

type MapRejectedToState<S, T extends Record<string, any>> = Partial<{
    [K in keyof T]: {
        [SK in keyof S]: RejectedPayload<T[K]> extends S[SK] ? SK : never
    }[keyof S]
}>

export function sliceHelper<S, M extends ActionMap, DefaultCfg>(
    builder: ActionReducerMapBuilder<S>,
    thunks: ThunksOf<M, DefaultCfg>
) {
    // RTK rejects `addCase` after `addMatcher`, which would otherwise make the call order of
    // `mapThunksToState` and `forEach` significant — and it reports that at store creation, far
    // from the slice that caused it. So once a matcher is on the builder we register the
    // remaining single-action reducers as matchers too: a matcher over one action creator fires
    // exactly where its case would have, leaving the two methods usable in either order.
    let matcherRegistered = false

    const addFor = (
        actionCreator: any,
        reducer: (state: Draft<S>, action: PayloadAction<any>) => void
    ) => {
        if (matcherRegistered) {
            builder.addMatcher(isAnyOf(actionCreator), reducer as any)
        } else {
            builder.addCase(actionCreator, reducer as any)
        }
    }

    const forEach = (state: AsyncState, reducer: CaseReducer<S>) => {
        const thunkMatchers = Object.entries(thunks).map(
            ([_, thunk]) => thunk[state]
        )
        builder.addMatcher(isAnyOf(...thunkMatchers), reducer)
        matcherRegistered = true
    }

    // Land each listed thunk's payload in a state field. `fulfilled` maps the success payload
    // (post-`select`); `rejected` maps the reject value (post-`reject`). Each is type-checked
    // against the target field — and the rejected payload includes `undefined` (a thrown
    // rejection carries no payload), so error fields must allow `undefined`.
    function mapThunksToState(
        state: 'fulfilled',
        map: MapFulfilledToState<S, ThunksOf<M, DefaultCfg>>
    ): void
    function mapThunksToState(
        state: 'rejected',
        map: MapRejectedToState<S, ThunksOf<M, DefaultCfg>>
    ): void
    function mapThunksToState(
        state: 'fulfilled' | 'rejected',
        map: Record<string, any>
    ): void {
        Object.entries(map).forEach(([thunkName, stateKey]) => {
            const thunk = thunks[thunkName]
            addFor(
                thunk[state],
                (stateObj: Draft<S>, action: PayloadAction<any>) => {
                    stateObj[stateKey as keyof Draft<S>] = action.payload
                }
            )
        })
    }

    return { forEach, mapThunksToState }
}
