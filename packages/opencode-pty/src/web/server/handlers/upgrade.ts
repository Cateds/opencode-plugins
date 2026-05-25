import type http from 'node:http'
import type { Duplex } from 'node:stream'
import type { WebSocketServer } from 'ws'

export function handleUpgrade(
  wss: WebSocketServer,
  req: http.IncomingMessage,
  socket: Duplex,
  head: Buffer
) {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
}
