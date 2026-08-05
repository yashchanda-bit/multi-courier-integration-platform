import { ApplicationError } from '../../../../common/errors/application-error';
import { HTTP_STATUS } from '../../../../common/errors/http-status';

export class CourierShipmentNotFoundError extends ApplicationError {
  constructor(awbNumber: string) {
    super(
      'COURIER_SHIPMENT_NOT_FOUND',
      `No courier shipment exists for AWB '${awbNumber}'`,
      HTTP_STATUS.NOT_FOUND,
    );
  }
}
