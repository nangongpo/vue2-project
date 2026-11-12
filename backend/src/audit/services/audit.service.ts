import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { PrismaService } from '#app/database/prisma.service.js'
import { API_CODE } from '#app/common/constants/api-code.js'
import { normalizePagination, paginationData } from '#app/common/pagination.js'
import type { AuditExportQuery, AuditPageQuery, AuditRecordInput } from '#app/audit/types.js'
import { normalizeAuditAction } from '#app/audit/utils/audit-action.js'
import { sanitizeAuditDetail } from '#app/audit/utils/audit-sanitizer.js'
import { auditIntegrityHash } from '#app/audit/utils/audit-integrity.js'

const equalDigest = (left: string | null, right: string) => {
  if (!left || !/^[a-f0-9]{64}$/i.test(left)) return false
  const received = Buffer.from(left, 'hex')
  const expected = Buffer.from(right, 'hex')
  return received.length === expected.length && timingSafeEqual(received, expected)
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditRecordInput, db: Prisma.TransactionClient = this.prisma) {
    const id = randomUUID()
    const createdAt = new Date()
    const record = {
      id,
      traceId: input.traceId,
      tenantId: input.tenantId ?? null,
      membershipId: input.membershipId ?? null,
      organizationId: input.organizationId ?? null,
      departmentId: input.departmentId ?? null,
      actorId: input.actorId ?? null,
      action: input.action,
      operationCode: input.operationCode ?? null,
      riskLevel: input.riskLevel || 'L1',
      resource: input.resource,
      method: input.method,
      path: input.path,
      result: input.result,
      statusCode: input.statusCode,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      detail: sanitizeAuditDetail(input.detail),
      createdAt,
    }
    await db.auditLog.create({
      data: {
        ...record,
        detail: record.detail as Prisma.InputJsonValue,
        integrityHash: auditIntegrityHash(record),
      },
    })
  }

  async page(query: AuditPageQuery) {
    const pagination = normalizePagination(query)
    const { page, pageSize } = pagination
    const actor = query.actorId
      ? await this.prisma.user.findUnique({
          where: { userId: query.actorId },
          select: { id: true },
        })
      : undefined
    const where: Prisma.AuditLogWhereInput = {
      tenantId: query.tenantId,
      ...(query.result ? { result: query.result } : {}),
      ...(query.riskLevel ? { riskLevel: query.riskLevel } : {}),
      ...(query.operationCode ? { operationCode: query.operationCode } : {}),
      ...(query.actorId ? { actorId: actor?.id || -1n } : {}),
      ...(query.keyword
        ? {
            OR: [{ action: { contains: query.keyword } }, { resource: { contains: query.keyword } }, { path: { contains: query.keyword } }],
          }
        : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          traceId: true,
          tenantId: true,
          membershipId: true,
          organizationId: true,
          departmentId: true,
          action: true,
          operationCode: true,
          riskLevel: true,
          resource: true,
          method: true,
          path: true,
          result: true,
          statusCode: true,
          ip: true,
          userAgent: true,
          createdAt: true,
          actor: { select: { userId: true, username: true, displayName: true } },
        },
      }),
    ])
    return {
      code: API_CODE.SUCCESS,
      message: 'success',
      data: paginationData(
        items.map((item) =>
          item.action || item.operationCode || item.method || item.path
            ? { ...item, action: normalizeAuditAction(item) }
            : item
        ),
        total,
        pagination
      ),
    }
  }

  async detail(id: string, tenantId: string) {
    const item = await this.prisma.auditLog.findUnique({
      where: { id, tenantId },
      select: {
        id: true,
        traceId: true,
        tenantId: true,
        membershipId: true,
        organizationId: true,
        departmentId: true,
        action: true,
        operationCode: true,
        riskLevel: true,
        resource: true,
        method: true,
        path: true,
        result: true,
        statusCode: true,
        ip: true,
        userAgent: true,
        detail: true,
        createdAt: true,
        actor: { select: { userId: true, username: true, displayName: true } },
      },
    })
    if (!item) throw new NotFoundException('审计记录不存在')
    return {
      code: API_CODE.SUCCESS,
      message: 'success',
      data: { ...item, action: normalizeAuditAction(item) },
    }
  }

  async verify(id: string, tenantId: string) {
    const item = await this.prisma.auditLog.findUnique({ where: { id, tenantId } })
    if (!item) throw new NotFoundException('审计记录不存在')
    const { integrityHash: storedHash, ...payload } = item
    const expectedHash = auditIntegrityHash(payload)
    return {
      code: API_CODE.SUCCESS,
      message: 'success',
      data: {
        id,
        valid: equalDigest(storedHash, expectedHash),
        algorithm: 'HMAC-SHA256',
      },
    }
  }

  async export(query: AuditExportQuery) {
    const from = new Date(query.from),
      to = new Date(query.to)
    if (!Number.isFinite(+from) || !Number.isFinite(+to) || from > to || +to - +from > 31 * 86400000)
      throw new BadRequestException('导出必须指定不超过 31 天的有效时间范围')
    const items = await this.prisma.auditLog.findMany({
      where: {
        tenantId: query.tenantId,
        createdAt: { gte: from, lte: to },
        ...(query.result ? { result: query.result } : {}),
        ...(query.riskLevel ? { riskLevel: query.riskLevel } : {}),
        ...(query.operationCode ? { operationCode: query.operationCode } : {}),
        ...(query.keyword
          ? {
              OR: [
                { action: { contains: query.keyword } },
                { resource: { contains: query.keyword } },
                { path: { contains: query.keyword } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 1001,
      select: {
        id: true,
        tenantId: true,
        membershipId: true,
        organizationId: true,
        departmentId: true,
        traceId: true,
        action: true,
        operationCode: true,
        riskLevel: true,
        resource: true,
        method: true,
        path: true,
        result: true,
        statusCode: true,
        ip: true,
        createdAt: true,
        actor: { select: { userId: true, username: true } },
      },
    })
    if (items.length > 1000) throw new BadRequestException('单次最多导出 1000 条，请缩小筛选范围')
    const formulaPrefixes = new Set(['=', '+', '@', '-'])
    const cell = (value: unknown) => {
      const text = value instanceof Date ? value.toISOString() : String(value ?? '')
      const firstVisibleCharacter = text.trimStart().charAt(0)
      const safeText = formulaPrefixes.has(firstVisibleCharacter) ? `'${text}` : text
      const escapedText = safeText.replaceAll('"', '""')
      return `"${escapedText}"`
    }
    // 导出列集中定义，新增字段只需增加一项，避免表头与数据依赖位置对应。
    const columns = [
      ['ID', (item: typeof items[number]) => item.id],
      ['TraceID', (item: typeof items[number]) => item.traceId],
      ['时间', (item: typeof items[number]) => item.createdAt],
      ['租户ID', (item: typeof items[number]) => item.tenantId],
      ['成员关系ID', (item: typeof items[number]) => item.membershipId],
      ['组织ID', (item: typeof items[number]) => item.organizationId],
      ['部门ID', (item: typeof items[number]) => item.departmentId],
      ['用户UUID', (item: typeof items[number]) => item.actor?.userId],
      ['账号', (item: typeof items[number]) => item.actor?.username],
      ['操作', (item: typeof items[number]) => normalizeAuditAction(item)],
      ['风险等级', (item: typeof items[number]) => item.riskLevel],
      ['资源', (item: typeof items[number]) => item.resource],
      ['方法', (item: typeof items[number]) => item.method],
      ['路径', (item: typeof items[number]) => item.path],
      ['结果', (item: typeof items[number]) => item.result],
      ['状态码', (item: typeof items[number]) => item.statusCode],
      ['IP', (item: typeof items[number]) => item.ip],
    ] as const
    const rows = [
      columns.map(([header]) => header),
      ...items.map((item) => columns.map(([, value]) => value(item))),
    ]
    return {
      code: API_CODE.SUCCESS,
      message: 'success',
      data: {
        filename: `audit-${new Date().toISOString().slice(0, 10)}.csv`,
        content: '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n'),
      },
    }
  }
}
