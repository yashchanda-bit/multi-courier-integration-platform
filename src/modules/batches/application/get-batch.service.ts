import { Inject, Injectable } from '@nestjs/common';
import { BATCH_REPOSITORY } from '../domain/batch.repository';
import type { BatchRepository } from '../domain/batch.repository';
import { BatchNotFoundError } from '../domain/errors/batch-not-found.error';

export interface GetBatchResponse {
  batch_id: string;
  status: string;
  total_count: number;
  success_count: number;
  failure_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  items: Array<{
    position: number;
    order_id: string;
    courier_partner: string;
    status: string;
    error: { code: string; message: string } | null;
  }>;
}

@Injectable()
export class GetBatchService {
  constructor(
    @Inject(BATCH_REPOSITORY) private readonly batches: BatchRepository,
  ) {}

  async execute(batchId: string): Promise<GetBatchResponse> {
    const batch = await this.batches.findById(batchId);
    if (!batch) throw new BatchNotFoundError(batchId);
    return {
      batch_id: batch.id,
      status: batch.status,
      total_count: batch.totalCount,
      success_count: batch.successCount,
      failure_count: batch.failureCount,
      created_at: batch.createdAt.toISOString(),
      started_at: batch.startedAt?.toISOString() ?? null,
      completed_at: batch.completedAt?.toISOString() ?? null,
      items: batch.items.map((item) => ({
        position: item.position,
        order_id: item.submittedOrderId,
        courier_partner: item.submittedCourierPartner,
        status: item.status,
        error:
          item.errorCode && item.errorMessage
            ? { code: item.errorCode, message: item.errorMessage }
            : null,
      })),
    };
  }
}
