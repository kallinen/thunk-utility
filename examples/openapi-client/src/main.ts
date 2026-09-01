import { startServer } from './server.js'
import { buildStore } from './store.js'

const show = (label: string, state: unknown) =>
    console.log(`\n${label}\n${JSON.stringify(state, null, 2)}`)

const main = async () => {
    const server = await startServer()
    const { store, thunks } = buildStore(server.url)

    // Every parameter of `listUsers` is optional, so it dispatches with no argument at all.
    await store.dispatch(thunks.listUsers())
    show('listUsers — payload is data.users, not the envelope', store.getState().users)

    // One path parameter, dispatched as a bare value. `thunks.getUser({ id: 1 })` also works.
    await store.dispatch(thunks.getUser(1))
    show('getUser(1) — bare scalar shortcut', store.getState().users.current)

    // One flat object, split by the generated metadata: teamId is a path param, name and email
    // are the request body. Nothing here says which is which — apiMetadata does.
    await store.dispatch(
        thunks.createUser({
            teamId: 7,
            name: 'Radia Perlman',
            email: 'radia@example.com',
        })
    )
    show('createUser — one object, split into params and body', store.getState().users.current)

    // A 404 becomes a rejected action whose payload came from the factory's default `reject`.
    const failed = await store.dispatch(thunks.getUser(999))
    show('getUser(999) — rejected', {
        payload: failed.payload,
        stateError: store.getState().users.error,
    })

    // Cancellation reaches the HTTP request, not just the thunk.
    const inFlight = store.dispatch(thunks.listUsers())
    inFlight.abort()
    const aborted = await inFlight
    show('listUsers aborted', {
        aborted: 'aborted' in aborted.meta ? aborted.meta.aborted : false,
        payload: aborted.payload,
    })

    server.close()
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
