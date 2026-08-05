import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ApplicationError } from '../../../common/errors/application-error';
import { CreateOrderService } from '../../orders/application/create-order.service';
import { BATCH_REPOSITORY } from '../domain/batch.repository';
import type { BatchRepository } from '../domain/batch.repository';
import type { BulkOrderJobData } from '../infrastructure/bulk-order.job';

@Injectable()
export class ProcessBatchItemService {
  private readonly logger = new Logger(ProcessBatchItemService.name);

  constructor(
    @Inject(BATCH_REPOSITORY) private readonly batches: BatchRepository,
    private readonly createOrder: CreateOrderService,
  ) {}

  async execute(data: BulkOrderJobData): Promise<void> {
    const { batchId, position, order } = data;
    const claimed = await this.batches.markItemProcessing(batchId, position);
    if (!claimed) return;

    try {
      await this.createOrder.execute(
        order,
        this.jobRequestId(batchId, position),
      );
      await this.batches.completeItem({
        batchId,
        position,
        orderId: order.orderId,
        success: true,
      });
    } catch (error) {
      const normalized =
        error instanceof ApplicationError
          ? { code: error.code, message: error.message }
          : {
              code: 'BULK_ITEM_FAILED',
              message: 'The order could not be processed',
            };
      this.logger.error(
        `Bulk item failed batch_id=${batchId} position=${position} order_id=${order.orderId} courier_partner=${order.courierPartner} originating_request_id=${data.originatingRequestId} code=${normalized.code}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.batches.completeItem({
        batchId,
        position,
        orderId: order.orderId,
        success: false,
        errorCode: normalized.code,
        errorMessage: normalized.message,
      });
    }
  }

  private jobRequestId(batchId: string, position: number): string {
    const digest = createHash('sha256')
      .update(`${batchId}|${position}`)
      .digest('hex')
      .slice(0, 32);
    return `bulk-${digest}`;
  }
}
