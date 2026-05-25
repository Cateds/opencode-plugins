import { WebSocket } from 'ws'
import {
  registerRawOutputCallback,
  registerSessionUpdateCallback,
  removeRawOutputCallback,
  removeSessionUpdateCallback,
} from '../../plugin/pty/manager.ts'
import type { PTYSessionInfo } from '../../plugin/pty/types.ts'
import type { WSMessageServerRawData, WSMessageServerSessionUpdate } from '../shared/types.ts'

export class PubSub {
  private topics = new Map<string, Set<WebSocket>>()

  subscribe(topic: string, ws: WebSocket): void {
    let subscribers = this.topics.get(topic)
    if (!subscribers) {
      subscribers = new Set()
      this.topics.set(topic, subscribers)
    }
    subscribers.add(ws)
  }

  unsubscribe(topic: string, ws: WebSocket): void {
    const subscribers = this.topics.get(topic)
    if (subscribers) {
      subscribers.delete(ws)
      if (subscribers.size === 0) {
        this.topics.delete(topic)
      }
    }
  }

  publish(topic: string, data: string): void {
    const subscribers = this.topics.get(topic)
    if (subscribers) {
      for (const ws of subscribers) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data)
        }
      }
    }
  }

  unsubscribeAll(ws: WebSocket): void {
    for (const [topic, subscribers] of this.topics) {
      subscribers.delete(ws)
      if (subscribers.size === 0) {
        this.topics.delete(topic)
      }
    }
  }
}

export class CallbackManager {
  constructor(private pubsub: PubSub) {
    registerSessionUpdateCallback(this.sessionUpdateCallback)
    registerRawOutputCallback(this.rawOutputCallback)
  }

  private sessionUpdateCallback = (session: PTYSessionInfo): void => {
    const message: WSMessageServerSessionUpdate = { type: 'session_update', session }
    this.pubsub.publish('sessions:update', JSON.stringify(message))
  }

  private rawOutputCallback = (session: PTYSessionInfo, rawData: string): void => {
    const message: WSMessageServerRawData = { type: 'raw_data', session, rawData }
    this.pubsub.publish(`session:${session.id}`, JSON.stringify(message))
  }

  dispose() {
    removeSessionUpdateCallback(this.sessionUpdateCallback)
    removeRawOutputCallback(this.rawOutputCallback)
  }
}
