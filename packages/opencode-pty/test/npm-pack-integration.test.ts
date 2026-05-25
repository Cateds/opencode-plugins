import { afterEach, describe, expect, it } from 'vitest'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { access, readFile, unlink } from 'node:fs/promises'

async function run(cmd: string[], opts: { cwd?: string } = {}) {
  const [command, ...args] = cmd
  const proc = spawn(command!, args, {
    cwd: opts.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  })
  let stdout = ''
  let stderr = ''
  proc.stdout?.on('data', (chunk: Buffer) => {
    stdout += chunk.toString()
  })
  proc.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })
  const code = await new Promise<number | null>((resolve) => {
    proc.on('close', (code) => resolve(code))
  })
  return { code, stdout, stderr }
}

function findPackFileFromOutput(stdout: string): string {
  const lines = stdout.trim().split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (line?.trim().endsWith('.tgz')) return line.trim()
  }
  throw new Error('No .tgz file found in npm pack output')
}

describe('npm pack integration', () => {
  let tempDir: string
  let packFile: string | null = null
  let serverProcess: ChildProcess | null = null
  let baseURL = ''

  afterEach(async () => {
    // Cleanup server process
    if (serverProcess) {
      serverProcess.kill()
      serverProcess = null
    }

    // Cleanup temp directory
    if (tempDir) {
      try {
        rmSync(tempDir, { recursive: true, force: true })
      } catch (error) {
        if (!(error instanceof DOMException) || error.name !== 'AbortError') {
          throw error
        }
      }
    }

    // Cleanup pack file
    if (packFile) {
      await run(['rm', '-f', packFile])
    }
  })

  it('packs, installs, and serves assets correctly', async () => {
    // 1) Create temp workspace
    tempDir = mkdtempSync(join(tmpdir(), 'opencode-pty-'))

    // 2) Pack the package
    const pack = await run(['npm', 'pack'])
    expect(pack.code).toBe(0)
    const tgz = findPackFileFromOutput(pack.stdout)
    packFile = tgz
    const tgzPath = join(process.cwd(), tgz)

    // List tarball contents to find an asset
    const list = await run(['tar', '-tf', tgzPath])
    expect(list.code).toBe(0)
    const files = list.stdout.split(/\r?\n/).filter(Boolean)
    const jsAsset = files.find((f) => /package\/dist\/web\/assets\/[^/]+\.js$/.test(f))
    expect(jsAsset).toBeDefined()
    const assetName = jsAsset?.replace('package/dist/web/assets/', '')

    // 3) Install in temp workspace
    const install = await run(['bun', 'install', tgzPath], { cwd: tempDir })
    expect(install.code).toBe(0)

    // Copy the server script to tempDir
    mkdirSync(join(tempDir, 'test'))
    copyFileSync(
      join(process.cwd(), 'test/start-server.ts'),
      join(tempDir, 'test', 'start-server.ts')
    )

    // Verify the package structure (compiled JS shipped in dist/)
    const packageDir = join(tempDir, 'node_modules/opencode-pty')
    expect(existsSync(join(packageDir, 'dist/src/plugin/pty/manager.js'))).toBe(true)
    expect(existsSync(join(packageDir, 'dist/web/index.html'))).toBe(true)
    const portFile = join('/tmp', 'test-server-port-0.txt')
    try {
      await access(portFile)
      await unlink(portFile)
    } catch {
    }
    serverProcess = spawn('bun', ['run', 'test/start-server.ts'], {
      cwd: tempDir,
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: ['ignore', 'inherit', 'inherit'],
    })

    async function waitForPortFile() {
      // Fallback timeout to resolve with 0 after 500ms.
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve(0), 500)
      })

      // Polling logic as a separate async function.
      const pollForFile = async () => {
        while (true) {
          try {
            await access(portFile)
            break
          } catch {
            await new Promise(setImmediate)
          }
        }
        const portStr = (await readFile(portFile, 'utf-8')).trim()
        const port = parseInt(portStr, 10)
        if (Number.isNaN(port)) return 0
        return port
      }

      // Race the timeout against the polling.
      return await Promise.race([timeoutPromise, pollForFile()])
    }

    async function waitWithRetry() {
      let retries = 20
      do {
        const port = await waitForPortFile()
        if (port !== 0) return port
        await new Promise(setImmediate)
        retries--
      } while (retries > 0)
      return 0
    }

    const port = await waitWithRetry()
    expect(port).not.toBe(0)
    baseURL = `http://[::1]:${port}`

    // Wait for server to be ready
    let retries = 20 // 10 seconds
    while (retries > 0) {
      try {
        const response = await fetch(`${baseURL}/api/sessions`)
        if (response.ok) break
      } catch (error) {
        if (!(error instanceof DOMException) || error.name !== 'AbortError') {
          throw error
        }
      }
      await new Promise(setImmediate)
      retries--
    }
    expect(retries).toBeGreaterThan(0) // Server should be ready

    // 5) Fetch assets
    const assetResponse = await fetch(`${baseURL}/assets/${assetName}`)
    expect(assetResponse.status).toBe(200)
    // Could add more specific checks here, like content-type or specific assets

    // 6) Fetch index.html and verify it's the built version
    const indexResponse = await fetch(`${baseURL}/`)
    expect(indexResponse.status).toBe(200)
    const indexContent = await indexResponse.text()
    expect(indexContent).not.toContain('main.tsx') // Fails if raw HTML is served
    expect(indexContent).toContain('/assets/') // Confirms built assets are referenced
  }, 30000)
})
