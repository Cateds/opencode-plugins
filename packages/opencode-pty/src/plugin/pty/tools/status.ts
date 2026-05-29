import { tool } from '@opencode-ai/plugin'
import { manager } from '../manager.ts'
import { buildSessionNotFoundError } from '../utils.ts'
import { loadTextFile } from './load-text.ts'

const DESCRIPTION = loadTextFile(import.meta.url, 'status.txt')

export const ptyStatus = tool({
  description: DESCRIPTION,
  args: {
    id: tool.schema.string().describe('The PTY session ID (from pty_spawn)'),
  },
  async execute(args) {
    const session = manager.get(args.id)
    if (!session) {
      throw buildSessionNotFoundError(args.id)
    }

    return formatResult(args.id, session.status, session.exitCode, session.exitSignal, session.lineCount)
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
    `<pty_status>`,
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
  lines.push(`</pty_status>`)

  return lines.join('\n')
}
