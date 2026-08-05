import { Controller, Get, Param } from '@nestjs/common';
import { GetBatchService } from '../application/get-batch.service';
import type { GetBatchResponse } from '../application/get-batch.service';

@Controller('batches')
export class BatchesController {
  constructor(private readonly getBatch: GetBatchService) {}

  @Get(':batchId')
  get(@Param('batchId') batchId: string): Promise<GetBatchResponse> {
    return this.getBatch.execute(batchId);
  }
}
