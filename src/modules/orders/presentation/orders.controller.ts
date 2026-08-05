import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { RequestWithId } from '../../../common/request-context/request-with-id';
import { CreateOrderService } from '../application/create-order.service';
import type { CreateOrderResponse } from '../application/create-order.service';
import { CreateOrderRequestDto } from './dto/create-order.request';
import { mapCreateOrderRequest } from './mappers/order-request.mapper';

@Controller('orders')
export class OrdersController {
  constructor(private readonly createOrder: CreateOrderService) {}

  @Post()
  @HttpCode(201)
  async create(
    @Body() request: CreateOrderRequestDto,
    @Req() httpRequest: RequestWithId,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CreateOrderResponse> {
    const outcome = await this.createOrder.execute(
      mapCreateOrderRequest(request),
      httpRequest.requestId!,
    );
    response.status(outcome.replayed ? 200 : 201);
    return outcome.response;
  }
}
