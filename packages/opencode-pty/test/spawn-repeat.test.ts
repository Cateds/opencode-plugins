import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OpencodeClient } from '@opencode-ai/sdk'
import {
  initManager,
  manager,
  rawOutputCallbacks,
  registerRawOutputCallback,
} from '../src/plugin/pty/manager.ts'
import { spawn, type ChildProcess } from 'node:child_process'

describe('PTY Echo Behavior', () => {
  beforeEach(() => {
    initManager(new OpencodeClient())
  })

  afterEach(() => {
    // Clean up any sessions
    manager.clearAllSessions()
  })

  class TestSpawner {
    readonly subprocess: ChildProcess
    stderrOutput = ''
    stdoutOutput = ''
    readonly testNumber: number
    readonly exited: Promise<number | null>
    constructor(testNumber: number) {
      this.testNumber = testNumber
      this.subprocess = spawn(
        'bun',
        [
          'test',
          'spawn-repeat.test.ts',
          '--test-name-pattern',
          'should receive initial data once',
        ],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, SYNC_TESTS: '1' },
        }
      )

      this.exited = new Promise((resolve) => {
        this.subprocess.on('close', (code) => resolve(code))
      })

      this.subprocess.stdout?.on('data', (chunk: Buffer) => {
        this.stdoutOutput += chunk.toString()
      })
      this.subprocess.stderr?.on('data', (chunk: Buffer) => {
        this.stderrOutput += chunk.toString()
      })
    }
  }

  it('should receive initial data reproducibly', async () => {
    const start = Date.now()
    const maxRuntime = 1000
    let runnings = 1
    const spawned: TestSpawner[] = []
    while (Date.now() - start < maxRuntime) {
      runnings++
      const testSpawner = new TestSpawner(runnings)
      spawned.push(testSpawner)
    }
    let errorMessage = ''
    errorMessage += `[TEST] Spawned ${runnings} subprocesses in ${Date.now() - start}ms.\n`
    const timeout = new Promise<void>((resolve) => {
      setTimeout(() => resolve(), 20000)
    })
    const all = Promise.all(spawned.map((s) => s.exited))
    await Promise.race([all, timeout])
    const stillRunning = spawned.filter((s) => s.subprocess.exitCode === null)
    if (stillRunning.length > 0) {
      errorMessage += `[TEST] Timeout reached after 20s with ${stillRunning.length} subprocesses still running.\n`
      stillRunning.forEach((s) => {
        errorMessage += `[TEST] Subprocess ${s.testNumber} stderr: ${s.stderrOutput}\n`
        errorMessage += `[TEST] Subprocess ${s.testNumber} stdout: ${s.stdoutOutput}\n`
      })
    }
    const exitCodeNonZero = spawned.filter(
      (s) => s.subprocess.exitCode !== null && s.subprocess.exitCode !== 0
    )
    if (exitCodeNonZero.length > 0) {
      errorMessage += `[TEST] ${exitCodeNonZero.length} subprocesses exited with non-zero exit code.\n`
      exitCodeNonZero.forEach((s) => {
        errorMessage += `[TEST] Subprocess ${s.testNumber} stderr: ${s.stderrOutput}\n`
        errorMessage += `[TEST] Subprocess ${s.testNumber} stdout: ${s.stdoutOutput}\n`
      })
    }
    expect(stillRunning.length + exitCodeNonZero.length, errorMessage).toBe(0)
  }, 60000)

  it.skipIf(!process.env.SYNC_TESTS)(
    'should receive initial data once',
    async () => {
      const title = crypto.randomUUID()
      // Subscribe to raw output events
      const promise = new Promise<string>((resolve, reject) => {
        let rawDataTotal = ''
        registerRawOutputCallback((session, rawData) => {
          // console.log(`[TEST] Received raw data for session ${session.id} (${session.title}): ${rawData}`)
          if (session.title !== title) return
          rawDataTotal += rawData
          if (rawData.includes('Hello World')) {
            resolve(rawDataTotal)
          }
        })
        setTimeout(() => {
          reject(new Error(`Timeout waiting for Hello World, received: ${rawDataTotal}`))
        }, 10000)
      })

      // Spawn interactive bash session
      const session = manager.spawn({
        title: title,
        command: 'echo',
        args: ['Hello World'],
        description: 'Echo test session',
        parentSessionId: 'test',
      })

      // await Promise.resolve() // Yield to allow session to be fully registered and callbacks to be set up
      const rawData = await promise
      expect(rawData).toContain('Hello World')

      // Clean up
      manager.kill(session.id, true)
      rawOutputCallbacks.length = 0

      // Verify echo occurred
      expect(rawData).toContain('Hello World')
    },
    10000
  )
})
