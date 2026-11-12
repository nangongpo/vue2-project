import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import { maxRiskLevel, resolveRiskDecision, type RiskDecision } from '#app/security/policies/risk-policy.js'

export const FILE_RISK_POLICY_VERSION = 'file-operation-v1'
export const FILE_OPERATION_CODES = {
  FILE_DELETE: 'system.file.admin.delete', FILE_REJECT: 'system.file.admin.reject',
  FILE_RESTORE: 'system.file.admin.restore', FILE_RESCAN: 'system.file.admin.scan',
} as const
export type FileOperationKind = keyof typeof FILE_OPERATION_CODES
export type FileRiskTarget = {
  status: string; scanStatus: string; securityHold?: string | null
  retentionLocked?: boolean; deletedFromStatus?: string | null
}

export function fileOperationRisk(kind: FileOperationKind, file: FileRiskTarget, bindingCount: number, configured?: RiskDecision) {
  if (kind === 'FILE_DELETE' && file.retentionLocked) throw new ForbiddenException('文件处于保留或调查锁定状态，禁止删除')
  if (kind === 'FILE_RESTORE' ? file.status !== 'DELETED' : file.status === 'DELETED')
    throw new ConflictException(kind === 'FILE_RESTORE' ? '只有已删除文件可以恢复' : '已删除文件不能执行此操作')
  const held = Boolean(file.securityHold) || file.status === 'REJECTED' || file.scanStatus === 'INFECTED'
  const rules: string[] = []
  if (bindingCount > 0 && (kind !== 'FILE_REJECT' || file.status === 'READY')) rules.push('BUSINESS_REFERENCES')
  if ((kind === 'FILE_RESTORE' || kind === 'FILE_RESCAN') && held) rules.push('SECURITY_RELEASE')
  if (kind === 'FILE_RESTORE' && file.deletedFromStatus !== 'READY') rules.push('UNKNOWN_OR_UNSAFE_DELETE_ORIGIN')
  const level = maxRiskLevel(configured?.riskLevel || 'L2', rules.length ? 'L3' : 'L2')
  const baseline = resolveRiskDecision(FILE_OPERATION_CODES[kind], { minimumLevel: level })
  return { ...baseline, requireApproval: baseline.requireApproval || Boolean(configured?.requireApproval) || Boolean(configured?.requireDualControl),
    requireDualControl: baseline.requireDualControl || Boolean(configured?.requireDualControl) || rules.includes('SECURITY_RELEASE'),
    rules, policyVersion: FILE_RISK_POLICY_VERSION }
}

export async function lockedFileTarget(tx: Prisma.TransactionClient, fileId: string, tenantId: string, kind: FileOperationKind) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM sys_file_object WHERE id = ${fileId} AND tenant_id = ${tenantId} FOR UPDATE`)
  const file = await tx.fileObject.findFirst({ where: { id: fileId, tenantId } })
  if (!file) throw new NotFoundException('文件不存在')
  const bindings = await tx.fileBinding.findMany({ where: { fileId, tenantId }, orderBy: { id: 'asc' }, select: { id: true, resourceType: true, resourceId: true, fieldName: true, createdAt: true } })
  const configuredPolicy = await tx.operationPolicy.findFirst({ where: { operationCode: FILE_OPERATION_CODES[kind], status: 'ACTIVE' } })
  const snapshot = createHash('sha256').update(JSON.stringify({
    policy: FILE_RISK_POLICY_VERSION, configuredPolicy, kind, id: file.id, tenantId, sha256: file.sha256, size: String(file.size),
    status: file.status, scanStatus: file.scanStatus, updatedAt: file.updatedAt,
    securityHold: file.securityHold, releaseApprovalId: file.releaseApprovalId,
    retentionLocked: file.retentionLocked, deletedFromStatus: file.deletedFromStatus, bindings,
  }, (_key, value) => typeof value === 'bigint' ? String(value) : value)).digest('hex')
  return { file, bindingCount: bindings.length, snapshot }
}
