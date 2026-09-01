# Examples

Two runnable apps that do **the same thing** against **the same backend**, so you can diff them and
see exactly what changes between client styles.

| | [`openapi-client`](./openapi-client) | [`plain-axios`](./plain-axios) |
| --- | --- | --- |
| Client | `@kallinen/openapi-axios-client`, generated from a spec | hand-written `axios` calls |
| Response contract | `{ ok, data }` (the default) | resolves on success, throws on failure |
| Factory | `createThunkFactory<Config>(apiMetadata)` | `createThunkFactory<Config>({}, { adapter: axiosAdapter })` |
| Thunks | `apiThunkFor` — arguments split by metadata | `customApiThunkFor` — arguments mapped by hand |
| Types come from | the OpenAPI spec | the axios generics you write |

Both start a real HTTP server on an ephemeral port, dispatch the same five thunks, and print the
state after each one. Nothing is mocked — the 404 is a real 404.

```bash
npm run build          # in the repo root first: the examples link the local package
cd examples/plain-axios
npm install
npm start
```

What each run demonstrates, in order:

1. **A list endpoint** — `select` projects `data.users`, so the payload is `User[]` rather than the
   response envelope.
2. **A single-parameter endpoint** — dispatched with a bare value.
3. **A create endpoint** — one flat dispatch object split into path parameters and a request body.
4. **A failure** — a 404 becomes a rejected action whose payload came from the factory's default
   `reject`, landed in a state field by `mapThunksToState`.
5. **Cancellation** — `.abort()` cancels the in-flight HTTP request and the action reports
   `meta.aborted`.

The interesting difference is step 3. With the generated client, `apiMetadata` already knows that
`teamId` is a path parameter while `name` and `email` are body fields, so one flat object routes
itself. With plain axios there is no metadata, so `params` and `body` mappers say it explicitly —
in exchange, the dispatch argument can be any shape you like, independent of the request.

Step 4 differs too: the axios example reads the server's error body out of `failure.data`
(`"No user 999"`), while the result-shaped client reports `"Not found"` from the status code.
