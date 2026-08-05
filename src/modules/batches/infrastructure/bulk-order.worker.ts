import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import type { RedisOptions } from 'bullmq';
import { QUEUE_CONNECTION } from '../../../infrastructure/queue/queue-connection.module';
import { ProcessBatchItemService } from '../application/process-batch-item.service';
import type { BulkOrderJobData } from './bulk-order.job';

@Injectable()
export class BulkOrderWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BulkOrderWorker.name);
  private worker?: Worker<BulkOrderJobData>;

  constructor(
    @Inject(QUEUE_CONNECTION)
    private readonly connection: RedisOptions,
    private readonly processor: ProcessBatchItemService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.config.getOrThrow<boolean>('BULK_WORKER_ENABLED')) return;
    this.worker = new Worker<BulkOrderJobData>(
      this.config.getOrThrow<string>('BULK_QUEUE_NAME'),
      (job) => this.processor.execute(job.data),
      {
        connection: this.connection,
        concurrency: this.config.getOrThrow<number>('BULK_WORKER_CONCURRENCY'),
      },
    );
    this.worker.on('error', (error) => {
      this.logger.error('Bulk worker connection failure', error.stack);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
