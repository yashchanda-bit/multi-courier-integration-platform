import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { NormalizedOrder } from '../../orders/domain/order';
import {
  CancellationResult,
  CreateShipmentResult,
  ShipmentReference,
  ShipmentStatus,
  TrackingResult,
} from '../../orders/domain/shipment';
import { CourierAdapter } from '../domain/courier-adapter';
import type {
  CourierActionResult,
  CourierDocumentResult,
  ReattemptDeliveryInput,
  ServiceabilityResult,
} from '../domain/courier-capabilities';
import { CourierShipmentNotFoundError } from '../domain/errors/courier-shipment-not-found.error';

interface MockShipment {
  orderId: string;
  awbNumber: string;
  status: ShipmentStatus;
  courierStatusCode: string;
  createdAt: Date;
}

@Injectable()
export class MockCourierAdapter implements CourierAdapter {
  readonly code = 'mock';
  private readonly shipmentsByOrder = new Map<string, MockShipment>();
  private readonly shipmentsByAwb = new Map<string, MockShipment>();

  async createShipment(order: NormalizedOrder): Promise<CreateShipmentResult> {
    const existing = this.shipmentsByOrder.get(order.orderId);
    const shipment = existing ?? this.createMockShipment(order.orderId);

    if (!existing) {
      this.shipmentsByOrder.set(order.orderId, shipment);
      this.shipmentsByAwb.set(shipment.awbNumber, shipment);
    }

    const rawRequest = { order_reference: order.orderId };
    const rawResponse = {
      shipment_id: `MOCK-${order.orderId}`,
      awb: shipment.awbNumber,
      status: shipment.courierStatusCode,
    };

    return Promise.resolve({
      courierShipmentId: `MOCK-${order.orderId}`,
      awbNumber: shipment.awbNumber,
      status: shipment.status,
      courierStatusCode: shipment.courierStatusCode,
      rawRequest,
      rawResponse,
    });
  }

  async trackShipment(reference: ShipmentReference): Promise<TrackingResult> {
    const shipment = this.findShipment(reference.awbNumber);
    const rawEvent = {
      awb: shipment.awbNumber,
      status: shipment.courierStatusCode,
      event_time: shipment.createdAt.toISOString(),
      location: 'Mock Distribution Centre',
    };

    return Promise.resolve({
      currentStatus: shipment.status,
      courierStatusCode: shipment.courierStatusCode,
      events: [
        {
          status: shipment.status,
          courierStatusCode: shipment.courierStatusCode,
          courierStatusDescription: this.statusDescription(shipment.status),
          location: rawEvent.location,
          eventTime: shipment.createdAt,
          rawPayload: rawEvent,
        },
      ],
      rawResponse: { shipment: rawEvent },
    });
  }

  async cancelShipment(
    reference: ShipmentReference,
  ): Promise<CancellationResult> {
    const shipment = this.findShipment(reference.awbNumber);
    shipment.status = 'CANCELLED';
    shipment.courierStatusCode = 'MOCK_CANCELLED';

    const rawRequest = { awb: reference.awbNumber };
    const rawResponse = {
      awb: reference.awbNumber,
      status: shipment.courierStatusCode,
    };

    return Promise.resolve({
      status: shipment.status,
      courierStatusCode: shipment.courierStatusCode,
      rawRequest,
      rawResponse,
    });
  }

  checkServiceability(postalCodes?: string[]): Promise<ServiceabilityResult> {
    const requested = postalCodes ?? ['110001', '122001', '122017'];
    return Promise.resolve({
      locations: requested.map((postalCode) => ({
        postalCode,
        inbound: true,
        outbound: true,
        returns: true,
        active: true,
        city: 'Mock City',
        state: 'Mock State',
        serviceCenter: 'Mock Distribution Centre',
        serviceLevels: ['SDD', 'NDD'],
      })),
      unsupportedPostalCodes: [],
    });
  }

  getLabel(reference: ShipmentReference): Promise<CourierDocumentResult> {
    const shipment = this.findShipment(reference.awbNumber);
    return Promise.resolve({
      available: true,
      documents: [{ awb_number: shipment.awbNumber, format: 'MOCK_LABEL' }],
      errors: [],
    });
  }

  getProofOfDelivery(
    reference: ShipmentReference,
  ): Promise<CourierDocumentResult> {
    const shipment = this.findShipment(reference.awbNumber);
    return Promise.resolve({
      available: shipment.status === 'DELIVERED',
      documents:
        shipment.status === 'DELIVERED'
          ? [{ awb_number: shipment.awbNumber, format: 'MOCK_EPOD' }]
          : [],
      errors:
        shipment.status === 'DELIVERED'
          ? []
          : ['Proof of delivery is not available'],
    });
  }

  requestReturnToOrigin(
    reference: ShipmentReference,
  ): Promise<CourierActionResult> {
    const shipment = this.findShipment(reference.awbNumber);
    shipment.status = 'RETURN_TO_ORIGIN';
    shipment.courierStatusCode = 'MOCK_RTO';
    return Promise.resolve(this.actionResult('Return to origin accepted'));
  }

  reattemptDelivery(
    reference: ShipmentReference,
    input: ReattemptDeliveryInput,
  ): Promise<CourierActionResult> {
    this.findShipment(reference.awbNumber);
    return Promise.resolve(
      this.actionResult('Delivery reattempt accepted', input),
    );
  }

  changePaymentMode(
    reference: ShipmentReference,
  ): Promise<CourierActionResult> {
    this.findShipment(reference.awbNumber);
    return Promise.resolve(this.actionResult('Payment mode change accepted'));
  }

  private createMockShipment(orderId: string): MockShipment {
    const digest = createHash('sha256').update(orderId).digest('hex');
    return {
      orderId,
      awbNumber: `MOCK-${digest.slice(0, 16).toUpperCase()}`,
      status: 'CREATED',
      courierStatusCode: 'MOCK_CREATED',
      createdAt: new Date(),
    };
  }

  private findShipment(awbNumber: string): MockShipment {
    const shipment = this.shipmentsByAwb.get(awbNumber);
    if (!shipment) {
      throw new CourierShipmentNotFoundError(awbNumber);
    }
    return shipment;
  }

  private statusDescription(status: ShipmentStatus): string {
    return status === 'CANCELLED' ? 'Shipment cancelled' : 'Shipment created';
  }

  private actionResult(
    message: string,
    rawRequest: unknown = {},
  ): CourierActionResult {
    return {
      accepted: true,
      message,
      rawRequest,
      rawResponse: { status: 'SUCCESS', message },
    };
  }
}
