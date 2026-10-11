import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { PrismaService } from '#app/database/prisma.service.js'
import { EventStreamService } from '#app/events/event-stream.service.js'
import type { DomainEvent } from '#app/events/event.types.js'

const OUTBOX_POLL_MS = 1000
const OUTBOX_MAX_ATTEMPTS = 8

@Injectable()
export class EventOutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventOutboxService.name)
  private timer?: NodeJS.Timeout
  private running = false

  constructor(private readonly prisma: PrismaService, private readonly stream: EventStreamService) {}

  enqueue(tx: Prisma.TransactionClient, input: Omit<DomainEvent, 'eventId' | 'occurredAt'> & { occurredAt?: string }) {
    const event: DomainEvent = {
      ...input,
      eventId: randomUUID(),
      occurredAt: input.occurredAt || new Date().toISOString(),
    }
    return tx.eventOutbox.create({
      data: {
        eventId: event.eventId,
        tenantId: event.tenantId,
        subjectType: event.subjectType,
        subjectId: event.subjectId,
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        aggregateVersion: event.aggregateVersion,
        payload: event.payload as Prisma.InputJsonValue,
      },
    })
  }

  onModuleInit() {
    this.timer = setInterval(() => void this.flush(), OUTBOX_POLL_MS)
    this.timer.unref()
    void this.flush()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async flush() {
    if (this.running) return
    this.running = true
    try {
      const now = new Date()
      const rows = await this.prisma.eventOutbox.findMany({
        where: { OR: [{ status: 'PENDING', nextRetryAt: { lte: now } }, { status: 'PUBLISHING', nextRetryAt: { lte: now } }] },
        orderBy: { createdAt: 'asc' },
        take: 100,
      })
      for (const row of rows) await this.publishOne(row)
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : 'Outbox 发布失败')
    } finally {
      this.running = false
    }
  }

  private async publishOne(row: {
    id: string; eventId: string; tenantId: string; subjectType: string; subjectId: string; eventType: string;
    aggregateType: string; aggregateId: string; aggregateVersion: number; payload: Prisma.JsonValue;
    attempts: number
  }) {
    const claimed = await this.prisma.eventOutbox.updateMany({
      where: { id: row.id, status: { in: ['PENDING', 'PUBLISHING'] } },
      data: { status: 'PUBLISHING', attempts: { increment: 1 } },
    })
    if (!claimed.count) return
    const event = {
      eventId: row.eventId,
      eventType: row.eventType,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      tenantId: row.tenantId,
      subjectType: row.subjectType as DomainEvent['subjectType'],
      subjectId: row.subjectId,
      aggregateVersion: row.aggregateVersion,
      occurredAt: new Date().toISOString(),
      payload: row.payload as Record<string, unknown>,
    } satisfies DomainEvent
    try {
      await this.stream.publishTransport(event)
      await this.prisma.eventOutbox.update({ where: { id: row.id }, data: { status: 'PUBLISHED', publishedAt: new Date(), lastError: null } })
    } catch (error) {
      const attempts = row.attempts + 1
      await this.prisma.eventOutbox.update({
        where: { id: row.id },
        data: {
          status: attempts >= OUTBOX_MAX_ATTEMPTS ? 'DEAD_LETTER' : 'PENDING',
          nextRetryAt: new Date(Date.now() + Math.min(300000, 1000 * 2 ** Math.min(8, attempts))),
          lastError: (error instanceof Error ? error.message : '事件发布失败').slice(0, 512),
        },
      })
    }
  }
}
