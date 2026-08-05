import { ApplicationError } from '../../../../common/errors/application-error';

export class CourierOperationFailedError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'COURIER_OPERATION_FAILED',
      'The courier could not create the shipment',
      502,
      [],
      options,
    );
  }
}
