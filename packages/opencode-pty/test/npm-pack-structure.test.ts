import { describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'

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

function findPackFileFromOutput(stdout: string): string | null {
  // npm prints the created tarball filename on the last line
  const lines = stdout.trim().split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (line?.trim().endsWith('.tgz')) return line.trim()
  }
  return null
}

describe('npm pack structure', () => {
  it('includes dist web assets', async () => {
    // 1) Create tarball via npm pack (triggers prepack build)
    const pack = await run(['npm', 'pack'])
    expect(pack.code).toBe(0)
    const tgz = findPackFileFromOutput(pack.stdout)
    expect(typeof tgz).toBe('string')

    // 2) List tarball contents via tar -tf
    const list = await run(['tar', '-tf', tgz as string])
    expect(list.code).toBe(0)
    const files = list.stdout.split(/\r?\n/).filter(Boolean)

    // 3) Validate required files exist; NPM tarballs use 'package/' prefix
    expect(files).toContain('package/dist/web/index.html')

    // At least one hashed JS and CSS asset
    const hasJsAsset = files.some((f) => /package\/dist\/web\/assets\/[^/]+\.js$/.test(f))
    const hasCssAsset = files.some((f) => /package\/dist\/web\/assets\/[^/]+\.css$/.test(f))
    expect(hasJsAsset).toBe(true)
    expect(hasCssAsset).toBe(true)

    // 4) Cleanup the pack file
    await run(['rm', '-f', tgz as string])
  }, 20000)
})
