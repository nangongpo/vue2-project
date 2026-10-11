import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Observable, type Subscriber } from 'rxjs'
import { randomUUID } from 'node:crypto'
import { RedisService } from '#app/cache/services/redis.service.js'
import { eventChannel, type DomainEvent, type EventSubscription } from '#app/events/event.types.js'

type Listener = (event: DomainEvent) => void

/**
 * 只负责连接生命周期和事件分发，不负责业务授权。
 * 事件的租户、主体和资源范围必须由业务模块在写入 Outbox 前计算完成。
 */
@Injectable()
export class EventStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly instanceId = randomUUID()
  private readonly listeners = new Map<string, Set<Listener>>()
  private stopRedisSubscription: () => void = () => undefined

  constructor(private readonly redis: RedisService) {}

  async onModuleInit() {
    this.stopRedisSubscription = await this.redis.subscribePattern('event-stream:*', (_channel, message) => {
      try {
        const envelope = JSON.parse(message) as DomainEvent & { sourceInstanceId?: string }
        if (envelope.sourceInstanceId === this.instanceId) return
        this.dispatch(envelope)
      } catch {
        // Redis 中的事件不是客户端输入，解析失败只丢弃该通知，不影响业务进程。
      }
    })
  }

  async onModuleDestroy() {
    this.stopRedisSubscription()
    this.listeners.clear()
  }

  async publishTransport(event: DomainEvent) {
    this.dispatch(event)
    if (!this.redis.configured()) return
    const publicEvent = Object.fromEntries(Object.entries(event).filter(([key]) => key !== 'sourceInstanceId'))
    if (!await this.redis.publish(eventChannel(event), JSON.stringify({ ...publicEvent, sourceInstanceId: this.instanceId })))
      throw new Error('Redis 事件发布不可用')
  }

  subscribe(scope: EventSubscription, listener: Listener) {
    const key = this.key(scope)
    const bucket = this.listeners.get(key) || new Set<Listener>()
    bucket.add(listener)
    this.listeners.set(key, bucket)
    return () => {
      bucket.delete(listener)
      if (!bucket.size) this.listeners.delete(key)
    }
  }

  connect<T extends Record<string, unknown>>(
    scope: EventSubscription,
    snapshot: () => Promise<T>,
    project: (event: DomainEvent) => Record<string, unknown> | null,
  ) {
    return new Observable<{ type: string; id: string; data: Record<string, unknown> }>((subscriber: Subscriber<{ type: string; id: string; data: Record<string, unknown> }>) => {
      let closed = false
      let snapshotSent = false
      const pending: DomainEvent[] = []
      const onEvent = (event: DomainEvent) => {
        if (closed) return
        if (snapshotSent) {
          const data = project(event)
          if (data) subscriber.next({ type: event.eventType, id: event.eventId, data })
          return
        }
        pending.push(event)
      }
      const unsubscribe = this.subscribe(scope, onEvent)
      void snapshot()
        .then((data) => {
          if (closed) return
          subscriber.next({ type: 'snapshot', id: randomUUID(), data })
          snapshotSent = true
          for (const event of pending.splice(0)) {
            const projected = project(event)
            if (projected) subscriber.next({ type: event.eventType, id: event.eventId, data: projected })
          }
        })
        .catch((error) => subscriber.error(error))
      return () => {
        closed = true
        unsubscribe()
      }
    })
  }

  private dispatch(event: DomainEvent) {
    const keys = [
      this.key({ tenantId: event.tenantId, subjectType: event.subjectType, subjectId: event.subjectId, eventType: event.eventType }),
      this.key({ tenantId: event.tenantId, subjectType: event.subjectType, subjectId: event.subjectId }),
      this.key({ tenantId: event.tenantId, subjectType: event.subjectType, subjectId: '*', eventType: event.eventType }),
      this.key({ tenantId: event.tenantId, subjectType: event.subjectType, subjectId: '*' }),
    ]
    const delivered = new Set<Listener>()
    for (const key of keys) for (const listener of this.listeners.get(key) || []) {
      if (delivered.has(listener)) continue
      delivered.add(listener)
      listener(event)
    }
  }

  private key(scope: EventSubscription) {
    return `${scope.tenantId}:${scope.subjectType}:${scope.subjectId}:${scope.eventType || '*'}`
  }
}
