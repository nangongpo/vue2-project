import type { AuditResult, RiskLevel } from '#app/common/types/prisma-enums.js'
import type { RiskDecision } from '#app/security/policies/risk-policy.js'

export type AuditRecordInput = {
  traceId: string
  tenantId?: string
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
  tenantId: string
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
  tenantId: string
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
    tenantId?: string
    roles?: readonly { roleType: string }[]
  }
  routeOptions?: { url?: string }
  routerPath?: string
}
