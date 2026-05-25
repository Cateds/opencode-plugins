import type { WebSocketServer } from 'ws'
import { manager } from '../../../plugin/pty/manager.ts'
import type { HealthResponse } from '../../shared/types.ts'
import { JsonResponse } from './responses.ts'

export function handleHealth(wss: WebSocketServer) {
  const sessions = manager.list()
  const activeSessions = sessions.filter((s) => s.status === 'running').length
  const totalSessions = sessions.length

  const startTime = Date.now()

  const healthResponse: HealthResponse = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    sessions: {
      total: totalSessions,
      active: activeSessions,
    },
    websocket: {
      connections: wss.clients.size,
    },
    memory: process.memoryUsage
      ? {
          rss: process.memoryUsage().rss,
          heapUsed: process.memoryUsage().heapUsed,
          heapTotal: process.memoryUsage().heapTotal,
        }
      : undefined,
  }

  const responseTime = Date.now() - startTime
  healthResponse.responseTime = responseTime

  return new JsonResponse(healthResponse)
}
