import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../database/database.module.js'
import { SecurityModule } from '../../security/security.module.js'
import { OrderController } from './controllers/order.controller.js'
import { OrderService } from './services/order.service.js'

/** 订单业务模块：封装订单生命周期及业务规则，不承载角色和权限管理逻辑。 */
@Module({
  imports: [DatabaseModule, SecurityModule],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
