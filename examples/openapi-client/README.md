# Example: `@kallinen/openapi-axios-client`

Thunks generated from an OpenAPI spec, end to end: `openapi.json` → generated types + `apiMetadata`
→ a typed client → thunks → a slice. Nothing in `src/store.ts` restates a request or response type.

```bash
npm run build      # in the repo root first
npm install
npm start
```

`npm run generate` regenerates `src/generated/api-types.ts` from `openapi.json`. The generated file
is checked in so the example runs without it.

### What to look at

- **`src/store.ts`** — the whole wiring, in four numbered steps: client, factory, thunks, slice.
- **`openapi.json` → `apiMetadata`** — the generator records which keys are path parameters, query
  parameters and body fields. That table is what lets `createUser` take one flat object.
- **`src/main.ts`** — dispatches, and prints the state after each.

### Try breaking it

Change `select: (data) => data.users` to `data.user` in `src/store.ts` and run `npm run typecheck`:
the error is in the slice, at the state field the payload no longer fits — not at runtime in a
component. Same if you edit a type in `openapi.json` and regenerate.
