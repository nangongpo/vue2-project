import type { AuditResult, RiskLevel } from '#app/common/types/prisma-enums.js'
import type { RiskDecision } from '#app/security/policies/risk-policy.js'

export type AuditRecordInput = {
  traceId: string
  actorId?: bigint
  action: string
  operationCode?: string
  riskLevel?: RiskLevel
  resource: string
  method: string
  path: string
  result: 'SUCCESS' | 'FAILURE'
  statusCode: number
  ip?: string
  userAgent?: string
  detail?: Record<string, unknown>
}

export type AuditPageQuery = {
  keyword?: string
  result?: AuditResult
  riskLevel?: RiskLevel
  operationCode?: string
  actorId?: string
  from?: Date
  to?: Date
  page?: number
  pageSize?: number
}

export type AuditPageRequest = Omit<AuditPageQuery, 'from' | 'to' | 'page' | 'pageSize'> & {
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

export type AuditExportQuery = {
  from: string
  to: string
  keyword?: string
  result?: AuditResult
  riskLevel?: RiskLevel
  operationCode?: string
}

export type AuditRequest = {
  traceId?: string
  operationCode?: string
  riskLevel?: RiskLevel
  riskDecision?: RiskDecision
  auditRecorded?: boolean
  method: string
  url: string
  ip?: string
  headers: { 'user-agent'?: string }
  query: unknown
  body: unknown
  user?: {
    internalId?: bigint
    roles?: readonly { roleType: string }[]
  }
  routeOptions?: { url?: string }
  routerPath?: string
}
