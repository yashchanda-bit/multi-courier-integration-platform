import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { RequestWithId } from '../../../common/request-context/request-with-id';
import { CreateBatchService } from '../application/create-batch.service';
import type { CreateBatchResponse } from '../application/create-batch.service';
import { mapCreateOrderRequest } from '../../orders/presentation/mappers/order-request.mapper';
import { CreateBatchRequestDto } from './dto/create-batch.request';

@Controller('orders')
export class BulkOrdersController {
  constructor(private readonly createBatch: CreateBatchService) {}

  @Post('bulk')
  @HttpCode(202)
  create(
    @Body() request: CreateBatchRequestDto,
    @Req() httpRequest: RequestWithId,
  ): Promise<CreateBatchResponse> {
    return this.createBatch.execute(
      request.orders.map(mapCreateOrderRequest),
      httpRequest.requestId!,
    );
  }
}
