# @kallinen/thunk-utility

Typed Redux Toolkit thunks. Built to pair with **@kallinen/openapi-axios-client** — it reads that
client's metadata to split dispatch arguments into params and body.

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

## Install

```bash
npm install @kallinen/thunk-utility
```

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
// No arguments
getUsers: apiThunkFor(api.listUsers)()
// dispatch(thunks.getUsers())
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

`createThunks` takes a third argument: `createAsyncThunk` options per thunk, typed against that
thunk's own arg and your `Config`. The usual case is skipping a dispatch that's already in flight:

```ts
export const thunks = createThunks(
    {
        getUsers: apiThunkFor(api.listUsers)(),
        getUser: apiThunkFor(api.getUser)(),
    },
    'users',
    {
        getUsers: {
            condition: (_arg, { getState }) => !getState().users.fetching,
        },
    }
)
```

For something that should apply everywhere, set `thunkOptions` on the factory. The two merge
shallowly and the per-thunk entry wins key by key:

```ts
const { createThunks, apiThunkFor } = createThunkFactory<ThunkState>(apiMetadata, {
    thunkOptions: { condition: (_arg, { getState }) => !getState().app.offline },
})
```

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

## Setup notes

- `apiThunkFor` needs functions generated by `@kallinen/openapi-axios-client` (they carry
  `__meta.key`) plus the matching `apiMetadata` passed to `createThunkFactory`. Without metadata,
  arguments are dropped and a warning is emitted (see [Warnings](#warnings)).
- The factory's `Config` is your `{ state; dispatch; rejectValue? }` — the same `ThunkApiConfig`
  Redux Toolkit uses. A per-thunk `reject` overrides `rejectValue` for that thunk.
- Create the factory **once** in a shared module and import `{ createThunks, apiThunkFor, … }`
  across your slices — it has no runtime dependency on the store (the `Config`/`ThunkState` is a
  type-only import), so there's no circular-import problem and no need to re-create it per slice.
