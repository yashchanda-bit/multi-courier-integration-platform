import { ApplicationError } from '../../../../common/errors/application-error';

export class PreviousOrderFailureError extends ApplicationError {
  constructor(orderId: string) {
    super(
      'ORDER_PREVIOUSLY_FAILED',
      `Order '${orderId}' previously failed and requires reconciliation`,
      409,
    );
  }
}
