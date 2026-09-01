/* eslint-disable @typescript-eslint/no-namespace */

// Automatically generated types

export namespace Components {
    export namespace Schemas {
        export interface User {
            id: number
            name: string
            email: string
        }

        export interface UserList {
            users: Components.Schemas.User[]
            total: number
        }

        export interface UserEnvelope {
            user: Components.Schemas.User
        }

        export interface NewUser {
            name: string
            email: string
        }

        export interface ApiError {
            detail: string
        }
    }
}

export type User = Components.Schemas.User
export type UserList = Components.Schemas.UserList
export type UserEnvelope = Components.Schemas.UserEnvelope
export type NewUser = Components.Schemas.NewUser
export type ApiError = Components.Schemas.ApiError

export namespace Paths {
    export namespace ListUsers {
        export type RequestBody = undefined

        export namespace Parameters {
            export type Team = string
        }

        export interface PathParameters {}

        export interface QueryParameters {
            team?: Parameters.Team
        }

        export namespace Responses {
            /** application/json */
            export type $200 = Components.Schemas.UserList
        }
    }

    export namespace GetUser {
        export type RequestBody = undefined

        export namespace Parameters {
            export type Id = number
        }

        export interface PathParameters {
            id: Parameters.Id
        }

        export interface QueryParameters {}

        export namespace Responses {
            /** application/json */
            export type $200 = Components.Schemas.UserEnvelope
            /** application/json */
            export type $404 = Components.Schemas.ApiError
        }
    }

    export namespace CreateUser {
        export type RequestBody = Components.Schemas.NewUser

        export namespace Parameters {
            export type TeamId = number
        }

        export interface PathParameters {
            teamId: Parameters.TeamId
        }

        export interface QueryParameters {}

        export namespace Responses {
            /** application/json */
            export type $201 = Components.Schemas.UserEnvelope
        }
    }
}

export interface OperationMethods {
    /**
     * listUsers
     */
    listUsers: (
        parameters?: Parameters<Paths.ListUsers.QueryParameters>,
        data?: undefined,
        config?: AxiosRequestConfig,
    ) => OperationResponse<Paths.ListUsers.Responses.$200>
    /**
     * getUser
     */
    getUser: (
        parameters?: Parameters<Paths.GetUser.PathParameters>,
        data?: undefined,
        config?: AxiosRequestConfig,
    ) => OperationResponse<Paths.GetUser.Responses.$200>
    /**
     * createUser
     */
    createUser: (
        parameters?: Parameters<Paths.CreateUser.PathParameters>,
        data?: Paths.CreateUser.RequestBody,
        config?: AxiosRequestConfig,
    ) => OperationResponse<Paths.CreateUser.Responses.$201>
}

export interface PathsDictionary {
    '/users': {
        get: (
            parameters?: Parameters<Paths.ListUsers.QueryParameters>,
            data?: undefined,
            config?: AxiosRequestConfig,
        ) => OperationResponse<Paths.ListUsers.Responses.$200>
    }
    '/users/{id}': {
        get: (
            parameters?: Parameters<Paths.GetUser.PathParameters>,
            data?: undefined,
            config?: AxiosRequestConfig,
        ) => OperationResponse<Paths.GetUser.Responses.$200>
    }
    '/teams/{teamId}/users': {
        post: (
            parameters?: Parameters<Paths.CreateUser.PathParameters>,
            data?: Paths.CreateUser.RequestBody,
            config?: AxiosRequestConfig,
        ) => OperationResponse<Paths.CreateUser.Responses.$201>
    }
}

export const apiMetadata = {
    listUsers: {
        paramsKeys: [],
        queryKeys: ['team'],
        bodyKeys: [],
    },
    getUser: {
        paramsKeys: ['id'],
        queryKeys: [],
        bodyKeys: [],
    },
    createUser: {
        paramsKeys: ['teamId'],
        queryKeys: [],
        bodyKeys: ['name', 'email'],
    },
} as const satisfies ApiMetaShape

type ApiMetaShape = Record<
    string,
    {
        paramsKeys: readonly string[]
        queryKeys: readonly string[]
        bodyKeys: readonly string[]
    }
>

export type ApiMeta = typeof apiMetadata

export type ImplicitParamValue = string | number
export interface UnknownParamsObject {
    [parameter: string]: ImplicitParamValue
}
export type SingleParam = ImplicitParamValue
export type Parameters<ParamsObject = UnknownParamsObject> = ParamsObject | SingleParam
export type OperationResponse<T = any> = Promise<T>
export type AxiosRequestConfig = any
