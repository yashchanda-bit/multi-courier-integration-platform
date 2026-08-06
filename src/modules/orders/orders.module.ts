import { Module } from '@nestjs/common';
import { CouriersModule } from '../couriers/couriers.module';
import { CreateOrderService } from './application/create-order.service';
import { TrackOrderService } from './application/track-order.service';
import { CancelOrderService } from './application/cancel-order.service';
import { ORDER_REPOSITORY } from './domain/order.repository';
import { PrismaOrderRepository } from './infrastructure/prisma-order.repository';
import { OrdersController } from './presentation/orders.controller';
import { ReconcileStaleOrdersService } from './application/reconcile-stale-orders.service';
import { CourierCapabilitiesService } from './application/courier-capabilities.service';
import { CourierCapabilitiesController } from './presentation/courier-capabilities.controller';

@Module({
  imports: [CouriersModule],
  controllers: [OrdersController, CourierCapabilitiesController],
  providers: [
    CreateOrderService,
    TrackOrderService,
    CancelOrderService,
    ReconcileStaleOrdersService,
    CourierCapabilitiesService,
    { provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository },
  ],
  exports: [CreateOrderService],
})
export class OrdersModule {}
