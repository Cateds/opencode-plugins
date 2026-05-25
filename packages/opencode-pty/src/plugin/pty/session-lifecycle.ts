import { spawn as ptySpawn } from '#pty'
import { RingBuffer } from './buffer.ts'
import type { PTYSession, PTYSessionInfo, SpawnOptions } from './types.ts'
import { DEFAULT_TERMINAL_COLS, DEFAULT_TERMINAL_ROWS } from '../constants.ts'

const SESSION_ID_BYTE_LENGTH = 4

function generateId(): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(SESSION_ID_BYTE_LENGTH)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `pty_${hex}`
}

export class SessionLifecycleManager {
  private sessions: Map<string, PTYSession> = new Map()
  private sessionTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private exitPromises = new Map<
    string,
    {
      resolve: (value: { exitCode: number; signal: number | string }) => void
      promise: Promise<{ exitCode: number; signal: number | string }>
    }
  >()

  private normalizeTimeoutSeconds(timeoutSeconds: number | undefined): number | undefined {
    if (timeoutSeconds === undefined) {
      return undefined
    }

    if (!Number.isInteger(timeoutSeconds) || timeoutSeconds <= 0) {
      throw new Error('timeoutSeconds must be a positive integer in seconds')
    }

    return timeoutSeconds
  }

  private clearSessionTimeout(id: string): void {
    const timeoutHandle = this.sessionTimeouts.get(id)
    if (!timeoutHandle) {
      return
    }

    clearTimeout(timeoutHandle)
    this.sessionTimeouts.delete(id)
  }

  private scheduleSessionTimeout(session: PTYSession): void {
    if (session.timeoutSeconds === undefined) {
      return
    }

    const timeoutMs = session.timeoutSeconds * 1000

    const timeoutHandle = setTimeout(() => {
      this.sessionTimeouts.delete(session.id)

      const currentSession = this.sessions.get(session.id)
      if (!currentSession || currentSession.status !== 'running') {
        return
      }

      // Persist the timeout reason before reusing the regular kill flow.
      currentSession.timedOut = true
      currentSession.status = 'killing'

      try {
        currentSession.process?.kill()
      } catch {
        // Ignore kill errors
      }
    }, timeoutMs)

    this.sessionTimeouts.set(session.id, timeoutHandle)
  }

  private createSessionObject(opts: SpawnOptions): PTYSession {
    const id = generateId()
    const args = opts.args ?? []
    const workdir = opts.workdir ?? process.cwd()
    const timeoutSeconds = this.normalizeTimeoutSeconds(opts.timeoutSeconds)
    const title =
      opts.title ?? (`${opts.command} ${args.join(' ')}`.trim() || `Terminal ${id.slice(-4)}`)

    const buffer = new RingBuffer()
    return {
      id,
      title,
      description: opts.description,
      command: opts.command,
      args,
      workdir,
      env: opts.env,
      status: 'running',
      pid: 0, // will be set after spawn
      createdAt: new Date(),
      parentSessionId: opts.parentSessionId,
      parentAgent: opts.parentAgent,
      timeoutSeconds,
      timedOut: false,
      buffer,
      process: null, // will be set
    }
  }

  private spawnProcess(session: PTYSession): void {
    const env = { ...process.env, ...session.env } as Record<string, string>
    const ptyProcess = ptySpawn(session.command, session.args, {
      name: 'xterm-256color',
      cols: DEFAULT_TERMINAL_COLS,
      rows: DEFAULT_TERMINAL_ROWS,
      cwd: session.workdir,
      env,
    })
    session.process = ptyProcess
    session.pid = ptyProcess.pid
  }

  private setupEventHandlers(
    session: PTYSession,
    onData: (session: PTYSession, data: string) => void,
    onExit: (session: PTYSession, exitCode: number | null) => void
  ): void {
    session.process?.onData((data: string) => {
      session.buffer.append(data)
      onData(session, data)
    })

    session.process?.onExit((listener) => {
      this.clearSessionTimeout(session.id)

      session.buffer.flush()

      if (session.status === 'killing') {
        session.status = 'killed'
      } else {
        session.status = 'exited'
      }
      session.exitCode = listener.exitCode
      session.exitSignal = listener.signal ?? 0

      const pending = this.exitPromises.get(session.id)
      if (pending) {
        pending.resolve({ exitCode: listener.exitCode, signal: listener.signal ?? 0 })
        this.exitPromises.delete(session.id)
      }

      onExit(session, listener.exitCode)
    })
  }

  spawn(
    opts: SpawnOptions,
    onData: (session: PTYSession, data: string) => void,
    onExit: (session: PTYSession, exitCode: number | null) => void
  ): PTYSessionInfo {
    const session = this.createSessionObject(opts)
    this.spawnProcess(session)
    this.setupEventHandlers(session, onData, onExit)
    this.sessions.set(session.id, session)
    this.scheduleSessionTimeout(session)
    return this.toInfo(session)
  }

  kill(id: string, cleanup: boolean = false): boolean {
    const session = this.sessions.get(id)
    if (!session) {
      return false
    }

    this.clearSessionTimeout(id)

    if (session.status === 'running') {
      session.status = 'killing'
      try {
        session.process?.kill()
      } catch {
        // Ignore kill errors
      }
    }

    if (cleanup) {
      session.buffer.clear()
      this.sessions.delete(id)
    }

    return true
  }

  private clearAllSessionsInternal(): void {
    for (const id of [...this.sessions.keys()]) {
      this.kill(id, true)
    }
  }

  clearAllSessions(): void {
    this.clearAllSessionsInternal()
  }

  cleanupBySession(parentSessionId: string): void {
    for (const [id, session] of this.sessions) {
      if (session.parentSessionId === parentSessionId) {
        this.kill(id, true)
      }
    }
  }

  getSession(id: string): PTYSession | null {
    return this.sessions.get(id) || null
  }

  listSessions(): PTYSession[] {
    return Array.from(this.sessions.values())
  }

  waitForExit(id: string): Promise<{ exitCode: number; signal: number | string }> | null {
    const session = this.sessions.get(id)
    if (!session) {
      return null
    }

    if (session.status === 'exited' || session.status === 'killed') {
      return Promise.resolve({
        exitCode: session.exitCode ?? 0,
        signal: session.exitSignal ?? 0,
      })
    }

    const existing = this.exitPromises.get(id)
    if (existing) {
      return existing.promise
    }

    let resolve!: (value: { exitCode: number; signal: number | string }) => void
    const promise = new Promise<{ exitCode: number; signal: number | string }>((res) => {
      resolve = res
    })
    this.exitPromises.set(id, { resolve, promise })
    return promise
  }

  clearExitPromise(id: string): void {
    this.exitPromises.delete(id)
  }

  toInfo(session: PTYSession): PTYSessionInfo {
    return {
      id: session.id,
      title: session.title,
      description: session.description,
      command: session.command,
      args: session.args,
      workdir: session.workdir,
      status: session.status,
      timeoutSeconds: session.timeoutSeconds,
      timedOut: session.timedOut,
      exitCode: session.exitCode,
      exitSignal: session.exitSignal,
      pid: session.pid,
      createdAt: session.createdAt.toISOString(),
      lineCount: session.buffer.length,
    }
  }
}
