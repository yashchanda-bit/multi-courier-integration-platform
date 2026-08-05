import type { NormalizedOrder } from '../../orders/domain/order';

export interface BulkOrderJobData {
  batchId: string;
  position: number;
  order: NormalizedOrder;
  originatingRequestId: string;
}
