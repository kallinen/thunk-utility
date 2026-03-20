import {
    AsyncThunk,
    AsyncThunkConfig,
    AsyncThunkPayloadCreator,
    createAsyncThunk,
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
    return function createBoundThunks<
        M extends Record<string, AsyncThunkPayloadCreator<any, any, Config>>
    >(map: M, namespace?: string) {
        return createThunks<M, Config>(map, namespace)
    }
}
