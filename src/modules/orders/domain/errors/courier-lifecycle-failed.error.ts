import { ApplicationError } from '../../../../common/errors/application-error';

export class CourierLifecycleFailedError extends ApplicationError {
  constructor(operation: 'tracking' | 'cancellation', options?: ErrorOptions) {
    super(
      'COURIER_OPERATION_FAILED',
      `The courier could not complete the ${operation} request`,
      502,
      [],
      options,
    );
  }
}
