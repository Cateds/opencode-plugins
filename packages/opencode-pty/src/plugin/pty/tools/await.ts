import { tool } from '@opencode-ai/plugin'
import { manager } from '../manager.ts'
import { buildSessionNotFoundError } from '../utils.ts'
import { loadTextFile } from './load-text.ts'

const DESCRIPTION = loadTextFile(import.meta.url, 'await.txt')

export const ptyAwait = tool({
  description: DESCRIPTION,
  args: {
    id: tool.schema.string().describe('The PTY session ID (from pty_spawn)'),
    wait: tool.schema
      .boolean()
      .optional()
      .describe('When true, wait until the session exits or timeout'),
    timeout_ms: tool.schema
      .number()
      .int()
      .positive()
      .optional()
      .describe('Maximum milliseconds to wait when wait=true (default: 60000)'),
  },
  async execute(args) {
    const session = manager.get(args.id)
    if (!session) {
      throw buildSessionNotFoundError(args.id)
    }

    if (!args.wait) {
      return formatResult(args.id, session.status, session.exitCode, session.exitSignal, session.lineCount)
    }

    const result = await manager.waitForExit(args.id, args.timeout_ms ?? 60000)
    const finalSession = manager.get(args.id)
    const lineCount = finalSession?.lineCount ?? 0

    return formatResult(args.id, result.state, result.exitCode, result.signal, lineCount)
  },
})

function formatResult(
  id: string,
  state: string,
  exitCode?: number,
  signal?: number | string,
  lineCount?: number
): string {
  const lines = [
    `<pty_await_result>`,
    `session_id: ${id}`,
    `state: ${state}`,
  ]

  if (state === 'exited' && exitCode !== undefined) {
    lines.push(`exit_code: ${exitCode}`)
  }

  if (state === 'killed' && signal !== undefined) {
    lines.push(`signal: ${signal}`)
  }

  lines.push(`line_count: ${lineCount ?? 0}`)
  lines.push(`</pty_await_result>`)

  return lines.join('\n')
}
