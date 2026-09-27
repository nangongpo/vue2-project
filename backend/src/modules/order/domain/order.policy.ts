import { BadRequestException } from '@nestjs/common'
import { OrderStatus } from '@prisma/client'

const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED'],
  CANCELLED: [],
  COMPLETED: [],
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus) {
  if (!transitions[from].includes(to)) throw new BadRequestException('订单状态不允许执行该变更')
}

export function assertEditable(status: OrderStatus) {
  if (status !== OrderStatus.DRAFT) throw new BadRequestException('仅草稿订单允许编辑')
}
