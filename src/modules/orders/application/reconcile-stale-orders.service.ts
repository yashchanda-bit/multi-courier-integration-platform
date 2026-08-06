import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ORDER_REPOSITORY } from '../domain/order.repository';
import type { OrderRepository } from '../domain/order.repository';

const RECONCILIATION_ERROR_CODE = 'PROCESSING_TIMEOUT';
const RECONCILIATION_ERROR_MESSAGE =
  'Order processing exceeded its configured time limit';

@Injectable()
export class ReconcileStaleOrdersService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ReconcileStaleOrdersService.name);
  private readonly timeoutMs: number;
  private readonly intervalMs: number;
  private interval: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: OrderRepository,
    config: ConfigService,
  ) {
    this.timeoutMs =
      config.getOrThrow<number>('ORDER_PROCESSING_TIMEOUT_SECONDS') * 1_000;
    this.intervalMs =
      config.getOrThrow<number>('ORDER_RECONCILIATION_INTERVAL_SECONDS') *
      1_000;
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.reconcile();
    this.interval = setInterval(() => void this.reconcile(), this.intervalMs);
    this.interval.unref();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  async reconcile(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const count = await this.orders.failStaleProcessingOrders({
        staleBefore: new Date(now.getTime() - this.timeoutMs),
        errorCode: RECONCILIATION_ERROR_CODE,
        errorMessage: RECONCILIATION_ERROR_MESSAGE,
      });
      if (count > 0) {
        this.logger.warn(
          `Reconciled stale orders count=${count} error_code=${RECONCILIATION_ERROR_CODE}`,
        );
      }
      return count;
    } catch (error) {
      this.logger.error(
        'Stale-order reconciliation failed',
        error instanceof Error ? error.stack : undefined,
      );
      return 0;
    } finally {
      this.running = false;
    }
  }
}
