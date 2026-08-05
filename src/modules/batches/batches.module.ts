import { Module } from '@nestjs/common';
import { QueueConnectionModule } from '../../infrastructure/queue/queue-connection.module';
import { OrdersModule } from '../orders/orders.module';
import { CreateBatchService } from './application/create-batch.service';
import { GetBatchService } from './application/get-batch.service';
import { ProcessBatchItemService } from './application/process-batch-item.service';
import { BATCH_REPOSITORY } from './domain/batch.repository';
import {
  BULK_ORDER_QUEUE,
  BullMqBulkOrderQueue,
} from './infrastructure/bulk-order.queue';
import { BulkOrderWorker } from './infrastructure/bulk-order.worker';
import { PrismaBatchRepository } from './infrastructure/prisma-batch.repository';
import { BatchesController } from './presentation/batches.controller';
import { BulkOrdersController } from './presentation/bulk-orders.controller';

@Module({
  imports: [OrdersModule, QueueConnectionModule],
  controllers: [BulkOrdersController, BatchesController],
  providers: [
    CreateBatchService,
    GetBatchService,
    ProcessBatchItemService,
    BulkOrderWorker,
    { provide: BATCH_REPOSITORY, useClass: PrismaBatchRepository },
    { provide: BULK_ORDER_QUEUE, useClass: BullMqBulkOrderQueue },
  ],
})
export class BatchesModule {}
