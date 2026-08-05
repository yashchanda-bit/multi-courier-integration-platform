export const SHIPMENT_STATUSES = [
  'PENDING',
  'CREATED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'RETURN_TO_ORIGIN',
  'FAILED',
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export interface ShipmentReference {
  orderId: string;
  awbNumber: string;
  courierShipmentId?: string;
}

export interface CreateShipmentResult {
  courierShipmentId: string | null;
  awbNumber: string;
  status: ShipmentStatus;
  courierStatusCode: string;
  rawRequest: unknown;
  rawResponse: unknown;
}

export interface TrackingEventResult {
  status: ShipmentStatus;
  courierStatusCode: string;
  courierStatusDescription?: string;
  courierReasonCode?: string;
  courierReasonDescription?: string;
  location?: string;
  eventTime?: Date;
  rawPayload: unknown;
}

export interface TrackingResult {
  currentStatus: ShipmentStatus;
  courierStatusCode: string;
  events: TrackingEventResult[];
  rawResponse: unknown;
}

export interface CancellationResult {
  status: ShipmentStatus;
  courierStatusCode: string;
  rawRequest: unknown;
  rawResponse: unknown;
}
