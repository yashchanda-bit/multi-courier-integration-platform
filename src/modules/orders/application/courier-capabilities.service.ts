import { Inject, Injectable, Logger } from '@nestjs/common';
import { ApplicationError } from '../../../common/errors/application-error';
import { CourierRegistry } from '../../couriers/application/courier-registry';
import type {
  CourierActionResult,
  CourierDocumentResult,
  ReattemptDeliveryInput,
} from '../../couriers/domain/courier-capabilities';
import { COURIER_PARTNER_REPOSITORY } from '../../couriers/domain/courier-partner.repository';
import type { CourierPartnerRepository } from '../../couriers/domain/courier-partner.repository';
import { CourierDisabledError } from '../../couriers/domain/errors/courier-disabled.error';
import { CourierOperationFailedError } from '../../couriers/domain/errors/courier-operation-failed.error';
import { CourierCapabilityUnsupportedError } from '../../couriers/domain/errors/courier-capability-unsupported.error';
import { ORDER_REPOSITORY } from '../domain/order.repository';
import type {
  OrderRepository,
  PersistedOrder,
} from '../domain/order.repository';
import type { ShipmentReference } from '../domain/shipment';
import { OrderNotFoundError } from '../domain/errors/order-not-found.error';
import { ShipmentNotReadyError } from '../domain/errors/shipment-not-ready.error';

@Injectable()
export class CourierCapabilitiesService {
  private readonly logger = new Logger(CourierCapabilitiesService.name);

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(COURIER_PARTNER_REPOSITORY)
    private readonly courierPartners: CourierPartnerRepository,
    private readonly couriers: CourierRegistry,
  ) {}

  async checkServiceability(
    courierPartner: string,
    postalCodes: string[] | undefined,
    requestId: string,
  ): Promise<PublicServiceabilityResult> {
    const adapter = await this.enabledAdapter(courierPartner);
    if (!adapter.checkServiceability) {
      throw new CourierCapabilityUnsupportedError(
        adapter.code,
        'serviceability',
      );
    }
    try {
      const result = await adapter.checkServiceability(postalCodes);
      return {
        courier_partner: adapter.code,
        locations: result.locations.map((location) => ({
          postal_code: location.postalCode,
          inbound: location.inbound,
          outbound: location.outbound,
          returns: location.returns,
          active: location.active,
          city: location.city,
          state: location.state,
          service_center: location.serviceCenter,
          service_levels: location.serviceLevels,
        })),
        unsupported_postal_codes: result.unsupportedPostalCodes,
      };
    } catch (error) {
      this.logFailure(
        'check_serviceability',
        undefined,
        adapter.code,
        requestId,
        error,
      );
      throw this.normalize(error);
    }
  }

  getLabel(orderId: string, requestId: string): Promise<CourierDocumentResult> {
    return this.withShipment(
      orderId,
      requestId,
      'get_label',
      (adapter, reference) => {
        if (!adapter.getLabel) {
          throw new CourierCapabilityUnsupportedError(adapter.code, 'label');
        }
        return adapter.getLabel(reference);
      },
    );
  }

  getProofOfDelivery(
    orderId: string,
    requestId: string,
  ): Promise<CourierDocumentResult> {
    return this.withShipment(
      orderId,
      requestId,
      'get_proof_of_delivery',
      (adapter, reference) => {
        if (!adapter.getProofOfDelivery) {
          throw new CourierCapabilityUnsupportedError(adapter.code, 'epod');
        }
        return adapter.getProofOfDelivery(reference);
      },
    );
  }

  async requestReturnToOrigin(
    orderId: string,
    requestId: string,
  ): Promise<PublicCourierActionResult> {
    return this.toPublicAction(
      await this.withShipment(
        orderId,
        requestId,
        'request_return_to_origin',
        (adapter, reference) => {
          if (!adapter.requestReturnToOrigin) {
            throw new CourierCapabilityUnsupportedError(
              adapter.code,
              'ndr_rto',
            );
          }
          return adapter.requestReturnToOrigin(reference);
        },
      ),
    );
  }

  async reattemptDelivery(
    orderId: string,
    input: ReattemptDeliveryInput,
    requestId: string,
  ): Promise<PublicCourierActionResult> {
    return this.toPublicAction(
      await this.withShipment(
        orderId,
        requestId,
        'reattempt_delivery',
        (adapter, reference) => {
          if (!adapter.reattemptDelivery) {
            throw new CourierCapabilityUnsupportedError(
              adapter.code,
              'ndr_reattempt',
            );
          }
          return adapter.reattemptDelivery(reference, input);
        },
      ),
    );
  }

  async changePaymentMode(
    orderId: string,
    requestId: string,
  ): Promise<PublicCourierActionResult> {
    return this.toPublicAction(
      await this.withShipment(
        orderId,
        requestId,
        'change_payment_mode',
        (adapter, reference) => {
          if (!adapter.changePaymentMode) {
            throw new CourierCapabilityUnsupportedError(
              adapter.code,
              'payment_mode_change',
            );
          }
          return adapter.changePaymentMode(reference);
        },
      ),
    );
  }

  private async withShipment<T>(
    orderId: string,
    requestId: string,
    operation: string,
    execute: (
      adapter: ReturnType<CourierRegistry['get']>,
      reference: ShipmentReference,
    ) => Promise<T>,
  ): Promise<T> {
    const order = await this.requireOrder(orderId);
    const adapter = await this.enabledAdapter(
      order.activeShipment.courierPartnerCode,
    );
    const reference = this.shipmentReference(order);
    try {
      return await execute(adapter, reference);
    } catch (error) {
      this.logFailure(operation, orderId, adapter.code, requestId, error);
      throw this.normalize(error);
    }
  }

  private async requireOrder(orderId: string): Promise<PersistedOrder> {
    const order = await this.orders.findByOrderId(orderId);
    if (!order) throw new OrderNotFoundError(orderId);
    return order;
  }

  private shipmentReference(order: PersistedOrder): ShipmentReference {
    const { activeShipment } = order;
    if (!activeShipment.awbNumber)
      throw new ShipmentNotReadyError(order.orderId);
    return {
      orderId: order.orderId,
      awbNumber: activeShipment.awbNumber,
      courierShipmentId: activeShipment.courierShipmentId ?? undefined,
    };
  }

  private async enabledAdapter(code: string) {
    const adapter = this.couriers.get(code);
    const partner = await this.courierPartners.findByCode(adapter.code);
    if (!partner?.isEnabled) throw new CourierDisabledError(adapter.code);
    return adapter;
  }

  private normalize(error: unknown): ApplicationError {
    return error instanceof ApplicationError
      ? error
      : new CourierOperationFailedError({ cause: error });
  }

  private logFailure(
    operation: string,
    orderId: string | undefined,
    courierPartner: string,
    requestId: string,
    error: unknown,
  ): void {
    const normalized = this.normalize(error);
    this.logger.error(
      `Courier operation failed operation=${operation} order_id=${orderId ?? 'n/a'} courier_partner=${courierPartner} request_id=${requestId} error_type=${normalized.code}`,
      error instanceof Error ? error.stack : normalized.stack,
    );
  }

  private toPublicAction(
    result: CourierActionResult,
  ): PublicCourierActionResult {
    return { accepted: result.accepted, message: result.message };
  }
}

export interface PublicCourierActionResult {
  accepted: boolean;
  message: string;
}

export interface PublicServiceabilityResult {
  courier_partner: string;
  locations: Array<{
    postal_code: string;
    inbound: boolean;
    outbound: boolean;
    returns: boolean;
    active: boolean;
    city?: string;
    state?: string;
    service_center?: string;
    service_levels: string[];
  }>;
  unsupported_postal_codes: string[];
}
