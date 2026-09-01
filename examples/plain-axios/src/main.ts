import { startServer } from './server.js'
import { buildStore } from './store.js'

const show = (label: string, state: unknown) =>
    console.log(`\n${label}\n${JSON.stringify(state, null, 2)}`)

const main = async () => {
    const server = await startServer()
    const { store, thunks } = buildStore(server.url)

    // The dispatch argument is whatever the `params` mapper says it is.
    await store.dispatch(thunks.listUsers())
    show('listUsers — payload is data.users, unwrapped from the AxiosResponse', store.getState().users)

    // The mapper takes a bare number and builds the request from it.
    await store.dispatch(thunks.getUser(1))
    show('getUser(1) — arg mapped by params()', store.getState().users.current)

    // One flat object, split by the `params` and `body` mappers rather than by metadata.
    await store.dispatch(
        thunks.createUser({
            teamId: 7,
            name: 'Radia Perlman',
            email: 'radia@example.com',
        })
    )
    show('createUser — one object, split by the mappers', store.getState().users.current)

    // A thrown AxiosError becomes a rejected action; the payload came from the factory's `reject`,
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
