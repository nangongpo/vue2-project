import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { OrderStatus, Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../../../database/prisma.service.js'
import { API_CODE } from '../../../common/constants/api-code.js'
import { ORDER_STATUS_LABELS } from '../../../common/constants/enum-labels.js'
import { audit, requireActor, serializable, type Actor } from '../../role/domain/authorization.js'
import { assertEditable, assertOrderTransition } from '../domain/order.policy.js'
import type { CreateOrderDto, UpdateOrderDto } from '../dto/order.dto.js'

type OrderContext = {
  userId: string
  tenantId: string | null
  departmentId: string | null
  organizationId: string | null
}

@Injectable()
export class OrderService {
  constructor(private readonly prisma: PrismaService) {}

  private async context(actor: Actor, db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<OrderContext> {
    const userId = await requireActor(db as Prisma.TransactionClient, actor)
    const user = await db.user.findUnique({
      where: { id: actor.internalId },
      select: { userId: true, tenantId: true, departmentId: true, organizationId: true },
    })
    if (!user || user.userId !== userId) throw new NotFoundException('操作者不存在')
    return user
  }

  private scope(context: OrderContext): Prisma.OrderWhereInput {
    // Tenant-bound users stay within their tenant. Accounts without a tenant
    // are isolated to their own orders instead of receiving global access.
    return context.tenantId ? { tenantId: context.tenantId } : { tenantId: null, ownerId: context.userId }
  }

  private format(order: {
    orderId: string
    orderNo: string
    customerName: string
    totalAmount: Prisma.Decimal | number | string
    currency: string
    status: OrderStatus
    remark: string | null
    ownerId: string
    tenantId: string | null
    createdAt: Date
    updatedAt: Date
  }) {
    return {
      orderId: order.orderId,
      orderNo: order.orderNo,
      customerName: order.customerName,
      totalAmount: order.totalAmount.toString(),
      currency: order.currency,
      status: order.status,
      statusLabel: ORDER_STATUS_LABELS[order.status],
      remark: order.remark,
      ownerId: order.ownerId,
      tenantId: order.tenantId,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }
  }

  async page(
    input: { page?: number; pageSize?: number; keyword?: string; status?: string; createdFrom?: string; createdTo?: string },
    actor: Actor
  ) {
    const context = await this.context(actor)
    const page = input.page || 1
    const pageSize = input.pageSize || 20
    const createdAt: Prisma.DateTimeFilter = {}
    if (input.createdFrom) createdAt.gte = new Date(input.createdFrom)
    if (input.createdTo) createdAt.lt = new Date(input.createdTo)
    const where: Prisma.OrderWhereInput = {
      ...this.scope(context),
      ...(input.keyword
        ? { OR: [{ orderNo: { contains: input.keyword } }, { customerName: { contains: input.keyword } }] }
        : {}),
      ...(input.status ? { status: input.status as OrderStatus } : {}),
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
    }
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ])
    return {
      code: API_CODE.SUCCESS,
      message: 'success',
      data: { items: orders.map((order) => this.format(order)), total, page, pageSize },
    }
  }

  async detail(orderId: string, actor: Actor) {
    const context = await this.context(actor)
    const order = await this.prisma.order.findFirst({ where: { orderId, ...this.scope(context) } })
    if (!order) throw new NotFoundException('订单不存在')
    return { code: API_CODE.SUCCESS, message: 'success', data: this.format(order) }
  }

  async create(input: CreateOrderDto, actor: Actor) {
    const orderNo = `ORD-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`
    try {
      const created = await this.prisma.$transaction(async (tx): Promise<Prisma.OrderGetPayload<{}>> => {
        const context = await this.context(actor, tx)
        const order = await tx.order.create({
          data: {
            orderNo,
            tenantId: context.tenantId,
            ownerId: context.userId,
            departmentId: context.departmentId,
            organizationId: context.organizationId,
            customerName: input.customerName.trim(),
            totalAmount: new Prisma.Decimal(input.totalAmount),
            currency: input.currency || 'CNY',
            remark: input.remark?.trim() || null,
            createdBy: context.userId,
          },
        })
        await audit(tx, actor, 'order.create', created.orderId, null, created, undefined, 'order')
        return created
      }, serializable)
      return { code: API_CODE.SUCCESS, message: 'success', data: this.format(created) }
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('订单编号已存在，请重试')
      throw error
    }
  }

  async update(orderId: string, input: UpdateOrderDto, actor: Actor) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const context = await this.context(actor, tx)
      const before = await tx.order.findFirst({ where: { orderId, ...this.scope(context) } })
      if (!before) throw new NotFoundException('订单不存在')
      assertEditable(before.status)
      const after = await tx.order.update({
        where: { id: before.id },
        data: {
          ...(input.customerName !== undefined ? { customerName: input.customerName.trim() } : {}),
          ...(input.totalAmount !== undefined ? { totalAmount: new Prisma.Decimal(input.totalAmount) } : {}),
          ...(input.currency !== undefined ? { currency: input.currency } : {}),
          ...(input.remark !== undefined ? { remark: input.remark.trim() || null } : {}),
        },
      })
      await audit(tx, actor, 'order.update', orderId, before, after, undefined, 'order')
      return after
    }, serializable)
    return { code: API_CODE.SUCCESS, message: 'success', data: this.format(updated) }
  }

  async transition(orderId: string, status: 'CONFIRMED' | 'CANCELLED', reason: string, actor: Actor) {
    if (!reason.trim() || reason.length > 255) throw new BadRequestException('必须填写操作原因，最多 255 个字符')
    const updated = await this.prisma.$transaction(async (tx) => {
      const context = await this.context(actor, tx)
      const before = await tx.order.findFirst({ where: { orderId, ...this.scope(context) } })
      if (!before) throw new NotFoundException('订单不存在')
      assertOrderTransition(before.status, status)
      const after = await tx.order.update({ where: { id: before.id }, data: { status } })
      await audit(
        tx,
        actor,
        `order.${status === 'CONFIRMED' ? 'confirm' : 'cancel'}`,
        orderId,
        before,
        after,
        reason,
        'order'
      )
      return after
    }, serializable)
    return { code: API_CODE.SUCCESS, message: 'success', data: this.format(updated) }
  }
}
