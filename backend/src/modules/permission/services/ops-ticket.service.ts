import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { OpsTicketType, Prisma } from '@prisma/client'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { PrismaService } from '../../../database/prisma.service.js'
import { normalizePagination, paginationData } from '../../../common/pagination.js'
import { API_CODE } from '../../../common/constants/api-code.js'
import type { Actor } from '../../role/domain/authorization.js'
import type {
  CreateOpsTicketDto,
  OpsEvidenceDto,
  OpsExecutionDto,
  OpsNoteDto,
  OpsTicketQueryDto,
  PatchOpsTicketDto,
} from '../dto/ops-ticket.dto.js'
import { assertOperationSecurityProof, riskLevelForOperation } from '../../../security/policies/risk-policy.js'

const serializable = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
const securityTypes = new Set<OpsTicketType>(['MFA_RESET_EMERGENCY', 'PERMISSION_RECOVERY', 'ACCOUNT_RECOVERY'])

const canonicalize = (value: unknown): unknown => {
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

@Injectable()
export class OpsTicketService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateOpsTicketDto, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const user = await this.authorize(tx, actor, 'system.ops-ticket.create')
      this.assertTypeAccess(user.roleTypes, input.type)
      this.validateCore(input)
      const ticket = await tx.opsTicket.create({
        data: { ...input, ticketNo: this.ticketNo(), requestedBy: user.userId },
      })
      await this.audit(tx, actor, 'ops-ticket.create', ticket.id, null, ticket)
      return this.ok(ticket)
    }, serializable)
  }

  async list(query: OpsTicketQueryDto) {
    const { page, pageSize } = normalizePagination(query)
    const where: Prisma.OpsTicketWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.riskLevel ? { riskLevel: query.riskLevel } : {}),
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.opsTicket.count({ where }),
      this.prisma.opsTicket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { evidence: true, executions: true },
      }),
    ])
    return this.ok(paginationData(items, total, { page, pageSize }))
  }

  async detail(id: string) {
    const ticket = await this.prisma.opsTicket.findUnique({
      where: { id },
      include: {
        evidence: { orderBy: { createdAt: 'asc' } },
        executions: { orderBy: { executedAt: 'asc' } },
      },
    })
    if (!ticket) throw new NotFoundException('工单不存在')
    return this.ok(ticket)
  }

  async patch(id: string, input: PatchOpsTicketDto, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      await this.authorize(tx, actor, 'system.ops-ticket.update')
      const before = await tx.opsTicket.findUnique({ where: { id } })
      if (!before) throw new NotFoundException('工单不存在')
      if (before.status !== 'DRAFT') throw new ConflictException('仅草稿工单允许修改')
      const after = await tx.opsTicket.update({ where: { id }, data: input })
      await this.audit(tx, actor, 'ops-ticket.update', id, before, after)
      return this.ok(after)
    }, serializable)
  }

  async submit(id: string, actor: Actor) {
    return this.transition(id, 'SUBMITTED', actor, 'ops-ticket.submit')
  }

  async approve(id: string, input: OpsNoteDto, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const user = await this.authorize(tx, actor, 'system.ops-ticket.approve')
      const before = await tx.opsTicket.findUnique({ where: { id } })
      if (!before) throw new NotFoundException('工单不存在')
      if (before.status !== 'SUBMITTED') throw new ConflictException('工单当前状态不可确认')
      if (same(user.userId, before.requestedBy)) throw new ForbiddenException('申请人不能确认自己的工单')
      this.assertTypeAccess(user.roleTypes, before.type)
      const after = await tx.opsTicket.updateMany({
        where: { id, status: 'SUBMITTED' },
        data: { status: 'APPROVED', approvedBy: user.userId, approvedAt: new Date() },
      })
      if (after.count !== 1) throw new ConflictException('工单已被其他操作处理')
      const result = await tx.opsTicket.findUniqueOrThrow({ where: { id } })
      await this.audit(tx, actor, 'ops-ticket.approve', id, before, { ...result, note: input.note })
      return this.ok(result)
    }, serializable)
  }

  async execute(id: string, input: OpsNoteDto, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const user = await this.authorize(tx, actor, 'system.ops-ticket.execute')
      const before = await tx.opsTicket.findUnique({ where: { id } })
      if (!before) throw new NotFoundException('工单不存在')
      if (before.status !== 'APPROVED') throw new ConflictException('工单当前状态不可执行')
      if ([before.requestedBy, before.approvedBy].some((value) => value && same(value, user.userId)))
        throw new ForbiddenException('执行人必须独立于申请和确认人员')
      this.assertTypeAccess(user.roleTypes, before.type)
      const changed = await tx.opsTicket.updateMany({
        where: { id, status: 'APPROVED' },
        data: { status: 'EXECUTED', executedBy: user.userId, executedAt: new Date() },
      })
      if (changed.count !== 1) throw new ConflictException('工单已被其他操作处理')
      const result = await tx.opsTicket.findUniqueOrThrow({ where: { id } })
      await this.audit(tx, actor, 'ops-ticket.execute', id, before, { ...result, note: input.note })
      return this.ok(result)
    }, serializable)
  }

  async review(id: string, input: OpsNoteDto, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const user = await this.authorize(tx, actor, 'system.ops-ticket.review')
      const before = await tx.opsTicket.findUnique({ where: { id } })
      if (!before) throw new NotFoundException('工单不存在')
      if (before.status !== 'EXECUTED') throw new ConflictException('仅已执行工单允许复核')
      if ([before.requestedBy, before.approvedBy, before.executedBy].some((value) => value && same(value, user.userId)))
        throw new ForbiddenException('复核人必须独立于其他阶段人员')
      const changed = await tx.opsTicket.updateMany({
        where: { id, status: 'EXECUTED' },
        data: {
          status: 'REVIEWED',
          reviewedBy: user.userId,
          reviewedAt: new Date(),
          closedAt: new Date(),
        },
      })
      if (changed.count !== 1) throw new ConflictException('工单已被其他操作处理')
      const result = await tx.opsTicket.findUniqueOrThrow({ where: { id } })
      await this.audit(tx, actor, 'ops-ticket.review', id, before, { ...result, note: input.note })
      return this.ok(result)
    }, serializable)
  }

  async cancel(id: string, input: OpsNoteDto, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const user = await this.authorize(tx, actor, 'system.ops-ticket.cancel')
      const before = await tx.opsTicket.findUnique({ where: { id } })
      if (!before) throw new NotFoundException('工单不存在')
      if (!['DRAFT', 'SUBMITTED'].includes(before.status)) throw new ConflictException('当前状态不可取消')
      if (!same(before.requestedBy, user.userId)) throw new ForbiddenException('只有申请人可以取消草稿或待确认工单')
      const changed = await tx.opsTicket.updateMany({
        where: { id, status: before.status },
        data: { status: 'CANCELLED', closedAt: new Date() },
      })
      if (changed.count !== 1) throw new ConflictException('工单已被其他操作处理')
      const result = await tx.opsTicket.findUniqueOrThrow({ where: { id } })
      await this.audit(tx, actor, 'ops-ticket.cancel', id, before, { ...result, note: input.note })
      return this.ok(result)
    }, serializable)
  }

  async addEvidence(id: string, input: OpsEvidenceDto, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const user = await this.authorize(tx, actor, 'system.ops-ticket.evidence')
      const ticket = await tx.opsTicket.findUnique({ where: { id } })
      if (!ticket) throw new NotFoundException('工单不存在')
      if (ticket.status === 'REVIEWED' || ticket.status === 'CANCELLED') throw new ConflictException('已关闭工单不能追加证据')
      const evidence = await tx.opsTicketEvidence.create({
        data: { ...input, ticketId: id, uploadedBy: user.userId },
      })
      await this.audit(tx, actor, 'ops-ticket.evidence', id, null, evidence)
      return this.ok(evidence)
    }, serializable)
  }

  async addExecution(id: string, input: OpsExecutionDto, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const user = await this.authorize(tx, actor, 'system.ops-ticket.executions')
      const ticket = await tx.opsTicket.findUnique({ where: { id } })
      if (!ticket) throw new NotFoundException('工单不存在')
      if (ticket.ticketNo !== input.ticketNo || !['APPROVED', 'EXECUTED'].includes(ticket.status))
        throw new ConflictException('工单号不匹配或工单不允许执行回写')
      if (input.type && input.type !== ticket.type) throw new BadRequestException('执行记录类型与工单不匹配')
      this.verifyExecutionSignature(id, input)
      const duplicate = await tx.opsTicketExecution.findFirst({
        where: { ticketId: id, traceId: input.traceId },
        select: { id: true },
      })
      if (duplicate) throw new ConflictException('执行记录已回写，禁止重复提交')
      const execution = await tx.opsTicketExecution.create({
        data: {
          ticketId: id,
          ticketNo: input.ticketNo,
          executorUserId: user.userId,
          operatorOsUser: input.operatorOsUser,
          operatorHost: input.operatorHost,
          operatorIp: actor.ip,
          dbCurrentUser: input.dbCurrentUser,
          gitCommit: input.gitCommit,
          scriptName: input.scriptName,
          scriptVersion: input.scriptVersion,
          commandHash: input.commandHash,
          dryRun: input.dryRun,
          result: input.result,
          beforeSnapshot: this.safeSnapshot(input.beforeSnapshot),
          afterSnapshot: this.safeSnapshot(input.afterSnapshot),
          traceId: input.traceId,
          signedAt: new Date(input.signedAt),
          executionSignature: input.signature.toLowerCase(),
        },
      })
      await this.audit(tx, actor, 'ops-ticket.execution', id, null, {
        id: execution.id,
        result: execution.result,
        traceId: execution.traceId,
        scriptName: execution.scriptName,
      })
      return this.ok(execution)
    }, serializable)
  }

  private async transition(id: string, status: 'SUBMITTED', actor: Actor, action: string) {
    return this.prisma.$transaction(async (tx) => {
      const user = await this.authorize(tx, actor, 'system.ops-ticket.submit')
      const before = await tx.opsTicket.findUnique({ where: { id } })
      if (!before) throw new NotFoundException('工单不存在')
      if (before.status !== 'DRAFT' || !same(before.requestedBy, user.userId)) throw new ConflictException('只有申请人可提交草稿工单')
      this.validateCore(before)
      const changed = await tx.opsTicket.updateMany({
        where: { id, status: 'DRAFT' },
        data: { status },
      })
      if (changed.count !== 1) throw new ConflictException('工单已被其他操作处理')
      const after = await tx.opsTicket.findUniqueOrThrow({ where: { id } })
      await this.audit(tx, actor, action, id, before, after)
      return this.ok(after)
    }, serializable)
  }

  private verifyExecutionSignature(ticketId: string, input: OpsExecutionDto) {
    const secret = process.env.OPS_EXECUTION_SIGNING_SECRET
    if (!secret || secret.length < 32) throw new ServiceUnavailableException('应急执行签名服务未配置')

    const signedAt = Date.parse(input.signedAt)
    if (!Number.isFinite(signedAt) || Math.abs(Date.now() - signedAt) > 5 * 60_000)
      throw new BadRequestException('应急执行签名已过期或时间无效')

    const { signature, ...unsigned } = input
    const payload = JSON.stringify(canonicalize({ ticketId, ...unsigned }))
    const expected = createHmac('sha256', secret).update(payload).digest()
    const received = Buffer.from(signature, 'hex')
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new ForbiddenException('应急执行记录签名无效')
  }

  private async authorize(tx: Prisma.TransactionClient, actor: Actor, permission: string) {
    if (!actor || typeof actor.internalId !== 'bigint') throw new ForbiddenException('缺少操作者身份')
    if (!['system.ops-ticket.read', 'system.ops-ticket.detail'].includes(permission)) {
      assertOperationSecurityProof(actor, 'system.ops-ticket.mutation')
    }
    const user = await tx.user.findUnique({
      where: { id: actor.internalId },
      select: {
        userId: true,
        status: true,
        expiresAt: true,
        roles: {
          where: {
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            role: {
              status: 'ACTIVE',
              permissions: {
                some: {
                  revokedAt: null,
                  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                  permission: { code: permission, status: 'ACTIVE' },
                },
              },
            },
          },
          select: { role: { select: { roleType: true } } },
        },
      },
    })
    if (!user || user.status !== 'ACTIVE' || (user.expiresAt && user.expiresAt <= new Date()) || !user.roles.length)
      throw new ForbiddenException('无权操作运维应急工单')
    return { userId: user.userId, roleTypes: user.roles.map((item) => item.role.roleType) }
  }

  private assertTypeAccess(roleTypes: string[], type: OpsTicketType | string) {
    if (securityTypes.has(type as OpsTicketType) && !roleTypes.includes('SECURITY'))
      throw new ForbiddenException('安全类工单必须由安全管理员处理')
    if (type === 'DB_MANUAL_FIX' && !roleTypes.some((role) => ['SECURITY', 'SYSTEM'].includes(role)))
      throw new ForbiddenException('系统类工单必须由系统或安全管理员处理')
    if (type === 'MFA_RESET_EMERGENCY' && !roleTypes.includes('SECURITY')) throw new ForbiddenException('MFA 应急重置必须由安全管理员处理')
  }

  private validateCore(
    input: Partial<
      Pick<
        CreateOpsTicketDto,
        'title' | 'reason' | 'targetType' | 'offlineBasis' | 'identityVerification' | 'offlineApprover' | 'offlineReviewer'
      >
    > & {
      targetId?: string | null
    }
  ) {
    for (const key of ['title', 'reason', 'offlineBasis', 'identityVerification', 'offlineApprover', 'offlineReviewer'] as const)
      if (!input[key]?.trim()) throw new BadRequestException('线下依据、身份核验、批准人和复核人均为必填')
    if (input.targetType && input.targetType !== 'OTHER' && !input.targetId) throw new BadRequestException('有目标类型时必须填写目标标识')
  }

  private ticketNo() {
    const now = new Date()
    return `OPS-${now.toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 6).toUpperCase()}`
  }
  private safeSnapshot(value: unknown) {
    return value === undefined
      ? undefined
      : (JSON.parse(
          JSON.stringify(value, (_key, item) => (/password|secret|token|credential|验证码|口令/i.test(_key) ? '[REDACTED]' : item))
        ) as Prisma.InputJsonValue)
  }
  private ok<T>(data: T) {
    return { code: API_CODE.SUCCESS, message: 'success', data }
  }
  private async audit(tx: Prisma.TransactionClient, actor: Actor, action: string, targetId: string, before: unknown, after: unknown) {
    await tx.auditLog.create({
      data: {
        actorId: actor.internalId,
        traceId: actor.traceId || randomUUID(),
        action,
        riskLevel: riskLevelForOperation(action),
        resource: 'ops-ticket',
        method: actor.method || 'POST',
        path: actor.path || `/api/v1/ops-tickets/${targetId}`,
        result: 'SUCCESS',
        statusCode: 200,
        ip: actor.ip,
        userAgent: actor.userAgent,
        detail: JSON.parse(
          JSON.stringify({ targetId, before, after }, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))
        ),
      },
    })
  }
}

function same(a?: string | null, b?: string | null) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}
