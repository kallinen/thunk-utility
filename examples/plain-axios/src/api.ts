import axios, { type AxiosInstance } from 'axios'

export type User = { id: number; name: string; email: string }
export type UserList = { users: User[]; total: number }
export type UserEnvelope = { user: User }

/**
 * A hand-written axios client — no OpenAPI, no code generation, no metadata. Each method resolves
 * with an `AxiosResponse` and throws an `AxiosError` on anything but a 2xx, which is exactly what
 * `axiosAdapter` expects.
 *
 * Note the third parameter on every method: thunk-utility passes the thunk's `AbortSignal` there,
 * and axios understands it natively — that's all cancellation needs.
 */
export const createApi = (baseURL: string) => {
    const http: AxiosInstance = axios.create({ baseURL })

    return {
        listUsers: (params?: { team?: string }, _body?: undefined, config?: object) =>
            http.get<UserList>('/users', { params, ...config }),

        getUser: (params: { id: number }, _body?: undefined, config?: object) =>
            http.get<UserEnvelope>(`/users/${params.id}`, config),

        createUser: (
            params: { teamId: number },
            body: { name: string; email: string },
            config?: object
        ) => http.post<UserEnvelope>(`/teams/${params.teamId}/users`, body, config),
    }
}

export type Api = ReturnType<typeof createApi>
