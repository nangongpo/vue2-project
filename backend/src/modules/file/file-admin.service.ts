import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { createHash, randomUUID } from 'node:crypto'
import { Prisma, FileObjectStatus, type ApprovalRequest } from '@prisma/client'
import { successResponse } from '#app/common/http/api-response.js'
import { FILE_CLASSIFICATION_LABELS, FILE_SCAN_STATUS_LABELS, FILE_STATUS_LABELS } from '#app/common/constants/enum-labels.js'
import { availableAction } from '#app/common/constants/api-name-labels.js'
import { normalizePagination, paginationData } from '#app/common/pagination.js'
import { PrismaService } from '#app/database/prisma.service.js'
import { FileScanService } from '#app/modules/file/file-scan.service.js'
import { requireActor, serializable, type Actor } from '#app/modules/role/domain/authorization.js'
import { ApprovalService, type ApprovalActor } from '#app/modules/permission/services/approval.service.js'
import { DataScopeService } from '#app/security/services/data-scope.service.js'
import type { FileActionPayload } from '#app/modules/permission/dto/approval.dto.js'
import type { FileAdminQueryDto } from '#app/modules/file/file-admin.dto.js'
import { AuditService } from '#app/audit/services/audit.service.js'
import { OperationPolicyService } from '#app/security/services/operation-policy.service.js'
import { hasRecentSecurityProof, securityStepUpException } from '#app/security/policies/risk-policy.js'
import { FILE_OPERATION_CODES, fileOperationRisk, lockedFileTarget, type FileOperationKind } from '#app/modules/file/file-operation-policy.js'

function view(file: Record<string, unknown>) {
  const plain = JSON.parse(JSON.stringify(file, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))) as Record<string, unknown>
  const allowed = [
    'id', 'tenantId', 'ownerUserId', 'originalName', 'safeName', 'declaredMime', 'detectedMime',
    'extension', 'size', 'sha256', 'classification', 'status', 'scanStatus', 'scanDetail',
    'scanEngineVersion', 'policyVersion', 'createdAt', 'updatedAt', 'deletedAt', 'owner', 'bindings', 'uploads',
  ]
  return Object.fromEntries(allowed.filter((key) => Object.prototype.hasOwnProperty.call(plain, key)).map((key) => [key, plain[key]]))
}

// 页面响应独立投影；审批审计快照继续使用 view，避免展示需求影响审计。
function pickFields<K extends string>(value: Record<string, unknown>, fields: readonly K[]): Record<K, unknown> {
  return Object.fromEntries(fields.filter((field) => Object.prototype.hasOwnProperty.call(value, field))
    .map((field) => [field, typeof value[field] === 'bigint' ? String(value[field]) : value[field]])) as Record<K, unknown>
}

function bindingsView(value: unknown, detail: boolean) {
  return Array.isArray(value) ? value.map((binding) => pickFields(binding, [
    'resourceType', 'resourceId', 'fieldName', ...(detail ? ['id', 'visibility'] : []),
  ])) : []
}

@Injectable()
export class FileAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scans: FileScanService,
    private readonly approvals: ApprovalService,
    private readonly dataScopes: DataScopeService,
    private readonly policies: OperationPolicyService,
    private readonly audit: AuditService,
  ) {
    for (const kind of ['FILE_DELETE', 'FILE_REJECT', 'FILE_RESTORE', 'FILE_RESCAN'] as const)
      this.approvals.registerExecutionHandler(kind, (tx, request, payload, actor, now) =>
        this.executeApproved(tx, request.kind, payload, request.reason, actor, now, request)
      )
  }

  async page(query: FileAdminQueryDto, actor: Actor) {
    const scope = await this.fileScope(actor)
    const pagination = normalizePagination(query)
    const filters = this.fileFilters(query)
    const where: Prisma.FileObjectWhereInput = { AND: [scope, filters] }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.fileObject.count({ where }),
      this.prisma.fileObject.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
        select: {
          id: true,
          originalName: true,
          safeName: true,
          size: true,
          status: true,
          scanStatus: true,
          createdAt: true,
          owner: { select: { username: true, displayName: true } },
          bindings: { select: { resourceType: true, resourceId: true, fieldName: true }, take: 10 },
        },
      }),
    ])
    const decorated = await this.decorate(items.map((item) => view(item)), actor)
    return successResponse({
      ...paginationData(decorated.map((item) => ({
        ...pickFields(item, ['id', 'originalName', 'safeName', 'size', 'createdAt',
          'statusLabel', 'statusTone', 'scanStatusLabel', 'scanStatusTone', 'availableActions']),
        owner: item.owner ? pickFields(item.owner as Record<string, unknown>, ['username', 'displayName']) : null,
        bindings: bindingsView(item.bindings, false),
      })), total, pagination),
      meta: {
        statusOptions: Object.entries(FILE_STATUS_LABELS).map(([value, label]) => ({ value, label })),
        scanStatusOptions: Object.entries(FILE_SCAN_STATUS_LABELS).map(([value, label]) => ({ value, label })),
      },
    })
  }

  async auditPage(query: FileAdminQueryDto, actor: Actor) {
    const scope = await this.dataScopes.where(actor, 'system.file.audit') as Prisma.FileObjectWhereInput
    const pagination = normalizePagination(query)
    const where: Prisma.FileObjectWhereInput = { AND: [scope, this.fileFilters(query)] }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.fileObject.count({ where }),
      this.prisma.fileObject.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
        select: {
          id: true,
          tenantId: true,
          organizationId: true,
          departmentId: true,
          ownerUserId: true,
          originalName: true,
          status: true,
          scanStatus: true,
          scanDetail: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ])
    const safeItems = items.map((item) => ({
      ...view(item),
      statusLabel: FILE_STATUS_LABELS[item.status] || '—',
      scanStatusLabel: FILE_SCAN_STATUS_LABELS[item.scanStatus] || '—',
    }))
    return successResponse({
      ...paginationData(safeItems, total, pagination),
      meta: {
        statusOptions: Object.entries(FILE_STATUS_LABELS).map(([value, label]) => ({ value, label })),
        scanStatusOptions: Object.entries(FILE_SCAN_STATUS_LABELS).map(([value, label]) => ({ value, label })),
      },
    })
  }

  private fileFilters(query: FileAdminQueryDto): Prisma.FileObjectWhereInput {
    return {
      ...(query.status ? { status: query.status } : {}),
      ...(query.scanStatus ? { scanStatus: query.scanStatus } : {}),
      ...(query.keyword
        ? {
            OR: [
              { originalName: { contains: query.keyword } },
              { safeName: { contains: query.keyword } },
              { sha256: { contains: query.keyword } },
            ],
          }
        : {}),
      ...(query.minSize !== undefined || query.maxSize !== undefined
        ? {
            size: {
              ...(query.minSize !== undefined ? { gte: BigInt(query.minSize) } : {}),
              ...(query.maxSize !== undefined ? { lte: BigInt(query.maxSize) } : {}),
            },
          }
        : {}),
      ...(query.resourceType || query.resourceId
        ? {
            bindings: {
              some: {
                ...(query.resourceType ? { resourceType: query.resourceType } : {}),
                ...(query.resourceId ? { resourceId: query.resourceId } : {}),
              },
            },
          }
        : {}),
    }
  }

  async detail(fileId: string, actor: Actor) {
    const scope = await this.fileScope(actor)
    const file = await this.prisma.fileObject.findFirst({
      where: { AND: [scope, { id: fileId }] },
      select: {
        id: true,
        originalName: true,
        safeName: true,
        size: true,
        declaredMime: true,
        detectedMime: true,
        classification: true,
        createdAt: true,
        updatedAt: true,
        sha256: true,
        scanEngineVersion: true,
        policyVersion: true,
        scanDetail: true,
        bindings: {
          select: { id: true, resourceType: true, resourceId: true, fieldName: true, visibility: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    })
    if (!file) throw new NotFoundException('文件不存在')
    return successResponse({
      ...pickFields(file, ['id', 'originalName', 'safeName', 'size', 'declaredMime', 'detectedMime',
        'createdAt', 'updatedAt', 'sha256', 'scanEngineVersion', 'policyVersion', 'scanDetail']),
      classificationLabel: FILE_CLASSIFICATION_LABELS[file.classification] || '未知分类',
      bindings: bindingsView(file.bindings, true),
    })
  }

  private async decorate(items: Array<Record<string, unknown>>, actor: Actor): Promise<Array<Record<string, unknown>>> {
    const permissions = await this.permissionSet(actor)
    return items.map((item) => {
      const status = typeof item.status === 'string' ? item.status : ''
      const scanStatus = typeof item.scanStatus === 'string' ? item.scanStatus : ''
      return ({
      ...item,
      statusLabel: FILE_STATUS_LABELS[status as keyof typeof FILE_STATUS_LABELS] || '—',
      statusTone: status === 'QUARANTINED' ? 'warning' : status === 'READY' ? 'success' : status === 'REJECTED' ? 'danger' : 'info',
      scanStatusLabel: FILE_SCAN_STATUS_LABELS[scanStatus as keyof typeof FILE_SCAN_STATUS_LABELS] || '—',
      scanStatusTone: scanStatus === 'PENDING' ? 'warning' : scanStatus === 'CLEAN' ? 'success' : 'danger',
      availableActions: status === 'DELETED'
        ? permissions.has('system.file.admin.restore') ? [availableAction('restore', 'system.file.admin.restore')] : []
        : [
            permissions.has('system.file.admin.scan') ? availableAction('rescan', 'system.file.admin.scan') : null,
            permissions.has('system.file.admin.reject') ? availableAction('reject', 'system.file.admin.reject') : null,
            permissions.has('system.file.admin.delete') ? availableAction('delete', 'system.file.admin.delete') : null,
          ].filter(Boolean),
      })
    })
  }

  private async permissionSet(actor: Actor) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.internalId },
      select: {
        roles: {
          where: {
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            role: { status: 'ACTIVE', tenantId: actor.tenantId },
          },
          select: { role: { select: { permissions: { where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }], permission: { status: 'ACTIVE' } }, select: { permission: { select: { code: true } } } } } } },
        },
      },
    })
    return new Set((user?.roles || []).flatMap(({ role }) => role.permissions.map(({ permission }) => permission.code)))
  }

  private async fileScope(actor: Actor) {
    // 系统文件管理使用独立的数据资源；不能复用业务文件的 SELF 范围。
    // 安全管理员和系统管理员的默认范围由 seed 初始化为当前租户 TENANT。
    return this.dataScopes.where(actor, 'system.file') as Promise<Prisma.FileObjectWhereInput>
  }

  async rescan(fileId: string, reason: string, actor: Actor, user: ApprovalActor, releaseReason?: string, key?: string) {
    return this.perform('FILE_RESCAN', fileId, reason, actor, user, releaseReason, key)
  }

  async reject(fileId: string, reason: string, actor: Actor, user: ApprovalActor, key?: string) {
    return this.perform('FILE_REJECT', fileId, reason, actor, user, undefined, key)
  }

  async delete(fileId: string, reason: string, actor: Actor, user: ApprovalActor, key?: string) {
    return this.perform('FILE_DELETE', fileId, reason, actor, user, undefined, key)
  }

  async restore(fileId: string, reason: string, actor: Actor, user: ApprovalActor, releaseReason?: string, key?: string) {
    return this.perform('FILE_RESTORE', fileId, reason, actor, user, releaseReason, key)
  }

  private async perform(kind: FileOperationKind, fileId: string, reason: string, actor: Actor, user: ApprovalActor, releaseReason?: string, key: string = randomUUID()) {
    await this.authorizeActor(actor)
    this.requireReason(reason)
    if (releaseReason !== undefined) this.requireReason(releaseReason)
    const scope = await this.fileScope(actor)
    const code = FILE_OPERATION_CODES[kind]
    if (!user.permissions.includes(code)) throw new ForbiddenException('无权执行此文件操作')
    if (!user.mfaEnabled) throw new ForbiddenException('文件管理操作必须先绑定多因素认证')
    const requestKey = createHash('sha256').update(JSON.stringify([actor.tenantId, String(actor.internalId), kind, fileId, key])).digest('hex')
    const fingerprint = createHash('sha256').update(JSON.stringify([reason, releaseReason || null])).digest('hex')
    const result = await this.prisma.$transaction(async (tx) => {
      const target = await lockedFileTarget(tx, fileId, actor.tenantId, kind)
      const visible = await tx.fileObject.findFirst({ where: { AND: [scope, { id: fileId }] }, select: { id: true } })
      if (!visible) throw new NotFoundException('文件不存在')
      const configured = await this.policies.resolve(code, [code], tx)
      if (!hasRecentSecurityProof(user, configured.riskLevel)) throw securityStepUpException(user, configured)
      const prior = await tx.fileManagementCommand.findUnique({ where: { requestKey } })
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new ConflictException('幂等键已绑定其他操作内容')
        return prior.result as { status: string; riskLevel: string }
      }
      const decision = fileOperationRisk(kind, target.file, target.bindingCount, configured)
      if (releaseReason && !['FILE_RESCAN', 'FILE_RESTORE'].includes(kind)) throw new BadRequestException('此操作不支持解除安全封禁')
      if (releaseReason) { decision.riskLevel = 'L3'; decision.requireApproval = true; decision.requireDualControl = true }
      if (!hasRecentSecurityProof(user, decision.riskLevel)) throw securityStepUpException(user, decision)
      if (decision.requireApproval) {
        await this.approvals.createInternal(kind, { fileId, ...(releaseReason ? { releaseReason } : {}) }, reason, user,
          { traceId: actor.traceId, ip: actor.ip, method: actor.method, path: actor.path, userAgent: actor.userAgent }, tx)
        const response = { status: 'PENDING_APPROVAL', riskLevel: 'L3' }
        await tx.fileManagementCommand.create({ data: { tenantId: actor.tenantId, requestKey, fingerprint, result: response } })
        return response
      }
      const mutation = await this.executeMutation(tx, kind, { fileId }, reason, user, new Date())
      const response = { status: 'EXECUTED', riskLevel: decision.riskLevel }
      await this.audit.record({ traceId: actor.traceId || randomUUID(), tenantId: actor.tenantId,
        actorId: actor.internalId, action: `file.admin.${kind.slice(5).toLowerCase()}`, operationCode: code,
        riskLevel: decision.riskLevel, resource: 'system.file', method: actor.method || 'POST',
        path: actor.path || '/files', result: 'SUCCESS', statusCode: 200,
        detail: { reason, policyVersion: decision.policyVersion, rules: decision.rules, targetSnapshot: target.snapshot, ...mutation } }, tx)
      await tx.fileManagementCommand.create({ data: { tenantId: actor.tenantId, requestKey, fingerprint, result: response } })
      return response
    }, serializable)
    return successResponse(result)
  }

  private async executeApproved(
    tx: Prisma.TransactionClient,
    kind: string,
    payload: FileActionPayload,
    reason: string,
    actor: ApprovalActor,
    now: Date,
    request: ApprovalRequest,
  ) {
    const target = await lockedFileTarget(tx, payload.fileId, actor.tenantId, kind as FileOperationKind)
    if (!payload.targetSnapshot || payload.targetSnapshot !== target.snapshot)
      throw new ConflictException('文件、关联或风险策略已变化，请重新申请审批')
    if (payload.releaseReason && request.applicantId === actor.userId) throw new ForbiddenException('安全解除执行人必须独立于申请人')
    const configured = await this.policies.resolve(FILE_OPERATION_CODES[kind as FileOperationKind], [], tx)
    const decision = fileOperationRisk(kind as FileOperationKind, target.file, target.bindingCount, configured)
    if (decision.requireDualControl && request.applicantId === actor.userId) throw new ForbiddenException('此操作的执行人必须独立于申请人')
    if (!actor.mfaEnabled) throw new ForbiddenException('文件管理操作必须先绑定多因素认证')
    if (!hasRecentSecurityProof(actor, 'L3')) throw securityStepUpException(actor, { ...decision, riskLevel: 'L3' })
    return this.executeMutation(tx, kind, payload, reason, actor, now, request)
  }

  private async executeMutation(tx: Prisma.TransactionClient, kind: string, payload: FileActionPayload, reason: string,
    actor: ApprovalActor, now: Date, request?: ApprovalRequest) {
    // 审批执行仍属于系统文件管理，必须沿用 system.file 的租户/数据范围，
    // 不能退回业务资源 file，否则会造成授权检查前后不一致。
    const scope = await this.dataScopes.where(actor, 'system.file', tx)
    const file = await tx.fileObject.findFirst({ where: { AND: [scope, { id: payload.fileId }] } })
    if (!file) throw new NotFoundException('文件不存在')
    if (kind === 'FILE_RESCAN') {
      if (file.status === FileObjectStatus.DELETED) throw new ConflictException('已删除文件不能重新扫描')
      const jobId = await this.scans.enqueue(payload.fileId, actor.tenantId, {
        source: kind === 'FILE_RESCAN' ? 'RESCAN' : 'RESTORE', sourceKey: request?.id || randomUUID(), approvalId: request?.id,
        securityReleaseApprovalId: payload.releaseReason ? request?.id : undefined,
        requestedBy: request?.applicantId || actor.userId, requestedByName: request?.applicantDisplayName || actor.displayName, executedBy: actor.userId,
        executedByName: actor.displayName, reason,
      }, tx)
      const updated = await tx.fileObject.findUniqueOrThrow({ where: { id: payload.fileId } })
      return { before: file, after: { ...(view(updated) as Record<string, unknown>), scanJobId: jobId, scanStatus: 'PENDING' } }
    }
    if (kind === 'FILE_DELETE') {
      if (file.status === FileObjectStatus.DELETED) throw new ConflictException('文件已经删除')
      await this.scans.cancel(payload.fileId, actor.tenantId, tx)
      const after = await tx.fileObject.update({
        where: { id: payload.fileId },
        data: { currentScanJobId: null, status: 'DELETED', deletedAt: now, deletedBy: actor.userId, deletedFromStatus: file.status },
      })
      return { before: file, after: view(after) }
    }
    if (kind === 'FILE_REJECT') {
      if (file.status === FileObjectStatus.DELETED) throw new ConflictException('已删除文件不能拒绝')
      await this.scans.cancel(payload.fileId, actor.tenantId, tx)
      const after = await tx.fileObject.update({
        where: { id: payload.fileId },
        data: { currentScanJobId: null, status: 'REJECTED', securityHold: file.securityHold || 'MANUAL', securityHoldAt: file.securityHoldAt || now, securityHoldReason: file.securityHoldReason || reason },
      })
      return { before: file, after: view(after) }
    }
    if (file.status !== FileObjectStatus.DELETED) throw new ConflictException('只有已删除文件可以恢复')
    const after = await tx.fileObject.update({
      where: { id: payload.fileId },
      data: { status: 'QUARANTINED', deletedAt: null, deletedBy: null, scanStatus: 'PENDING', scanDetail: null },
    })
    const scanJobId = await this.scans.enqueue(payload.fileId, actor.tenantId, {
        source: kind === 'FILE_RESCAN' ? 'RESCAN' : 'RESTORE', sourceKey: request?.id || randomUUID(), approvalId: request?.id,
        securityReleaseApprovalId: payload.releaseReason ? request?.id : undefined,
        requestedBy: request?.applicantId || actor.userId, requestedByName: request?.applicantDisplayName || actor.displayName, executedBy: actor.userId,
        executedByName: actor.displayName, reason,
      }, tx)
    return { before: file, after: { ...(view(after) as Record<string, unknown>), scanJobId } }
  }

  private async authorizeActor(actor: Actor) {
    await this.prisma.$transaction((tx) => requireActor(tx, actor), serializable)
  }

  private async userId(actor: Actor) {
    return this.prisma.$transaction((tx) => requireActor(tx, actor), serializable)
  }

  private requireReason(reason: string) {
    if (!reason || !reason.trim() || reason.length > 255)
      throw new BadRequestException('必须填写操作原因，最多 255 个字符')
  }
}
