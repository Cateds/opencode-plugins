import type { OpencodeClient } from '@opencode-ai/sdk'
import { OutputManager } from './output-manager.ts'
import { SessionLifecycleManager } from './session-lifecycle.ts'
import type { PTYSessionInfo, ReadResult, SearchResult, SpawnOptions } from './types.ts'
import { withSession } from './utils.ts'

type SessionUpdateCallback = (session: PTYSessionInfo) => void

export const sessionUpdateCallbacks: SessionUpdateCallback[] = []

export function registerSessionUpdateCallback(callback: SessionUpdateCallback) {
  sessionUpdateCallbacks.push(callback)
}

export function removeSessionUpdateCallback(callback: SessionUpdateCallback) {
  const index = sessionUpdateCallbacks.indexOf(callback)
  if (index !== -1) {
    sessionUpdateCallbacks.splice(index, 1)
  }
}

function notifySessionUpdate(session: PTYSessionInfo) {
  for (const callback of sessionUpdateCallbacks) {
    try {
      callback(session)
    } catch {
      // Ignore callback errors
    }
  }
}

type RawOutputCallback = (session: PTYSessionInfo, rawData: string) => void

export const rawOutputCallbacks: RawOutputCallback[] = []

export function registerRawOutputCallback(callback: RawOutputCallback): void {
  rawOutputCallbacks.push(callback)
}

export function removeRawOutputCallback(callback: RawOutputCallback): void {
  const index = rawOutputCallbacks.indexOf(callback)
  if (index !== -1) {
    rawOutputCallbacks.splice(index, 1)
  }
}

function notifyRawOutput(session: PTYSessionInfo, rawData: string): void {
  for (const callback of rawOutputCallbacks) {
    try {
      callback(session, rawData)
    } catch {
      // Ignore callback errors
    }
  }
}

class PTYManager {
  private lifecycleManager = new SessionLifecycleManager()
  private outputManager = new OutputManager()

  init(_client: OpencodeClient): void {}

  clearAllSessions(): void {
    this.lifecycleManager.clearAllSessions()
  }

  spawn(opts: SpawnOptions): PTYSessionInfo {
    const session = this.lifecycleManager.spawn(
      opts,
      (session, data) => {
        notifyRawOutput(this.lifecycleManager.toInfo(session), data)
      },
      (session, _exitCode) => {
        notifySessionUpdate(this.lifecycleManager.toInfo(session))
      }
    )
    notifySessionUpdate(session)
    return session
  }

  write(id: string, data: string): boolean {
    return withSession(
      this.lifecycleManager,
      id,
      (session) => this.outputManager.write(session, data),
      false
    )
  }

  read(id: string, offset: number = 0, limit?: number): ReadResult | null {
    return withSession(
      this.lifecycleManager,
      id,
      (session) => this.outputManager.read(session, offset, limit),
      null
    )
  }

  search(id: string, pattern: RegExp, offset: number = 0, limit?: number): SearchResult | null {
    return withSession(
      this.lifecycleManager,
      id,
      (session) => this.outputManager.search(session, pattern, offset, limit),
      null
    )
  }

  list(): PTYSessionInfo[] {
    return this.lifecycleManager.listSessions().map((s) => this.lifecycleManager.toInfo(s))
  }

  get(id: string): PTYSessionInfo | null {
    return withSession(
      this.lifecycleManager,
      id,
      (session) => this.lifecycleManager.toInfo(session),
      null
    )
  }

  getRawBuffer(id: string): { raw: string; byteLength: number } | null {
    return withSession(
      this.lifecycleManager,
      id,
      (session) => ({
        raw: session.buffer.readRaw(),
        byteLength: session.buffer.byteLength,
      }),
      null
    )
  }

  kill(id: string, cleanup: boolean = false): boolean {
    return this.lifecycleManager.kill(id, cleanup)
  }

  cleanupBySession(parentSessionId: string): void {
    this.lifecycleManager.cleanupBySession(parentSessionId)
  }

  async waitForExit(
    id: string,
    timeoutMs?: number
  ): Promise<{ state: string; exitCode?: number; signal?: number | string }> {
    const session = this.lifecycleManager.getSession(id)
    if (!session) {
      return { state: 'not_found' }
    }

    if (session.status === 'exited' || session.status === 'killed') {
      return {
        state: session.status,
        exitCode: session.exitCode,
        signal: session.exitSignal,
      }
    }

    const exitPromise = this.lifecycleManager.waitForExit(id)
    if (!exitPromise) {
      return { state: session.status }
    }

    if (timeoutMs !== undefined) {
      const timeoutPromise = new Promise<{ state: string }>((resolve) =>
        setTimeout(() => resolve({ state: 'running' }), timeoutMs)
      )
      const result = await Promise.race([
        exitPromise.then((r) => ({ state: 'exited' as const, exitCode: r.exitCode, signal: r.signal })),
        timeoutPromise,
      ])
      if (result.state === 'running') {
        this.lifecycleManager.clearExitPromise(id)
      }
      return result
    }

    const result = await exitPromise
    return { state: 'exited', exitCode: result.exitCode, signal: result.signal }
  }
}

export const manager = new PTYManager()

export function initManager(opcClient: OpencodeClient): void {
  manager.init(opcClient)
}
