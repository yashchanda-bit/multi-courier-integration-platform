import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { RequestWithId } from '../../../common/request-context/request-with-id';
import { CourierCapabilitiesService } from '../application/courier-capabilities.service';
import {
  ReattemptDeliveryRequestDto,
  ServiceabilityQueryDto,
} from './dto/courier-capabilities.request';

@Controller()
export class CourierCapabilitiesController {
  constructor(private readonly capabilities: CourierCapabilitiesService) {}

  @Get('couriers/serviceability')
  serviceability(
    @Query() query: ServiceabilityQueryDto,
    @Req() request: RequestWithId,
  ) {
    return this.capabilities.checkServiceability(
      query.courier_partner,
      query.pincodes?.split(','),
      request.requestId!,
    );
  }

  @Get('orders/:orderId/label')
  label(@Param('orderId') orderId: string, @Req() request: RequestWithId) {
    return this.capabilities.getLabel(orderId, request.requestId!);
  }

  @Get('orders/:orderId/epod')
  epod(@Param('orderId') orderId: string, @Req() request: RequestWithId) {
    return this.capabilities.getProofOfDelivery(orderId, request.requestId!);
  }

  @Post('orders/:orderId/ndr/rto')
  @HttpCode(200)
  rto(@Param('orderId') orderId: string, @Req() request: RequestWithId) {
    return this.capabilities.requestReturnToOrigin(orderId, request.requestId!);
  }

  @Post('orders/:orderId/ndr/reattempt')
  @HttpCode(200)
  reattempt(
    @Param('orderId') orderId: string,
    @Body() body: ReattemptDeliveryRequestDto,
    @Req() request: RequestWithId,
  ) {
    return this.capabilities.reattemptDelivery(
      orderId,
      {
        name: body.name,
        address: body.address,
        city: body.city,
        state: body.state,
        postalCode: body.postal_code,
        phone: body.phone,
        email: body.email,
      },
      request.requestId!,
    );
  }

  @Post('orders/:orderId/payment-mode/change')
  @HttpCode(200)
  paymentMode(
    @Param('orderId') orderId: string,
    @Req() request: RequestWithId,
  ) {
    return this.capabilities.changePaymentMode(orderId, request.requestId!);
  }
}
