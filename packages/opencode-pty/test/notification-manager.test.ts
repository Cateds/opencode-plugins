import { describe, expect, it } from 'vitest'
import type { OpencodeClient } from '@opencode-ai/sdk'
import { NotificationManager } from '../src/plugin/pty/notification-manager.ts'

describe('NotificationManager', () => {
  it('init works', () => {
    const manager = new NotificationManager()
    manager.init({} as unknown as OpencodeClient)
    expect(manager).toBeDefined()
  })
})
