import { Module } from '@nestjs/common'
import { DatabaseModule } from '#app/database/database.module.js'
import { SecurityModule } from '#app/security/security.module.js'
import { OrderController } from '#app/modules/order/controllers/order.controller.js'
import { OrderService } from '#app/modules/order/services/order.service.js'

/** 订单业务模块：封装订单生命周期及业务规则，不承载角色和权限管理逻辑。 */
@Module({
  imports: [DatabaseModule, SecurityModule],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
