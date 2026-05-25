import stripAnsi from 'strip-ansi'
import { manager } from '../../../plugin/pty/manager.ts'
import { ErrorResponse, JsonResponse } from './responses.ts'

export function getSessions() {
  const sessions = manager.list()
  return new JsonResponse(sessions)
}

export async function createSession(req: Request) {
  let body: {
    command: string
    args?: string[]
    description?: string
    workdir?: string
    timeoutSeconds?: number
  }

  try {
    body = (await req.json()) as typeof body
  } catch {
    return new ErrorResponse('Invalid JSON in request body', 400)
  }

  if (!body.command || typeof body.command !== 'string' || body.command.trim() === '') {
    return new ErrorResponse('Command is required', 400)
  }

  try {
    const session = manager.spawn({
      command: body.command,
      args: body.args || [],
      title: body.description,
      description: body.description,
      workdir: body.workdir,
      timeoutSeconds: body.timeoutSeconds,
      parentSessionId: 'web-api',
    })
    return new JsonResponse(session)
  } catch (error) {
    return new ErrorResponse(
      error instanceof Error ? error.message : 'Failed to create session',
      400
    )
  }
}

export function clearSessions() {
  manager.clearAllSessions()
  return new JsonResponse({ success: true })
}

export function getSession(_req: Request, params: { id: string }) {
  const session = manager.get(params.id)
  if (!session) {
    return new ErrorResponse('Session not found', 404)
  }
  return new JsonResponse(session)
}

export async function sendInput(req: Request, params: { id: string }): Promise<Response> {
  try {
    const body = (await req.json()) as { data: string }
    if (!body.data || typeof body.data !== 'string') {
      return new ErrorResponse('Data field is required and must be a string', 400)
    }
    const success = manager.write(params.id, body.data)
    if (!success) {
      return new ErrorResponse('Failed to write to session', 400)
    }
    return new JsonResponse({ success: true })
  } catch {
    return new ErrorResponse('Invalid JSON in request body', 400)
  }
}

export function cleanupSession(_req: Request, params: { id: string }) {
  const success = manager.kill(params.id, true)
  if (!success) {
    return new ErrorResponse('Failed to kill session', 400)
  }
  return new JsonResponse({ success: true })
}

export function killSession(_req: Request, params: { id: string }) {
  const success = manager.kill(params.id)
  if (!success) {
    return new ErrorResponse('Failed to kill session', 400)
  }
  return new JsonResponse({ success: true })
}

export function getRawBuffer(_req: Request, params: { id: string }) {
  const bufferData = manager.getRawBuffer(params.id)
  if (!bufferData) {
    return new ErrorResponse('Session not found', 404)
  }

  return new JsonResponse(bufferData)
}

export function getPlainBuffer(_req: Request, params: { id: string }) {
  const bufferData = manager.getRawBuffer(params.id)
  if (!bufferData) {
    return new ErrorResponse('Session not found', 404)
  }

  const plainText = stripAnsi(bufferData.raw)
  return new JsonResponse({
    plain: plainText,
    byteLength: new TextEncoder().encode(plainText).length,
  })
}
