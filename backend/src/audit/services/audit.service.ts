import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { AuditResult, Prisma } from '@prisma/client'
import { createHash, randomUUID } from 'node:crypto'
import { PrismaService } from '../../database/prisma.service.js'
import { API_CODE } from '../../common/constants/api-code.js'

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

const integrityHash = (input: Record<string, unknown>) =>
  createHash('sha256')
    .update(JSON.stringify(canonicalize(input)))
    .digest('hex')

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    traceId: string
    actorId?: bigint
    action: string
    resource: string
    method: string
    path: string
    result: 'SUCCESS' | 'FAILURE'
    statusCode: number
    ip?: string
    userAgent?: string
    detail?: Record<string, unknown>
  }) {
    const id = randomUUID()
    const createdAt = new Date()
    const record = {
      id,
      traceId: input.traceId,
      actorId: input.actorId ?? null,
      action: input.action,
      resource: input.resource,
      method: input.method,
      path: input.path,
      result: input.result,
      statusCode: input.statusCode,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      detail: input.detail ?? null,
      createdAt,
    }
    await this.prisma.auditLog.create({
      data: {
        ...record,
        detail: record.detail as Prisma.InputJsonValue,
        integrityHash: integrityHash(record),
      },
    })
  }

  async page(query: {
    keyword?: string
    result?: AuditResult
    actorId?: string
    from?: Date
    to?: Date
    page?: number
    pageSize?: number
  }) {
    const page = query.page || 1
    const pageSize = query.pageSize || 20
    const actor = query.actorId
      ? await this.prisma.user.findUnique({
          where: { userId: query.actorId },
          select: { id: true },
        })
      : undefined
    const where: Prisma.AuditLogWhereInput = {
      ...(query.result ? { result: query.result } : {}),
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
          action: true,
          resource: true,
          method: true,
          path: true,
          result: true,
          statusCode: true,
          ip: true,
          userAgent: true,
          integrityHash: true,
          createdAt: true,
          actor: { select: { userId: true, username: true, displayName: true } },
        },
      }),
    ])
    return { code: API_CODE.SUCCESS, message: 'success', data: { items, total, page, pageSize } }
  }

  async detail(id: string) {
    const item = await this.prisma.auditLog.findUnique({
      where: { id },
      select: {
        id: true,
        traceId: true,
        action: true,
        resource: true,
        method: true,
        path: true,
        result: true,
        statusCode: true,
        ip: true,
        userAgent: true,
        detail: true,
        integrityHash: true,
        createdAt: true,
        actor: { select: { userId: true, username: true, displayName: true } },
      },
    })
    if (!item) throw new NotFoundException('审计记录不存在')
    return { code: API_CODE.SUCCESS, message: 'success', data: item }
  }

  async verify(id: string) {
    const item = await this.prisma.auditLog.findUnique({ where: { id } })
    if (!item) throw new NotFoundException('审计记录不存在')
    const { integrityHash: storedHash, ...payload } = item
    const expectedHash = integrityHash(payload)
    return {
      code: API_CODE.SUCCESS,
      message: 'success',
      data: { id, valid: storedHash !== null && storedHash === expectedHash },
    }
  }

  async export(query: { from: string; to: string; keyword?: string; result?: AuditResult }) {
    const from = new Date(query.from),
      to = new Date(query.to)
    if (!Number.isFinite(+from) || !Number.isFinite(+to) || from > to || +to - +from > 31 * 86400000)
      throw new BadRequestException('导出必须指定不超过 31 天的有效时间范围')
    const items = await this.prisma.auditLog.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        ...(query.result ? { result: query.result } : {}),
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
        traceId: true,
        action: true,
        resource: true,
        method: true,
        path: true,
        result: true,
        statusCode: true,
        ip: true,
        integrityHash: true,
        createdAt: true,
        actor: { select: { userId: true, username: true } },
      },
    })
    if (items.length > 1000) throw new BadRequestException('单次最多导出 1000 条，请缩小筛选范围')
    const cell = (value: unknown) => {
      let text = value instanceof Date ? value.toISOString() : String(value ?? '')
      if (/^\s*[=+@-]/.test(text)) text = `'${text}`
      return `"${text.replaceAll('"', '""')}"`
    }
    const rows = [
      ['ID', 'TraceID', '时间', '用户UUID', '用户名', '操作', '资源', '方法', '路径', '结果', '状态码', 'IP'],
      ...items.map((item) => [
        item.id,
        item.traceId,
        item.createdAt,
        item.actor?.userId,
        item.actor?.username,
        item.action,
        item.resource,
        item.method,
        item.path,
        item.result,
        item.statusCode,
        item.ip,
      ]),
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
