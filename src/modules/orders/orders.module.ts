import { Module } from '@nestjs/common';
import { CouriersModule } from '../couriers/couriers.module';
import { CreateOrderService } from './application/create-order.service';
import { TrackOrderService } from './application/track-order.service';
import { CancelOrderService } from './application/cancel-order.service';
import { ORDER_REPOSITORY } from './domain/order.repository';
import { PrismaOrderRepository } from './infrastructure/prisma-order.repository';
import { OrdersController } from './presentation/orders.controller';

@Module({
  imports: [CouriersModule],
  controllers: [OrdersController],
  providers: [
    CreateOrderService,
    TrackOrderService,
    CancelOrderService,
    { provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository },
  ],
  exports: [CreateOrderService],
})
export class OrdersModule {}
