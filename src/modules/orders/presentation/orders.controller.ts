import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { RequestWithId } from '../../../common/request-context/request-with-id';
import { CreateOrderService } from '../application/create-order.service';
import type { CreateOrderResponse } from '../application/create-order.service';
import { TrackOrderService } from '../application/track-order.service';
import type { TrackOrderResponse } from '../application/track-order.service';
import { CancelOrderService } from '../application/cancel-order.service';
import type { CancelOrderResponse } from '../application/cancel-order.service';
import { CreateOrderRequestDto } from './dto/create-order.request';
import { mapCreateOrderRequest } from './mappers/order-request.mapper';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly createOrder: CreateOrderService,
    private readonly trackOrder: TrackOrderService,
    private readonly cancelOrder: CancelOrderService,
  ) {}

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

  @Get(':orderId/track')
  track(
    @Param('orderId') orderId: string,
    @Req() request: RequestWithId,
  ): Promise<TrackOrderResponse> {
    return this.trackOrder.execute(orderId, request.requestId!);
  }

  @Post(':orderId/cancel')
  @HttpCode(200)
  cancel(
    @Param('orderId') orderId: string,
    @Req() request: RequestWithId,
  ): Promise<CancelOrderResponse> {
    return this.cancelOrder.execute(orderId, request.requestId!);
  }
}
