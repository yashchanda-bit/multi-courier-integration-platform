import type { NormalizedOrder } from '../../orders/domain/order';

export const BATCH_REPOSITORY = Symbol('BATCH_REPOSITORY');

export type BatchStatus =
  'PENDING' | 'PROCESSING' | 'COMPLETED' | 'PARTIALLY_COMPLETED' | 'FAILED';

export type BatchItemStatus = 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';

export interface BatchRecord {
  id: string;
  status: BatchStatus;
  totalCount: number;
  successCount: number;
  failureCount: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  items: Array<{
    position: number;
    submittedOrderId: string;
    submittedCourierPartner: string;
    status: BatchItemStatus;
    errorCode: string | null;
    errorMessage: string | null;
  }>;
}

export interface CompleteBatchItemInput {
  batchId: string;
  position: number;
  orderId: string;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface BatchRepository {
  create(orders: NormalizedOrder[]): Promise<BatchRecord>;
  findById(batchId: string): Promise<BatchRecord | null>;
  markItemProcessing(batchId: string, position: number): Promise<boolean>;
  completeItem(input: CompleteBatchItemInput): Promise<void>;
  failEnqueue(
    batchId: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<void>;
}
