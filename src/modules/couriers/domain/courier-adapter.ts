import { NormalizedOrder } from '../../orders/domain/order';
import {
  CancellationResult,
  CreateShipmentResult,
  ShipmentReference,
  TrackingResult,
} from '../../orders/domain/shipment';

export interface CourierAdapter {
  readonly code: string;

  createShipment(order: NormalizedOrder): Promise<CreateShipmentResult>;
  trackShipment(reference: ShipmentReference): Promise<TrackingResult>;
  cancelShipment(reference: ShipmentReference): Promise<CancellationResult>;
}
