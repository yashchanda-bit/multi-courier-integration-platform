import { NormalizedOrder } from '../../orders/domain/order';
import {
  CancellationResult,
  CreateShipmentResult,
  ShipmentReference,
  TrackingResult,
} from '../../orders/domain/shipment';
import {
  CourierActionResult,
  CourierDocumentResult,
  ReattemptDeliveryInput,
  ServiceabilityResult,
} from './courier-capabilities';

export interface CourierAdapter {
  readonly code: string;

  createShipment(order: NormalizedOrder): Promise<CreateShipmentResult>;
  trackShipment(reference: ShipmentReference): Promise<TrackingResult>;
  cancelShipment(reference: ShipmentReference): Promise<CancellationResult>;
  checkServiceability?(postalCodes?: string[]): Promise<ServiceabilityResult>;
  getLabel?(reference: ShipmentReference): Promise<CourierDocumentResult>;
  getProofOfDelivery?(
    reference: ShipmentReference,
  ): Promise<CourierDocumentResult>;
  requestReturnToOrigin?(
    reference: ShipmentReference,
  ): Promise<CourierActionResult>;
  reattemptDelivery?(
    reference: ShipmentReference,
    input: ReattemptDeliveryInput,
  ): Promise<CourierActionResult>;
  changePaymentMode?(
    reference: ShipmentReference,
  ): Promise<CourierActionResult>;
}
