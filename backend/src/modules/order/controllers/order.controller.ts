import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../../../security/guards/auth.guard.js'
import { RequirePermissions } from '../../../security/decorators/permission.decorator.js'
import { SecurityOperation } from '../../../security/decorators/operation.decorator.js'
import { actorFrom } from '../../role/domain/authorization.js'
import type { ActorRequest } from '../../role/domain/authorization.js'
import { CreateOrderDto, OrderQueryDto, OrderReasonDto, UpdateOrderDto } from '../dto/order.dto.js'
import { OrderService } from '../services/order.service.js'

@Controller('orders')
@UseGuards(AuthGuard)
export class OrderController {
  constructor(@Inject(OrderService) private readonly orders: OrderService) {}

  @Get()
  @RequirePermissions('order.read')
  @SecurityOperation('order.read')
  page(@Query() query: OrderQueryDto, @Req() request: ActorRequest) {
    return this.orders.page(query, actorFrom(request))
  }

  @Get(':id')
  @RequirePermissions('order.read')
  @SecurityOperation('order.read')
  detail(@Param('id', ParseUUIDPipe) id: string, @Req() request: ActorRequest) {
    return this.orders.detail(id, actorFrom(request))
  }

  @Post()
  @RequirePermissions('order.create')
  @SecurityOperation('order.create')
  create(@Body() body: CreateOrderDto, @Req() request: ActorRequest) {
    return this.orders.create(body, actorFrom(request))
  }

  @Patch(':id')
  @RequirePermissions('order.update')
  @SecurityOperation('order.update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateOrderDto, @Req() request: ActorRequest) {
    return this.orders.update(id, body, actorFrom(request))
  }

  @Post(':id/confirm')
  @RequirePermissions('order.confirm')
  @SecurityOperation('order.confirm')
  confirm(@Param('id', ParseUUIDPipe) id: string, @Body() body: OrderReasonDto, @Req() request: ActorRequest) {
    return this.orders.transition(id, 'CONFIRMED', body.reason, actorFrom(request))
  }

  @Post(':id/cancel')
  @RequirePermissions('order.cancel')
  @SecurityOperation('order.cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() body: OrderReasonDto, @Req() request: ActorRequest) {
    return this.orders.transition(id, 'CANCELLED', body.reason, actorFrom(request))
  }
}
