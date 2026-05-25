import http from 'node:http'
import { WebSocketServer } from 'ws'
import { routes } from '../shared/routes.ts'
import { CallbackManager, PubSub } from './callback-manager.ts'
import { handleHealth } from './handlers/health.ts'
import {
  cleanupSession,
  clearSessions,
  createSession,
  getPlainBuffer,
  getRawBuffer,
  getSession,
  getSessions,
  killSession,
  sendInput,
} from './handlers/sessions.ts'
import { buildStaticRoutes, type StaticFile } from './handlers/static.ts'
import { handleUpgrade } from './handlers/upgrade.ts'
import { handleWebSocketMessage } from './handlers/websocket.ts'

type RouteHandler = (req: Request, params: Record<string, string>) => Response | Promise<Response>

interface RouteEntry {
  pattern: RegExp
  paramNames: string[]
  handlers: Record<string, RouteHandler>
}

function parseRoutePattern(pattern: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = []
  const regexStr = pattern.replace(/:(\w+)/g, (_, name) => {
    paramNames.push(name)
    return '([^/]+)'
  })
  return { regex: new RegExp(`^${regexStr}$`), paramNames }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
    req.on('error', reject)
  })
}

async function toWebRequest(req: http.IncomingMessage): Promise<Request> {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      if (Array.isArray(value)) {
        for (const v of value) headers.append(key, v)
      } else {
        headers.set(key, value)
      }
    }
  }

  let body: string | undefined
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await readBody(req)
  }

  return new Request(url.toString(), {
    method: req.method || 'GET',
    headers,
    body: body || undefined,
  })
}

async function writeResponse(serverRes: http.ServerResponse, response: Response): Promise<void> {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headers[key] = value
  })
  serverRes.writeHead(response.status, headers)
  if (response.body) {
    const buffer = Buffer.from(await response.arrayBuffer())
    serverRes.end(buffer)
  } else {
    serverRes.end()
  }
}

export class PTYServer {
  private httpServer!: http.Server
  public wss!: WebSocketServer
  private pubsub!: PubSub
  private callbackManager!: CallbackManager
  private staticRoutes!: Record<string, StaticFile>
  private apiRoutes!: RouteEntry[]
  private _url!: URL
  private _port = 0

  private constructor() {}

  public static async createServer(): Promise<PTYServer> {
    const instance = new PTYServer()
    await instance.init()
    return instance
  }

  private async init() {
    this.staticRoutes = await buildStaticRoutes()
    this.pubsub = new PubSub()
    this.apiRoutes = this.buildApiRoutes()

    this.httpServer = http.createServer(async (req, res) => {
      try {
        await this.handleRequest(req, res)
      } catch {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Internal server error' }))
      }
    })

    this.wss = new WebSocketServer({ noServer: true })
    this.wss.on('connection', (ws) => {
      this.pubsub.subscribe('sessions:update', ws)
      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          ws.send(
            JSON.stringify({
              type: 'error',
              error: { message: 'Binary messages are not supported yet. File an issue.' },
            })
          )
          return
        }
        handleWebSocketMessage(this.pubsub, ws, data.toString())
      })
      ws.on('close', () => {
        this.pubsub.unsubscribeAll(ws)
      })
    })

    this.httpServer.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`)
      if (url.pathname === routes.websocket.path) {
        handleUpgrade(this.wss, req, socket, head)
      } else {
        socket.destroy()
      }
    })

    this.callbackManager = new CallbackManager(this.pubsub)

    const port = process.env.PTY_WEB_PORT ? parseInt(process.env.PTY_WEB_PORT, 10) : 0
    const hostname = process.env.PTY_WEB_HOSTNAME ?? '::1'
    await this.start(port, hostname)
  }

  private buildApiRoutes(): RouteEntry[] {
    const routeDefs: Array<{ path: string; handlers: Record<string, RouteHandler> }> = [
      {
        path: routes.health.path,
        handlers: { GET: () => handleHealth(this.wss) },
      },
      {
        path: routes.sessions.path,
        handlers: {
          GET: () => getSessions(),
          POST: (req) => createSession(req),
          DELETE: () => clearSessions(),
        },
      },
      {
        path: routes.session.path,
        handlers: {
          GET: (req, params) => getSession(req, params as { id: string }),
          DELETE: (req, params) => killSession(req, params as { id: string }),
        },
      },
      {
        path: routes.session.cleanup.path,
        handlers: {
          DELETE: (req, params) => cleanupSession(req, params as { id: string }),
        },
      },
      {
        path: routes.session.input.path,
        handlers: {
          POST: (req, params) => sendInput(req, params as { id: string }),
        },
      },
      {
        path: routes.session.buffer.raw.path,
        handlers: {
          GET: (req, params) => getRawBuffer(req, params as { id: string }),
        },
      },
      {
        path: routes.session.buffer.plain.path,
        handlers: {
          GET: (req, params) => getPlainBuffer(req, params as { id: string }),
        },
      },
    ]

    return routeDefs.map(({ path, handlers }) => {
      const { regex, paramNames } = parseRoutePattern(path)
      return { pattern: regex, paramNames, handlers }
    })
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url || '/', `http://${req.headers.host}`)
    const pathname = url.pathname
    const method = req.method || 'GET'

    const staticFile = this.staticRoutes[pathname]
    if (staticFile) {
      res.writeHead(200, staticFile.headers)
      res.end(staticFile.body)
      return
    }

    for (const route of this.apiRoutes) {
      const match = pathname.match(route.pattern)
      if (match) {
        const handler = route.handlers[method]
        if (handler) {
          const params: Record<string, string> = {}
          for (let i = 0; i < route.paramNames.length; i++) {
            const name = route.paramNames[i]
            const value = match[i + 1]
            if (name && value) {
              params[name] = value
            }
          }
          const request = await toWebRequest(req)
          const response = await handler(request, params)
          await writeResponse(res, response)
          return
        }
      }
    }

    const indexFile = this.staticRoutes['/index.html']
    if (indexFile) {
      res.writeHead(200, indexFile.headers)
      res.end(indexFile.body)
      return
    }

    res.writeHead(302, { Location: '/index.html' })
    res.end()
  }

  public async start(port: number, hostname: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer.listen(port, hostname, () => {
        const addr = this.httpServer.address()
        if (addr && typeof addr === 'object') {
          this._port = addr.port
          const host = hostname === '::1' ? '[::1]' : hostname
          this._url = new URL(`http://${host}:${addr.port}`)
        }
        resolve()
      })
      this.httpServer.once('error', reject)
    })
  }

  public async stop(): Promise<void> {
    this.callbackManager.dispose()
    for (const client of this.wss.clients) {
      client.close()
    }
    this.wss.close()
    return new Promise((resolve) => {
      this.httpServer.close(() => resolve())
    })
  }

  public getPort(): number {
    return this._port
  }

  public get url(): URL {
    return this._url
  }

  public getWsUrl(): string {
    return `${this._url.origin.replace(/^http/, 'ws')}${routes.websocket.path}`
  }

  [Symbol.dispose]() {
    this.callbackManager.dispose()
    for (const client of this.wss.clients) {
      client.close()
    }
    this.wss.close()
    this.httpServer.close()
  }
}
