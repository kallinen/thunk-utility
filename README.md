[![npm module](https://badge.fury.io/js/@kallinen%2Fthunk-utility.svg)](https://www.npmjs.org/package/@kallinen/thunk-utility)
[![CI](https://github.com/kallinen/thunk-utility/actions/workflows/ci.yml/badge.svg)](https://github.com/kallinen/thunk-utility/actions/workflows/ci.yml)

# @kallinen/thunk-utility

Typed Redux Toolkit thunks, without the boilerplate. Same thunk, same store, same slices — one line
instead of twenty, and every type still inferred.

**Before** — a hand-written `createAsyncThunk`: three type parameters, a failure branch, a try/catch,
and an abort re-throw, repeated for every endpoint.

```ts
export const getUser = createAsyncThunk<
    User,
    { id: number },
    { state: RootState; rejectValue: string }
>('users/getUser', async ({ id }, { rejectWithValue, signal }) => {
    try {
        const res = await api.getUser({ id }, undefined, { signal })
        if (!res.ok) return rejectWithValue(res.problem)
        return res.data.user
    } catch (e) {
        if (signal.aborted) throw e
        return rejectWithValue('UNKNOWN_ERROR')
    }
})
```

**After** — the same thunk. The argument type, the payload type and the reject value are inferred
from the api function; cancellation and thrown errors are handled for you.

```ts
export const thunks = createThunks(
    { getUser: apiThunkFor(api.getUser)({ select: (data) => data.user }) },
    'users'
)

dispatch(thunks.getUser(5))
```

Pairs with **@kallinen/openapi-axios-client**, and works with any api function that resolves to
`{ ok, data }` — see [Plain axios](#plain-axios) and [Using another client](#using-another-client).

## Why

Writing Redux Toolkit thunks is repetitive. Most of them call an API function, map the response, and
update state. This library removes that boilerplate while preserving full type inference.

The guiding principle: **the common path requires no configuration.** Most thunks are just
`apiThunkFor(api.someEndpoint)()`. When that isn't enough you opt into one small, focused
customization — `select` for the payload shape, `reject` for errors, `customApiThunkFor` for the
argument mapping — rather than rewriting the thunk.

This is all it takes to get fully typed thunks:

```ts
const thunks = createThunks({
    getUsers: apiThunkFor(api.listUsers)(),
    getUser: apiThunkFor(api.getUser)(),
    createUser: apiThunkFor(api.createUser)(),
    getNames: apiThunkFor(api.listUsers)({
        select: (data) => data.users,
    }),
})
```

Your IDE already knows exactly what each thunk accepts and what it returns. No payload or response
types to duplicate — the dispatch argument, fulfilled payload and rejected payload are all inferred
directly from the generated API definition.

```ts
dispatch(thunks.getUser(5))
dispatch(thunks.createUser({
    teamId: 1,
    name: 'Ada',
    email: 'ada@example.com'
}))
```

**If your OpenAPI specification changes, the generated client changes. If the client changes, your
thunks change. If your thunks change, TypeScript tells you exactly where your UI needs attention.**

The result is less boilerplate and fewer opportunities for bugs.

## How it compares

**vs. RTK Query.** RTK Query owns the data: its own cache, its own slice, a tag-based invalidation
model, usually read through generated hooks. This library owns nothing — it produces ordinary
`createAsyncThunk` thunks whose results land in **your** slices, through your reducers.

The difference that matters day to day is where the types come from, and where they stop.

In RTK Query's default setup you declare them: `build.query<Post, number>` names the result type and
the argument type per endpoint, `Post` is an interface you maintain, and `transformResponse` needs
the raw response shape annotated by hand before you can project it. Here all three are read off the
api function — the dispatch argument, the `data` handed to `select`, and the resulting payload — so
there's nothing to restate and nothing to drift.

And the chain doesn't stop at the boundary. RTK Query types the hand-off: the hook gives you typed
data, and past that you're in your own code. Here `select` types the payload, `reject` types the
rejected payload, and `mapThunksToState` checks that payload against the **state field** you land it
in. Point a thunk at a field whose type no longer fits and it's a compile error in your slice, not
`undefined` in a component — the spec-to-UI chain above holds through your reducers too. That's the
whole job of writing a thunk, typed end to end, with nothing left for you to declare by hand.

So: reach for RTK Query when you want caching, deduplication and refetching handed to you — that's
its job and it does it well, and this library doesn't try to. Reach for this when the server data
belongs in your state tree next to local state, when you already have slices and selectors you'd
rather not migrate, or when you want your existing api client to stay the thing that talks to the
network.

**vs. hand-written `createAsyncThunk`.** That's the [before/after](#kallinenthunk-utility) at the top
of this page. Identical output, minus the type parameters and the failure plumbing you'd otherwise
repeat per endpoint. Nothing is hidden: the thunks are RTK thunks, `dispatch(...)` returns the usual
promise, `.abort()` works, and you can drop back to a plain async function in the same
`createThunks` map whenever an endpoint doesn't fit.

**vs. generating RTK Query endpoints from OpenAPI.** `@rtk-query/codegen-openapi` closes the
hand-authored-types gap above — its endpoints come from the spec, same as this does. What's left is
the architectural trade: codegen for RTK Query gives you hooks and a cache; this gives you thunks and
leaves the state to you. Both start from the same spec, so the choice is about where the data should
live, not about how much typing you'll do.

**Size:** ~2 KB gzipped, no runtime dependencies (`@reduxjs/toolkit` is a peer dependency), and
`sideEffects: false` for tree-shaking.

## Adding it to an existing codebase

Nothing here replaces Redux Toolkit — it *is* Redux Toolkit. `createThunks` calls
`createAsyncThunk`, so the actions are the usual `users/getUsers/pending` triples, DevTools shows
what it always showed, your middleware, persistence and selectors are untouched, and
`dispatch(thunk())` returns the same promise with the same `.unwrap()` and `.abort()`. There is no
provider to add, no store enhancer, no new mental model — a factory call and a map of thunks.

That means adoption is incremental. A slice can hold converted thunks and hand-written ones at the
same time, and `sliceHelper` takes the `builder` you already have, so existing `addCase` calls stay
where they are:

```ts
const slice = createSlice({
    name: 'users',
    initialState,
    reducers: {},
    extraReducers: (builder) => {
        // still here, untouched
        builder.addCase(myOldThunk.fulfilled, (s, a) => { s.legacy = a.payload })

        // converted one endpoint at a time
        const helper = sliceHelper(builder, thunks)
        helper.mapThunksToState('fulfilled', { getUser: 'user' })
        helper.forEach('pending', (s) => { s.fetching = true })
        helper.forEach('fulfilled', (s) => { s.fetching = false })
    },
})
```

Convert one slice, ship it, convert the next — or leave a slice alone forever if it's happy.

`mapThunksToState` and `forEach` can be called in either order, and your own `addCase` calls can sit
above or below them. (Redux Toolkit itself refuses `addCase` after `addMatcher`; `sliceHelper`
registers around that so the rule never reaches you.)

## Examples

Two runnable apps in [`examples/`](./examples) — the same app against the same backend, one using
`@kallinen/openapi-axios-client` and one using [plain axios](./examples/plain-axios). Both start a
real server, dispatch the same thunks and print the state after each, so the difference between the
two client styles is a diff rather than a paragraph.

```bash
npm run build && cd examples/plain-axios && npm install && npm start
```

## Install

```bash
npm install @kallinen/thunk-utility
```

Redux Toolkit 2.x is a peer dependency — `npm install @reduxjs/toolkit` if you don't have it. Node
18 or newer.

## Quick start

Everything starts from a single factory. It captures your store's thunk configuration and the
generated API metadata once, then you reuse it across all your slices:

```ts
const { createThunks, apiThunkFor, customApiThunkFor } =
    createThunkFactory<ThunkState>(apiMetadata)
```

Name the thunks with a namespace, then land results in state with the slice helper — no per-thunk
reducers:

```ts
export const thunks = createThunks({
    getUsers: apiThunkFor(api.listUsers)(),
}, 'users')

const slice = createSlice({
    name: 'users',
    initialState: { users: null as Users | null, fetching: false },
    reducers: {},
    extraReducers: (builder) => {
        const helper = sliceHelper(builder, thunks)
        helper.mapThunksToState('fulfilled', { getUsers: 'users' })
        helper.forEach('pending', (s) => { s.fetching = true })
        helper.forEach('fulfilled', (s) => { s.fetching = false })
        helper.forEach('rejected', (s) => { s.fetching = false })
    },
})
```

That's the whole wiring. `mapThunksToState` drops each thunk's payload into a state field, and
`forEach` runs one reducer across every thunk — here a shared `fetching` flag. `sliceHelper` is a
plain import from the package, not part of the factory; both methods are covered in full under
[`sliceHelper`](#slicehelper).

## `apiThunkFor`

Wraps an api-client function. It reads the function's metadata (`__meta.key` + the `apiMetadata`
map) to split one dispatch argument into path/query params and the request body.

```ts
// No arguments — also when every parameter the operation takes is optional
getUsers: apiThunkFor(api.listUsers)()
// dispatch(thunks.getUsers())
// dispatch(thunks.getUsers({ team: 'core' }))   // if it has optional query params
```

```ts
// Single param — dispatch the bare value or the object form
getUser: apiThunkFor(api.getUser)()
// dispatch(thunks.getUser(5))
// dispatch(thunks.getUser({ id: 5 }))
```

```ts
// Params + body split automatically from one object
createUser: apiThunkFor(api.createUser)()
// dispatch(thunks.createUser({ teamId: 1, name: 'Ada', email: 'ada@x.io' }))
// → path/query: { teamId }, body: { name, email }
```

The fulfilled payload is inferred from the api function's response type.

## `select` — shape the payload

Projects the success body into what you store. Its return type becomes the payload type; omit it
to keep the whole body.

```ts
getUsers: apiThunkFor(api.listUsers)({ select: (data) => data.users })
// payload: User[]  (not { users: User[] })
```

```ts
getName: apiThunkFor(api.getUser)({ select: (data) => data.user.name })
// payload: string
```

## `reject` — shape the failure

Maps the **failure** (the `ok: false` response — `status`, `problem`, `originalError`, …) into
the rejected action's payload. It's a transform, not a swallow: the thunk still rejects. Its
return type becomes that thunk's rejected-payload type.

```ts
getUser: apiThunkFor(api.getUser)({
    reject: (failure) => (failure.status === 404 ? 'Not found' : 'Request failed'),
})
// getUser.rejected.payload: string
```

```ts
// Any shape you like
getUser: apiThunkFor(api.getUser)({
    reject: (failure) => ({ status: failure.status, detail: failure.problem }),
})
```

Land it in state — the mirror of the fulfilled mapping:

```ts
helper.mapThunksToState('fulfilled', { getUser: 'user' })
helper.mapThunksToState('rejected', { getUser: 'userError' }) // typed against the reject value
```

The rejected payload includes `undefined` (a thrown rejection has no reject value), so the field
must allow it: `userError: MyError | undefined`.

`select` and `reject` combine; both callback arguments are fully typed.

### Factory default

Give `createThunkFactory` a default `reject` and every thunk without its own inherits it — handy
for normalizing all failures into one app error type:

```ts
const { createThunks, apiThunkFor } = createThunkFactory<ThunkState>(apiMetadata, {
    reject: (failure) => ({ status: failure.status, message: failure.problem }),
})
```

Set `rejectValue` in your `Config` so the default's shape flows into the rejected payload type;
a per-thunk `reject` still overrides it.

### Thrown errors

The api client reports failures as an `ok: false` response rather than throwing, so `reject` covers
the normal path. If something outside that contract does throw — an interceptor, a transport that
never produced a response — the error is still routed through the same `reject`, shaped like a
failure response:

```ts
{ ok: false, problem: 'UNKNOWN_ERROR', originalError: <the thrown error>, status: 0 }
```

`status: 0` means no response was received. Aborts are the exception: they stay aborts, so
`action.meta.aborted` still works and no reject value is produced.

## Cancellation

Every thunk forwards its `AbortSignal` to the api client as the request config, so aborting the
thunk aborts the in-flight HTTP request:

```ts
const promise = dispatch(thunks.getUsers())
promise.abort() // cancels the request, not just the thunk
```

`customApiThunkFor` uses the signal as the base config — a `config` mapper is merged over it, so
you can add headers without losing cancellation (or override `signal` explicitly to opt out).

## Thunk options — `condition`, `idGenerator`, …

`createAsyncThunk`'s options go next to `select` and `reject`, on the thunk they belong to. They're
typed against that thunk's own arg and your `Config`. The usual case is skipping a dispatch that's
already in flight:

```ts
export const thunks = createThunks(
    {
        getUsers: apiThunkFor(api.listUsers)({
            condition: (_arg, { getState }) => !getState().users.fetching,
        }),
        getUser: apiThunkFor(api.getUser)(),
    },
    'users'
)
```

They combine freely with `select` and `reject` — one object, one thunk:

```ts
getUsers: apiThunkFor(api.listUsers)({
    select: (data) => data.users,
    condition: (_arg, { getState }) => !getState().users.fetching,
})
```

The same keys work on `customApiThunkFor`, alongside its `params`/`body`/`config` mappers.

For something that should apply everywhere, set `thunkOptions` on the factory:

```ts
const { createThunks, apiThunkFor } = createThunkFactory<ThunkState>(apiMetadata, {
    thunkOptions: { condition: (_arg, { getState }) => !getState().app.offline },
})
```

The two merge shallowly, and what's on the thunk wins key by key.

> **0.9.0** — `createThunks` used to take a third argument, the same options keyed by thunk name.
> It's gone: it did nothing the form above doesn't. Move each entry into its thunk's own options
> object. A hand-written payload creator that needs `condition` now goes through RTK's
> `createAsyncThunk` directly.

## Warnings

`apiThunkFor` warns when a dispatch argument carries keys no metadata claims — those keys are
dropped, so silence would hide the bug. It goes to `console.warn` by default; redirect or silence
it yourself:

```ts
createThunkFactory<ThunkState>(apiMetadata, { onWarning: myLogger.warn })
createThunkFactory<ThunkState>(apiMetadata, { onWarning: false })
```

## `customApiThunkFor` — custom argument mapping

`apiThunkFor` covers the common case. Use `customApiThunkFor` when the dispatch argument doesn't map
1:1 onto the request.

Provide `params`, `body` and `config` mappers to build the request manually. Each mapper also
receives the current Redux state.

```ts
// Explicit arg type — the common case
searchUsers: customApiThunkFor(api.searchUsers)<{ term: string }>({
    params: (arg) => ({ q: arg.term, limit: 20 }),
})
```

```ts
// Read from state
refresh: customApiThunkFor(api.listUsers)<void>({
    params: (_arg, state) => ({ teamId: state.team.id }),
})
```

To use `select` here, annotate the arg instead of passing `<Arg>` (TypeScript can't both take an
explicit type argument and infer the projected type):

```ts
searchNames: customApiThunkFor(api.searchUsers)({
    params: (arg: { term: string }) => ({ q: arg.term }),
    select: (data) => data.users.map((u) => u.name),
})
```

`reject` works the same as on `apiThunkFor`.

## `sliceHelper`

```ts
const helper = sliceHelper(builder, thunks)
```

`mapThunksToState(state, map)` drops each thunk's payload into a state field. `fulfilled` maps the
success payload, `rejected` maps the reject value — each type-checked against the target field:

```ts
helper.mapThunksToState('fulfilled', { getUsers: 'users', getUser: 'user' })
helper.mapThunksToState('rejected', { getUser: 'userError' })
```

`forEach(state, reducer)` runs one reducer across every thunk's pending/fulfilled/rejected —
handy for a shared loading flag:

```ts
helper.forEach('pending', (s) => { s.fetching = true })
helper.forEach('fulfilled', (s) => { s.fetching = false })
helper.forEach('rejected', (s) => { s.fetching = false })
```

Both methods may be called in any order, as many times as you like, and alongside your own
`builder.addCase` / `builder.addMatcher` calls.

## Plain thunks

Anything that isn't a metadata-driven api call is just an async function in `createThunks` — the
return value is the payload:

```ts
export const thunks = createThunks({
    fetchUser: async (id: number, { getState, dispatch }) => {
        const res = await fetch(`/users/${id}`)
        return (await res.json()) as User
    },
}, 'users')
```

## Plain axios

Axios doesn't report failures as values — it resolves only on success and **throws** on everything
else. Tell the factory which contract your client follows and it adapts: declare `client` on your
`Config` and pass the matching adapter.

```ts
import { createThunkFactory, axiosAdapter } from '@kallinen/thunk-utility'

type ThunkState = {
    state: RootState
    rejectValue: AppError
    client: 'axios'
}

const { createThunks, customApiThunkFor } =
    createThunkFactory<ThunkState>(apiMetadata, { adapter: axiosAdapter })
```

Every call site then reads exactly as before — the difference is entirely in what the types resolve
to and how a failure is unpacked:

```ts
getUser: customApiThunkFor(api.getUser)({
    params: (arg: { id: number }) => arg,
    select: (data) => data.user,          // AxiosResponse['data'], not the envelope
    reject: (failure) => failure.data,    // the error body the server sent
})
```

`reject` receives an `AxiosFailure` assembled from the thrown `AxiosError`:

```ts
{ ok: false, status: 422, problem: 'ERR_BAD_REQUEST', data: <error body>, originalError: <AxiosError> }
```

`status: 0` means the request never got a response (a network error). Aborts still abort — an axios
`CanceledError` is left alone, so `action.meta.aborted` works as it does everywhere else.

Two things worth knowing. The `client` field lives on the `Config` **type** rather than being
inferred from the adapter value, because naming `Config` explicitly stops TypeScript from inferring
any later type parameter — it would silently keep the default types. And since plain axios functions
carry no metadata, this pairs with `customApiThunkFor`, where you map the arguments anyway; if you
forget the adapter entirely, the first response triggers a warning rather than being misread as a
failure.

## Using another client

The default contract is a **result-shaped** response: an api function that resolves to
`{ ok: true, data }` on success and `{ ok: false, ... }` on failure — what
[apisauce](https://github.com/infinitered/apisauce) and `@kallinen/openapi-axios-client` both
return. Anything that resolves to that works with no adapter at all, including a function you write
by hand:

```ts
const getUser = async (
    params: { id: number },
    _body?: undefined,
    config?: { signal?: AbortSignal }
) => {
    const res = await fetch(`/users/${params.id}`, config)
    return res.ok
        ? { ok: true as const, data: (await res.json()) as User }
        : { ok: false as const, problem: res.statusText, status: res.status }
}

export const thunks = createThunks(
    {
        getUser: customApiThunkFor(getUser)({
            params: (arg: { id: number }) => arg,
            select: (data) => data.name,
            reject: (failure) => `HTTP ${failure.status}`,
        }),
    },
    'users'
)
```

`select` gets `User`, `reject` gets the `ok: false` branch, and the third parameter receives the
thunk's `AbortSignal` — all inferred, no metadata involved.

For a client that is neither shape, write a `ResponseAdapter` of your own — `toResult` splits a
resolved response into success or failure, `fromError` turns a thrown one into a failure — and pass
it the same way `axiosAdapter` is passed above.

What `@kallinen/openapi-axios-client` adds is the **automatic argument splitting** in `apiThunkFor`:
its generated functions carry a `__meta.key` that the `apiMetadata` map resolves into params/query/body
key lists, which is how one flat dispatch object gets routed to the right place. Without that
metadata, use `customApiThunkFor` and map the arguments yourself, as above.

## Setup notes

- `apiThunkFor`'s argument splitting needs functions generated by `@kallinen/openapi-axios-client`
  (they carry `__meta.key`) plus the matching `apiMetadata` passed to `createThunkFactory`. Without
  metadata, arguments are dropped and a warning is emitted (see [Warnings](#warnings)); use
  `customApiThunkFor` instead (see [Using another client](#using-another-client)).
- The factory's `Config` is your `{ state; dispatch; rejectValue? }` — the same `ThunkApiConfig`
  Redux Toolkit uses. A per-thunk `reject` overrides `rejectValue` for that thunk.
- Create the factory **once** in a shared module and import `{ createThunks, apiThunkFor, … }`
  across your slices — it has no runtime dependency on the store (the `Config`/`ThunkState` is a
  type-only import), so there's no circular-import problem and no need to re-create it per slice.
