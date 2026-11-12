import { ServiceUnavailableException } from '@nestjs/common'
import { createHmac, randomUUID } from 'node:crypto'
import { sanitizeAuditDetail } from '#app/audit/utils/audit-sanitizer.js'

const canonicalize = (value: unknown): unknown => {
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)])
    )
  }
  return value
}

export function auditIntegrityHash(input: Record<string, unknown>) {
  const secret = process.env.AUDIT_INTEGRITY_SECRET
  if (!secret || secret.length < 32)
    throw new ServiceUnavailableException('审计完整性密钥未配置或长度不足')
  return createHmac('sha256', secret)
    .update(JSON.stringify(canonicalize(input)))
    .digest('hex')
}

/**
 * 统一包装所有 Prisma AuditLog.create 写入，防止事务内直写路径遗漏完整性摘要。
 * 仅允许追加；调用方不能覆盖服务端生成的 ID、时间、脱敏详情或摘要。
 */
export function prepareAuditCreate(data: Record<string, any>) {
  const record = {
    id: data.id || randomUUID(),
    traceId: data.traceId,
    tenantId: data.tenantId ?? null,
    membershipId: data.membershipId ?? null,
    organizationId: data.organizationId ?? null,
    departmentId: data.departmentId ?? null,
    actorId: data.actorId ?? null,
    action: data.action,
    operationCode: data.operationCode ?? null,
    riskLevel: data.riskLevel || 'L1',
    resource: data.resource,
    method: data.method,
    path: data.path,
    result: data.result,
    statusCode: data.statusCode,
    ip: data.ip ?? null,
    userAgent: data.userAgent ?? null,
    detail: sanitizeAuditDetail(data.detail),
    createdAt: data.createdAt || new Date(),
  }
  return {
    ...data,
    ...record,
    integrityHash: auditIntegrityHash(record),
  }
}
