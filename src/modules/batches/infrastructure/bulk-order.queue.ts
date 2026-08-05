import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { RedisOptions } from 'bullmq';
import { QUEUE_CONNECTION } from '../../../infrastructure/queue/queue-connection.module';
import type { NormalizedOrder } from '../../orders/domain/order';
import type { BulkOrderJobData } from './bulk-order.job';

export const BULK_ORDER_QUEUE = Symbol('BULK_ORDER_QUEUE');

export interface BulkOrderQueue {
  enqueue(
    batchId: string,
    orders: NormalizedOrder[],
    requestId: string,
  ): Promise<void>;
}

@Injectable()
export class BullMqBulkOrderQueue implements BulkOrderQueue, OnModuleDestroy {
  private queue?: Queue<BulkOrderJobData>;

  constructor(
    @Inject(QUEUE_CONNECTION)
    private readonly connection: RedisOptions,
    private readonly config: ConfigService,
  ) {}

  async enqueue(
    batchId: string,
    orders: NormalizedOrder[],
    requestId: string,
  ): Promise<void> {
    const retention = this.config.getOrThrow<number>(
      'BULK_JOB_RETENTION_SECONDS',
    );
    await this.getQueue().addBulk(
      orders.map((order, position) => ({
        name: 'create-order',
        data: {
          batchId,
          position,
          order,
          originatingRequestId: requestId,
        },
        opts: {
          jobId: `${batchId}-${position}`,
          attempts: 1,
          removeOnComplete: { age: retention, count: 10_000 },
          removeOnFail: { age: retention * 7, count: 10_000 },
        },
      })),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }

  private getQueue(): Queue<BulkOrderJobData> {
    this.queue ??= new Queue<BulkOrderJobData>(
      this.config.getOrThrow<string>('BULK_QUEUE_NAME'),
      {
        connection: { ...this.connection, maxRetriesPerRequest: 1 },
      },
    );
    return this.queue;
  }
}
