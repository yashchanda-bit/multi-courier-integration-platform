import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { ApplicationError } from '../../../common/errors/application-error';
import { CourierRegistry } from '../../couriers/application/courier-registry';
import { COURIER_PARTNER_REPOSITORY } from '../../couriers/domain/courier-partner.repository';
import type { CourierPartnerRepository } from '../../couriers/domain/courier-partner.repository';
import { CourierDisabledError } from '../../couriers/domain/errors/courier-disabled.error';
import { CourierOperationFailedError } from '../../couriers/domain/errors/courier-operation-failed.error';
import type { NormalizedOrder } from '../domain/order';
import { ORDER_REPOSITORY } from '../domain/order.repository';
import type {
  OrderRepository,
  PersistedOrder,
} from '../domain/order.repository';
import { IdempotencyConflictError } from '../domain/errors/idempotency-conflict.error';
import { OrderProcessingError } from '../domain/errors/order-processing.error';
import { PreviousOrderFailureError } from '../domain/errors/previous-order-failure.error';
import { createRequestHash } from './request-hash';

export interface CreateOrderResponse {
  order_id: string;
  courier_partner: string;
  courier_shipment_id: string | null;
  awb_number: string | null;
  status: string;
  created_at: string;
}

export interface CreateOrderOutcome {
  response: CreateOrderResponse;
  replayed: boolean;
}

@Injectable()
export class CreateOrderService {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: OrderRepository,
    @Inject(COURIER_PARTNER_REPOSITORY)
    private readonly courierPartners: CourierPartnerRepository,
    private readonly courierRegistry: CourierRegistry,
  ) {}

  async execute(
    order: NormalizedOrder,
    requestId: string,
  ): Promise<CreateOrderOutcome> {
    const requestHash = createRequestHash(order);
    const existing = await this.orders.findByOrderId(order.orderId);
    if (existing) {
      return this.handleExisting(existing, requestHash);
    }

    const adapter = this.courierRegistry.get(order.courierPartner);
    const courierPartner = await this.courierPartners.findByCode(adapter.code);
    if (!courierPartner?.isEnabled) {
      throw new CourierDisabledError(adapter.code);
    }

    const reservation = await this.orders.reserve({
      order,
      requestHash,
      courierPartnerId: courierPartner.id,
    });
    if (!reservation.created) {
      return this.handleExisting(reservation.order, requestHash);
    }

    const startedAt = performance.now();
    let result: Awaited<ReturnType<typeof adapter.createShipment>>;
    try {
      result = await adapter.createShipment(order);
    } catch (error) {
      const normalized =
        error instanceof ApplicationError
          ? error
          : new CourierOperationFailedError({ cause: error });
      await this.orders.failShipment({
        orderDatabaseId: reservation.order.id,
        shipmentDatabaseId: reservation.order.activeShipment.id,
        courierPartnerId: courierPartner.id,
        requestId,
        errorCode: normalized.code,
        errorMessage: normalized.message,
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw normalized;
    }

    const completed = await this.orders.completeShipment({
      orderDatabaseId: reservation.order.id,
      shipmentDatabaseId: reservation.order.activeShipment.id,
      courierPartnerId: courierPartner.id,
      courierShipmentId: result.courierShipmentId,
      awbNumber: result.awbNumber,
      status: result.status,
      courierStatusCode: result.courierStatusCode,
      courierRequestPayload: result.rawRequest,
      courierResponsePayload: result.rawResponse,
      requestId,
      eventFingerprint: this.eventFingerprint(
        reservation.order.activeShipment.id,
        result.courierStatusCode,
      ),
      durationMs: Math.round(performance.now() - startedAt),
    });
    return { response: this.toResponse(completed), replayed: false };
  }

  private handleExisting(
    existing: PersistedOrder,
    requestHash: string,
  ): CreateOrderOutcome {
    if (existing.requestHash !== requestHash) {
      throw new IdempotencyConflictError(existing.orderId);
    }
    if (existing.status === 'PROCESSING') {
      throw new OrderProcessingError(existing.orderId);
    }
    if (existing.status === 'FAILED') {
      throw new PreviousOrderFailureError(existing.orderId);
    }
    return { response: this.toResponse(existing), replayed: true };
  }

  private toResponse(order: PersistedOrder): CreateOrderResponse {
    return {
      order_id: order.orderId,
      courier_partner: order.activeShipment.courierPartnerCode,
      courier_shipment_id: order.activeShipment.courierShipmentId,
      awb_number: order.activeShipment.awbNumber,
      status: order.activeShipment.status,
      created_at: order.createdAt.toISOString(),
    };
  }

  private eventFingerprint(shipmentId: string, courierStatus: string): string {
    return createHash('sha256')
      .update(`${shipmentId}|${courierStatus}`)
      .digest('hex');
  }
}
