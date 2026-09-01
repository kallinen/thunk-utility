import { createServer, type Server } from 'node:http'

type User = { id: number; name: string; email: string }

const users: User[] = [
    { id: 1, name: 'Ada Lovelace', email: 'ada@example.com' },
    { id: 2, name: 'Grace Hopper', email: 'grace@example.com' },
]

/**
 * The backend the example talks to. A real HTTP server on an ephemeral port, so the requests,
 * the 404 and the JSON error body are all genuine — nothing is stubbed.
 */
export const startServer = (): Promise<{ url: string; close: () => void }> => {
    const server: Server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const json = (status: number, body: unknown) => {
            res.writeHead(status, { 'content-type': 'application/json' })
            res.end(JSON.stringify(body))
        }

        if (req.method === 'GET' && url.pathname === '/users') {
            return json(200, { users, total: users.length })
        }

        const byId = url.pathname.match(/^\/users\/(\d+)$/)
        if (req.method === 'GET' && byId) {
            const user = users.find((u) => u.id === Number(byId[1]))
            return user
                ? json(200, { user })
                : json(404, { detail: `No user ${byId[1]}` })
        }

        const create = url.pathname.match(/^\/teams\/(\d+)\/users$/)
        if (req.method === 'POST' && create) {
            let raw = ''
            req.on('data', (chunk) => (raw += chunk))
            req.on('end', () => {
                const body = JSON.parse(raw || '{}')
                const user: User = {
                    id: users.length + 1,
                    name: body.name,
                    email: body.email,
                }
                users.push(user)
                json(201, { user })
            })
            return
        }

        json(404, { detail: 'Not found' })
    })

    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const address = server.address()
            const port = typeof address === 'object' && address ? address.port : 0
            resolve({
                url: `http://127.0.0.1:${port}`,
                close: () => server.close(),
            })
        })
    })
}
