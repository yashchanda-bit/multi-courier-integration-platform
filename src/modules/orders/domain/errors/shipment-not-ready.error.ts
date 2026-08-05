import { ApplicationError } from '../../../../common/errors/application-error';

export class ShipmentNotReadyError extends ApplicationError {
  constructor(orderId: string) {
    super(
      'SHIPMENT_NOT_READY',
      `Order '${orderId}' does not have a trackable shipment`,
      409,
    );
  }
}
