import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { ApplicationError } from '../../../common/errors/application-error';
import { CourierRegistry } from '../../couriers/application/courier-registry';
import { COURIER_PARTNER_REPOSITORY } from '../../couriers/domain/courier-partner.repository';
import type { CourierPartnerRepository } from '../../couriers/domain/courier-partner.repository';
import { CourierDisabledError } from '../../couriers/domain/errors/courier-disabled.error';
import { CourierLifecycleFailedError } from '../domain/errors/courier-lifecycle-failed.error';
import { OrderNotFoundError } from '../domain/errors/order-not-found.error';
import { ShipmentNotReadyError } from '../domain/errors/shipment-not-ready.error';
import { ORDER_REPOSITORY } from '../domain/order.repository';
import type { OrderRepository } from '../domain/order.repository';

export interface CancelOrderResponse {
  order_id: string;
  courier_partner: string;
  awb_number: string;
  status: string;
}

@Injectable()
export class CancelOrderService {
  private readonly logger = new Logger(CancelOrderService.name);

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(COURIER_PARTNER_REPOSITORY)
    private readonly courierPartners: CourierPartnerRepository,
    private readonly courierRegistry: CourierRegistry,
  ) {}

  async execute(
    orderId: string,
    requestId: string,
  ): Promise<CancelOrderResponse> {
    const order = await this.orders.findByOrderId(orderId);
    if (!order) throw new OrderNotFoundError(orderId);
    const shipment = order.activeShipment;
    if (!shipment.awbNumber) throw new ShipmentNotReadyError(orderId);
    if (shipment.status === 'CANCELLED') {
      return {
        order_id: orderId,
        courier_partner: shipment.courierPartnerCode,
        awb_number: shipment.awbNumber,
        status: shipment.status,
      };
    }

    const adapter = this.courierRegistry.get(shipment.courierPartnerCode);
    const partner = await this.courierPartners.findByCode(adapter.code);
    if (!partner?.isEnabled) throw new CourierDisabledError(adapter.code);

    const requestPayload = { awb_number: shipment.awbNumber };
    const startedAt = performance.now();
    let result;
    try {
      result = await adapter.cancelShipment({
        orderId,
        awbNumber: shipment.awbNumber,
        courierShipmentId: shipment.courierShipmentId ?? undefined,
      });
    } catch (error) {
      const normalized =
        error instanceof ApplicationError
          ? error
          : new CourierLifecycleFailedError('cancellation', { cause: error });
      this.logger.error(
        `Courier operation failed operation=cancel_shipment order_id=${orderId} courier_partner=${shipment.courierPartnerCode} request_id=${requestId} error_type=${normalized.code}`,
        error instanceof Error ? error.stack : normalized.stack,
      );
      await this.orders.recordOperationFailure({
        shipmentDatabaseId: shipment.id,
        courierPartnerId: shipment.courierPartnerId,
        operation: 'CANCEL_SHIPMENT',
        requestPayload,
        requestId,
        errorCode: normalized.code,
        errorMessage: normalized.message,
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw normalized;
    }

    await this.orders.recordCancellation({
      shipmentDatabaseId: shipment.id,
      courierPartnerId: shipment.courierPartnerId,
      status: result.status,
      courierStatusCode: result.courierStatusCode,
      requestPayload: result.rawRequest,
      responsePayload: result.rawResponse,
      eventFingerprint: createHash('sha256')
        .update(`${shipment.id}|${result.courierStatusCode}`)
        .digest('hex'),
      requestId,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return {
      order_id: orderId,
      courier_partner: shipment.courierPartnerCode,
      awb_number: shipment.awbNumber,
      status: result.status,
    };
  }
}
