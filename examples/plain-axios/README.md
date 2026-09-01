# Example: plain axios

The same app as [`../openapi-client`](../openapi-client), with a hand-written axios client instead
of a generated one. No OpenAPI spec, no code generation, no metadata.

```bash
npm run build      # in the repo root first
npm install
npm start
```

### What to look at

- **`src/api.ts`** — an ordinary axios client. Note the third parameter on every method: that is
  where thunk-utility passes the thunk's `AbortSignal`, and axios understands it natively.
- **`src/store.ts`** — `client: AxiosClient` on the `Config` switches the types over, `adapter:
  axiosAdapter` is the runtime half. Both are declared once; no call site mentions axios again.
- **`params` / `body` mappers** — axios functions carry no metadata, so the mapping is explicit. In
  exchange the dispatch argument is whatever you want: `getUser` takes a bare `number` here.
- **`reject`** — axios *throws* on a non-2xx, so the failure is assembled from the `AxiosError`.
  `failure.data` is the error body the server sent, which is why the run prints `"No user 999"`
  rather than a generic message.

### Try breaking it

Delete `adapter: axiosAdapter` from `src/store.ts` and run `npm start`. The request still succeeds,
but the default adapter finds no `ok` field and would treat it as a failure — so the library warns
you that the response looks like axios. That warning is the safety net for the one case the types
cannot catch (omitting the options argument entirely).
