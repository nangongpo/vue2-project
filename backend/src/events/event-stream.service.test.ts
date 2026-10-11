import { describe, expect, it, vi } from 'vitest'
import { EventStreamService } from '#app/events/event-stream.service.js'
import type { DomainEvent } from '#app/events/event.types.js'

const event: DomainEvent = {
  eventId: 'event-1',
  eventType: 'file.upload.status.changed',
  aggregateType: 'upload',
  aggregateId: 'upload-1',
  tenantId: 'tenant-1',
  subjectType: 'USER',
  subjectId: 'user-1',
  aggregateVersion: 1,
  occurredAt: new Date().toISOString(),
  payload: { uploadId: 'upload-1', uploadStatus: 'COMPLETED' },
}

function redis() {
  return {
    configured: vi.fn(() => false),
    subscribePattern: vi.fn(async () => () => undefined),
    publish: vi.fn(async () => true),
  } as never
}

describe('EventStreamService', () => {
  it('按租户、主体和事件类型分发，不跨租户广播', async () => {
    const service = new EventStreamService(redis())
    const received: DomainEvent[] = []
    service.subscribe({ tenantId: 'tenant-1', subjectType: 'USER', subjectId: 'user-1' }, (value) => received.push(value))
    service.subscribe({ tenantId: 'tenant-2', subjectType: 'USER', subjectId: 'user-1' }, (value) => received.push(value))
    await service.publishTransport(event)
    expect(received).toHaveLength(1)
    expect(received[0].tenantId).toBe('tenant-1')
  })

  it('先发送快照，再发送建立连接期间缓存的事件', async () => {
    const service = new EventStreamService(redis())
    let resolveSnapshot!: (value: Record<string, unknown>) => void
    const snapshot = new Promise<Record<string, unknown>>((resolve) => { resolveSnapshot = resolve })
    const received: Array<{ type: string; data: Record<string, unknown> }> = []
    const stream = service.connect(
      { tenantId: 'tenant-1', subjectType: 'USER', subjectId: 'user-1' },
      () => snapshot,
      (value) => value.payload as Record<string, unknown>,
    )
    const subscription = stream.subscribe((value) => received.push({ type: value.type, data: value.data }))
    await service.publishTransport(event)
    resolveSnapshot({ uploadStatus: 'SCANNING' })
    await new Promise((resolve) => setImmediate(resolve))
    expect(received.map((value) => value.type)).toEqual(['snapshot', 'file.upload.status.changed'])
    subscription.unsubscribe()
  })
})
