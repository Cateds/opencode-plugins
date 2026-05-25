import type { PluginContext, PluginResult } from './plugin/types.ts'
import { initManager, manager } from './plugin/pty/manager.ts'
import { initPermissions } from './plugin/pty/permissions.ts'
import { ptySpawn } from './plugin/pty/tools/spawn.ts'
import { ptyWrite } from './plugin/pty/tools/write.ts'
import { ptyRead } from './plugin/pty/tools/read.ts'
import { ptyList } from './plugin/pty/tools/list.ts'
import { ptyKill } from './plugin/pty/tools/kill.ts'
import { ptyAwait } from './plugin/pty/tools/await.ts'
import { PTYServer } from './web/server/server.ts'
import open from 'open'

const ptyManagePageCommand = 'pty-manage-page'

export const PTYPlugin = async ({ client, directory }: PluginContext): Promise<PluginResult> => {
  initPermissions(client, directory)
  initManager(client)
  let ptyServer: PTYServer | undefined

  return {
    'command.execute.before': async (input) => {
      if (input.command !== ptyManagePageCommand) {
        return
      }
      if (ptyServer === undefined) {
        ptyServer = await PTYServer.createServer()
      }
      open(ptyServer.url.origin)
      throw new Error('Command handled by PTY plugin')
    },
    tool: {
      pty_spawn: ptySpawn,
      pty_write: ptyWrite,
      pty_read: ptyRead,
      pty_list: ptyList,
      pty_kill: ptyKill,
      pty_await: ptyAwait,
    },
    config: async (input) => {
      if (!input.command) {
        input.command = {}
      }
      input.command[ptyManagePageCommand] = {
        template: `This command will start the PTY Sessions Web Interface and open it in your default browser.`,
        description: 'Open PTY Sessions Web Interface',
      }
    },
    event: async ({ event }) => {
      if (event.type === 'session.deleted') {
        manager.cleanupBySession(event.properties.info.id)
      }
    },
  }
}
