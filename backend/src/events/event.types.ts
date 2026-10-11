export type EventSubjectType = 'USER' | 'TENANT' | 'SYSTEM'

export type DomainEvent<T = Record<string, unknown>> = {
  eventId: string
  eventType: string
  aggregateType: string
  aggregateId: string
  tenantId: string
  subjectType: EventSubjectType
  subjectId: string
  aggregateVersion: number
  occurredAt: string
  payload: T
}

export type EventSubscription = {
  tenantId: string
  subjectType: EventSubjectType
  subjectId: string
  eventType?: string
}

export function eventChannel(scope: Pick<EventSubscription, 'tenantId' | 'subjectType' | 'subjectId'>) {
  return `event-stream:${scope.tenantId}:${scope.subjectType}:${scope.subjectId}`
}

