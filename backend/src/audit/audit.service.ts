import { Injectable, NotFoundException } from '@nestjs/common'
import { AuditResult, Prisma } from '@prisma/client'
import { PrismaService } from '../database/prisma.service.js'
import { API_CODE } from '../common/api-code.js'

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
    await this.prisma.auditLog.create({ data: { ...input, detail: input.detail as any } })
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
    const actor = query.actorId ? await this.prisma.user.findUnique({ where: { userId: query.actorId }, select: { id: true } }) : undefined
    const where: Prisma.AuditLogWhereInput = {
      ...(query.result ? { result: query.result } : {}),
      ...(query.actorId ? { actorId: actor?.id || -1n } : {}),
      ...(query.keyword ? { OR: [{ action: { contains: query.keyword } }, { resource: { contains: query.keyword } }, { path: { contains: query.keyword } }] } : {}),
      ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, traceId: true, action: true, resource: true, method: true,
          path: true, result: true, statusCode: true, ip: true, userAgent: true, createdAt: true,
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
        createdAt: true,
        actor: { select: { userId: true, username: true, displayName: true } },
      },
    })
    if (!item) throw new NotFoundException('审计记录不存在')
    return { code: API_CODE.SUCCESS, message: 'success', data: item }
  }
}
