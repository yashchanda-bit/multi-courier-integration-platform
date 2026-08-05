import { NormalizedOrder } from './order';
import { ShipmentStatus, TrackingEventResult } from './shipment';

export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');

export interface PersistedShipment {
  id: string;
  courierPartnerId: string;
  courierPartnerCode: string;
  courierShipmentId: string | null;
  awbNumber: string | null;
  status: ShipmentStatus;
  courierStatusCode: string | null;
}

export interface PersistedOrder {
  id: string;
  orderId: string;
  requestHash: string;
  status: string;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: Date;
  activeShipment: PersistedShipment;
}

export interface ReserveOrderInput {
  order: NormalizedOrder;
  requestHash: string;
  courierPartnerId: string;
}

export interface CompleteShipmentInput {
  orderDatabaseId: string;
  shipmentDatabaseId: string;
  courierPartnerId: string;
  courierShipmentId: string | null;
  awbNumber: string;
  status: ShipmentStatus;
  courierStatusCode: string;
  courierRequestPayload: unknown;
  courierResponsePayload: unknown;
  requestId: string;
  eventFingerprint: string;
  durationMs: number;
}

export interface FailShipmentInput {
  orderDatabaseId: string;
  shipmentDatabaseId: string;
  courierPartnerId: string;
  requestId: string;
  errorCode: string;
  errorMessage: string;
  durationMs: number;
}

export interface RecordTrackingInput {
  orderDatabaseId: string;
  shipmentDatabaseId: string;
  courierPartnerId: string;
  currentStatus: ShipmentStatus;
  courierStatusCode: string;
  events: Array<TrackingEventResult & { eventFingerprint: string }>;
  responsePayload: unknown;
  requestPayload: unknown;
  requestId: string;
  durationMs: number;
}

export interface RecordCancellationInput {
  orderDatabaseId: string;
  shipmentDatabaseId: string;
  courierPartnerId: string;
  status: ShipmentStatus;
  courierStatusCode: string;
  requestPayload: unknown;
  responsePayload: unknown;
  eventFingerprint: string;
  requestId: string;
  durationMs: number;
}

export interface RecordOperationFailureInput {
  shipmentDatabaseId: string;
  courierPartnerId: string;
  operation: 'TRACK_SHIPMENT' | 'CANCEL_SHIPMENT';
  requestPayload: unknown;
  requestId: string;
  errorCode: string;
  errorMessage: string;
  durationMs: number;
}

export interface OrderRepository {
  findByOrderId(orderId: string): Promise<PersistedOrder | null>;
  reserve(input: ReserveOrderInput): Promise<{
    order: PersistedOrder;
    created: boolean;
  }>;
  completeShipment(input: CompleteShipmentInput): Promise<PersistedOrder>;
  failShipment(input: FailShipmentInput): Promise<void>;
  recordTracking(input: RecordTrackingInput): Promise<void>;
  recordCancellation(input: RecordCancellationInput): Promise<void>;
  recordOperationFailure(input: RecordOperationFailureInput): Promise<void>;
}
