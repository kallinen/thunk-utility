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
        >(namespace ? `${namespace}/${k}` : k, actionTypes[key]) as ThunksOf<
            M,
            DefaultCfg
        >[typeof key]
    }
    return result
}

export function createThunkFactory<Config extends AsyncThunkConfig>() {
    function apiThunkFor<R, P extends any[]>(
        apiFn: (...args: P) => Promise<{ ok: true; data: R } | { ok: false }>
    ) {
        return function (map: {
            params?: (arg: ThunkArg<P>, state: Config['state']) => P[0]
            body?: (arg: ThunkArg<P>, state: Config['state']) => P[1]
            config?: (arg: ThunkArg<P>, state: Config['state']) => P[2]
        }): AsyncThunkPayloadCreator<R, ThunkArg<P>, Config> {
            return (async (arg, { rejectWithValue, getState }) => {
                const state = getState() as Config['state']
                const response = await (
                    apiFn as (
                        ...args: any[]
                    ) => Promise<
                        { ok: true; data: R } | { ok: false; problem: any }
                    >
                )(
                    map.params?.(arg, state),
                    map.body?.(arg, state),
                    map.config?.(arg, state)
                )
                if (response.ok) return response.data as R
                return rejectWithValue(response.problem, {} as any)
            }) as AsyncThunkPayloadCreator<R, ThunkArg<P>, Config>
        }
    }

    function customApiThunkFor<R, P extends any[]>(
        apiFn: (...args: P) => Promise<{ ok: true; data: R } | { ok: false }>
    ) {
        return function <ExplicitArg extends Record<string, any>>(map: {
            params?: (arg: ExplicitArg, state: Config['state']) => P[0]
            body?: (arg: ExplicitArg, state: Config['state']) => P[1]
            config?: (arg: ExplicitArg, state: Config['state']) => P[2]
        }): AsyncThunkPayloadCreator<R, ExplicitArg, Config> {
            return (async (arg, { rejectWithValue, getState }) => {
                const state = getState() as Config['state']
                const response = await (
                    apiFn as (
                        ...args: any[]
                    ) => Promise<
                        { ok: true; data: R } | { ok: false; problem: any }
                    >
                )(
                    map.params?.(arg, state),
                    map.body?.(arg, state),
                    map.config?.(arg, state)
                )
                if (response.ok) return response.data as R
                return rejectWithValue(response.problem, {} as any)
            }) as AsyncThunkPayloadCreator<R, ExplicitArg, Config>
        }
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
        [SK in keyof S]: FulfilledPayload<T[K]> extends NonNullable<S[SK]>
            ? SK
            : never
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

type OnlyObject<T> = Extract<T, Record<string, any>>

type Merge<A, B> = [A] extends [never]
    ? B
    : [B] extends [never]
    ? A
    : {
          [K in keyof A | keyof B]: K extends keyof B
              ? B[K]
              : K extends keyof A
              ? A[K]
              : never
      }

type ThunkArg<P extends any[]> = Merge<
    OnlyObject<NonNullable<P[0]>>,
    OnlyObject<NonNullable<P[1]>>
> extends never
    ? void
    : Merge<OnlyObject<NonNullable<P[0]>>, OnlyObject<NonNullable<P[1]>>>
