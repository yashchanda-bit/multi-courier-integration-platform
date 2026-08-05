import { Inject, Injectable } from '@nestjs/common';
import type { NormalizedOrder } from '../../orders/domain/order';
import { BATCH_REPOSITORY } from '../domain/batch.repository';
import type { BatchRepository } from '../domain/batch.repository';
import { BatchEnqueueFailedError } from '../domain/errors/batch-enqueue-failed.error';
import { DuplicateBatchOrderError } from '../domain/errors/duplicate-batch-order.error';
import { BULK_ORDER_QUEUE } from '../infrastructure/bulk-order.queue';
import type { BulkOrderQueue } from '../infrastructure/bulk-order.queue';

export interface CreateBatchResponse {
  batch_id: string;
  status: string;
  total_count: number;
  status_url: string;
}

@Injectable()
export class CreateBatchService {
  constructor(
    @Inject(BATCH_REPOSITORY) private readonly batches: BatchRepository,
    @Inject(BULK_ORDER_QUEUE) private readonly queue: BulkOrderQueue,
  ) {}

  async execute(
    orders: NormalizedOrder[],
    requestId: string,
  ): Promise<CreateBatchResponse> {
    this.ensureUniqueOrderIds(orders);
    const batch = await this.batches.create(orders);
    try {
      await this.queue.enqueue(batch.id, orders, requestId);
    } catch (error) {
      await this.batches.failEnqueue(
        batch.id,
        'BATCH_ENQUEUE_FAILED',
        'The order could not be scheduled',
      );
      throw new BatchEnqueueFailedError(batch.id, { cause: error });
    }
    return {
      batch_id: batch.id,
      status: batch.status,
      total_count: batch.totalCount,
      status_url: `/api/v1/batches/${batch.id}`,
    };
  }

  private ensureUniqueOrderIds(orders: NormalizedOrder[]): void {
    const seen = new Set<string>();
    for (const order of orders) {
      if (seen.has(order.orderId))
        throw new DuplicateBatchOrderError(order.orderId);
      seen.add(order.orderId);
    }
  }
}
