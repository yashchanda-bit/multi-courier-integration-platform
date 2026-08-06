import { Inject, Injectable, Logger } from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import { ApplicationError } from '../../../common/errors/application-error';
import { getCourierFailureAudit } from '../../couriers/domain/courier-failure-audit';
import { CourierRegistry } from '../../couriers/application/courier-registry';
import { COURIER_PARTNER_REPOSITORY } from '../../couriers/domain/courier-partner.repository';
import type { CourierPartnerRepository } from '../../couriers/domain/courier-partner.repository';
import { CourierDisabledError } from '../../couriers/domain/errors/courier-disabled.error';
import { CourierLifecycleFailedError } from '../domain/errors/courier-lifecycle-failed.error';
import { OrderNotFoundError } from '../domain/errors/order-not-found.error';
import { ShipmentNotReadyError } from '../domain/errors/shipment-not-ready.error';
import { ORDER_REPOSITORY } from '../domain/order.repository';
import type { OrderRepository } from '../domain/order.repository';
import type { TrackingEventResult } from '../domain/shipment';
import { createTrackingFingerprint } from './tracking-fingerprint';

export interface TrackOrderResponse {
  order_id: string;
  courier_partner: string;
  awb_number: string;
  current_status: string;
  courier_status_code: string;
  events: Array<{
    status: string;
    courier_status_code: string;
    description?: string;
    reason_code?: string;
    reason?: string;
    location?: string;
    event_time?: string;
  }>;
}

@Injectable()
export class TrackOrderService {
  private readonly logger = new Logger(TrackOrderService.name);

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(COURIER_PARTNER_REPOSITORY)
    private readonly courierPartners: CourierPartnerRepository,
    private readonly courierRegistry: CourierRegistry,
  ) {}

  async execute(
    orderId: string,
    requestId: string,
  ): Promise<TrackOrderResponse> {
    const order = await this.orders.findByOrderId(orderId);
    if (!order) throw new OrderNotFoundError(orderId);
    const shipment = order.activeShipment;
    if (!shipment.awbNumber) throw new ShipmentNotReadyError(orderId);

    const adapter = this.courierRegistry.get(shipment.courierPartnerCode);
    const partner = await this.courierPartners.findByCode(adapter.code);
    if (!partner?.isEnabled) throw new CourierDisabledError(adapter.code);

    const requestPayload = { awb_number: shipment.awbNumber };
    const startedAt = performance.now();
    let result;
    try {
      result = await adapter.trackShipment({
        orderId,
        awbNumber: shipment.awbNumber,
        courierShipmentId: shipment.courierShipmentId ?? undefined,
      });
    } catch (error) {
      const audit = getCourierFailureAudit(error);
      const normalized =
        error instanceof ApplicationError
          ? error
          : new CourierLifecycleFailedError('tracking', { cause: error });
      this.logger.error(
        `Courier operation failed operation=track_shipment order_id=${orderId} courier_partner=${shipment.courierPartnerCode} request_id=${requestId} error_type=${normalized.code}`,
        error instanceof Error ? error.stack : normalized.stack,
      );
      await this.orders.recordOperationFailure({
        shipmentDatabaseId: shipment.id,
        courierPartnerId: shipment.courierPartnerId,
        operation: 'TRACK_SHIPMENT',
        requestPayload: audit.courierRequestPayload ?? requestPayload,
        responsePayload: audit.courierResponsePayload,
        courierHttpStatus: audit.courierHttpStatus,
        requestId,
        errorCode: normalized.code,
        errorMessage: normalized.message,
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw normalized;
    }

    const events = this.ensureCurrentEvent(result.events, {
      status: result.currentStatus,
      courierStatusCode: result.courierStatusCode,
      rawPayload: result.rawResponse,
    });
    await this.orders.recordTracking({
      orderDatabaseId: order.id,
      shipmentDatabaseId: shipment.id,
      courierPartnerId: shipment.courierPartnerId,
      currentStatus: result.currentStatus,
      courierStatusCode: result.courierStatusCode,
      events: events.map((event) => ({
        ...event,
        eventFingerprint: createTrackingFingerprint(shipment.id, event),
      })),
      requestPayload,
      responsePayload: result.rawResponse,
      requestId,
      durationMs: Math.round(performance.now() - startedAt),
    });

    return {
      order_id: orderId,
      courier_partner: shipment.courierPartnerCode,
      awb_number: shipment.awbNumber,
      current_status: result.currentStatus,
      courier_status_code: result.courierStatusCode,
      events: events.map((event) => ({
        status: event.status,
        courier_status_code: event.courierStatusCode,
        description: event.courierStatusDescription,
        reason_code: event.courierReasonCode,
        reason: event.courierReasonDescription,
        location: event.location,
        event_time: event.eventTime?.toISOString(),
      })),
    };
  }

  private ensureCurrentEvent(
    events: TrackingEventResult[],
    current: TrackingEventResult,
  ): TrackingEventResult[] {
    return events.length > 0 ? events : [current];
  }
}
