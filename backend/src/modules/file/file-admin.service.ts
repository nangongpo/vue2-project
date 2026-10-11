import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, FileObjectStatus } from '@prisma/client'
import { successResponse } from '#app/common/http/api-response.js'
import { FILE_SCAN_STATUS_LABELS, FILE_STATUS_LABELS } from '#app/common/constants/enum-labels.js'
import { availableAction } from '#app/common/constants/api-name-labels.js'
import { normalizePagination, paginationData } from '#app/common/pagination.js'
import { PrismaService } from '#app/database/prisma.service.js'
import { FileScanService } from '#app/modules/file/file-scan.service.js'
import { requireActor, serializable, type Actor } from '#app/modules/role/domain/authorization.js'
import { ApprovalService, type ApprovalActor } from '#app/modules/permission/services/approval.service.js'
import { DataScopeService } from '#app/security/services/data-scope.service.js'
import type { FileActionPayload } from '#app/modules/permission/dto/approval.dto.js'
import type { FileAdminQueryDto } from '#app/modules/file/file-admin.dto.js'

function view(file: Record<string, unknown>) {
  const plain = JSON.parse(JSON.stringify(file, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))) as Record<string, unknown>
  const allowed = [
    'id', 'tenantId', 'ownerUserId', 'originalName', 'safeName', 'declaredMime', 'detectedMime',
    'extension', 'size', 'sha256', 'classification', 'status', 'scanStatus', 'scanDetail',
    'scanEngineVersion', 'policyVersion', 'createdAt', 'updatedAt', 'deletedAt', 'owner', 'bindings', 'uploads',
  ]
  return Object.fromEntries(allowed.filter((key) => Object.prototype.hasOwnProperty.call(plain, key)).map((key) => [key, plain[key]]))
}

@Injectable()
export class FileAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scans: FileScanService,
    private readonly approvals: ApprovalService,
    private readonly dataScopes: DataScopeService,
  ) {
    for (const kind of ['FILE_DELETE', 'FILE_REJECT', 'FILE_RESTORE', 'FILE_RESCAN'] as const)
      this.approvals.registerExecutionHandler(kind, (tx, request, payload, actor, now) =>
        this.executeApproved(tx, request.kind, payload, request.reason, actor, now)
      )
  }

  async page(query: FileAdminQueryDto, actor: Actor) {
    const scope = await this.fileScope(actor)
    const pagination = normalizePagination(query)
    const filters: Prisma.FileObjectWhereInput = {
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
          tenantId: true,
          ownerUserId: true,
          originalName: true,
          safeName: true,
          declaredMime: true,
          detectedMime: true,
          extension: true,
          size: true,
          sha256: true,
          classification: true,
          status: true,
          scanStatus: true,
          scanDetail: true,
          scanEngineVersion: true,
          policyVersion: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          owner: { select: { userId: true, username: true, displayName: true } },
          bindings: { select: { resourceType: true, resourceId: true, fieldName: true, visibility: true }, take: 10 },
        },
      }),
    ])
    const decorated = await this.decorate(items.map((item) => view(item)), actor)
    return successResponse({
      ...paginationData(decorated, total, pagination),
      meta: {
        statusOptions: Object.entries(FILE_STATUS_LABELS).map(([value, label]) => ({ value, label })),
        scanStatusOptions: Object.entries(FILE_SCAN_STATUS_LABELS).map(([value, label]) => ({ value, label })),
      },
    })
  }

  async detail(fileId: string, actor: Actor) {
    const scope = await this.fileScope(actor)
    const file = await this.prisma.fileObject.findFirst({
      where: { AND: [scope, { id: fileId }] },
      include: {
        owner: { select: { userId: true, username: true, displayName: true } },
        bindings: { orderBy: { createdAt: 'desc' } },
        uploads: {
          select: { id: true, status: true, purpose: true, createdAt: true, updatedAt: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    })
    if (!file) throw new NotFoundException('文件不存在')
    return successResponse((await this.decorate([view(file)], actor))[0])
  }

  private async decorate(items: Array<Record<string, unknown>>, actor: Actor) {
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
    return this.dataScopes.where(actor, 'file') as Promise<Prisma.FileObjectWhereInput>
  }

  async rescan(fileId: string, reason: string, actor: Actor, approvalActor: ApprovalActor) {
    return this.submitApproval('FILE_RESCAN', fileId, reason, actor, approvalActor)
  }

  async reject(fileId: string, reason: string, actor: Actor, approvalActor: ApprovalActor) {
    return this.submitApproval('FILE_REJECT', fileId, reason, actor, approvalActor)
  }

  async delete(fileId: string, reason: string, actor: Actor, approvalActor: ApprovalActor) {
    return this.submitApproval('FILE_DELETE', fileId, reason, actor, approvalActor)
  }

  async restore(fileId: string, reason: string, actor: Actor, approvalActor: ApprovalActor) {
    return this.submitApproval('FILE_RESTORE', fileId, reason, actor, approvalActor)
  }

  private async submitApproval(
    kind: 'FILE_DELETE' | 'FILE_REJECT' | 'FILE_RESTORE' | 'FILE_RESCAN',
    fileId: string,
    reason: string,
    actor: Actor,
    approvalActor: ApprovalActor,
  ) {
    await this.authorizeActor(actor)
    const scope = await this.fileScope(actor)
    const target = await this.prisma.fileObject.findFirst({ where: { AND: [scope, { id: fileId }] }, select: { id: true } })
    if (!target) throw new NotFoundException('文件不存在')
    this.requireReason(reason)
    return this.approvals.createInternal(
      kind,
      { fileId },
      reason,
      approvalActor,
      { traceId: actor.traceId, ip: actor.ip, method: actor.method, path: actor.path, userAgent: actor.userAgent },
    )
  }

  private async executeApproved(
    tx: Prisma.TransactionClient,
    kind: string,
    payload: FileActionPayload,
    reason: string,
    actor: ApprovalActor,
    now: Date,
  ) {
    const scope = await this.dataScopes.where(actor, 'file', tx)
    const file = await tx.fileObject.findFirst({ where: { AND: [scope, { id: payload.fileId }] } })
    if (!file) throw new NotFoundException('文件不存在')
    if (kind === 'FILE_RESCAN') {
      if (file.status === FileObjectStatus.DELETED) throw new ConflictException('已删除文件不能重新扫描')
      const jobId = await this.scans.enqueue(payload.fileId, actor.tenantId, tx)
      const updated = await tx.fileObject.findUniqueOrThrow({ where: { id: payload.fileId } })
      return { before: file, after: { ...(view(updated) as Record<string, unknown>), scanJobId: jobId, scanStatus: 'PENDING' } }
    }
    if (kind === 'FILE_DELETE') {
      if (file.status === FileObjectStatus.DELETED) throw new ConflictException('文件已经删除')
      const after = await tx.fileObject.update({
        where: { id: payload.fileId },
        data: { status: 'DELETED', deletedAt: now, deletedBy: actor.userId },
      })
      return { before: file, after: view(after) }
    }
    if (kind === 'FILE_REJECT') {
      if (file.status === FileObjectStatus.DELETED) throw new ConflictException('已删除文件不能拒绝')
      const after = await tx.fileObject.update({
        where: { id: payload.fileId },
        data: { status: 'REJECTED', scanStatus: 'INFECTED', scanDetail: reason },
      })
      return { before: file, after: view(after) }
    }
    if (file.status !== FileObjectStatus.DELETED) throw new ConflictException('只有已删除文件可以恢复')
    const after = await tx.fileObject.update({
      where: { id: payload.fileId },
      data: { status: 'QUARANTINED', deletedAt: null, deletedBy: null, scanStatus: 'PENDING', scanDetail: null },
    })
    const scanJobId = await this.scans.enqueue(payload.fileId, actor.tenantId, tx)
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
