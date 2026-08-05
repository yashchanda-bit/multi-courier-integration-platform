import { ApplicationError } from '../../../../common/errors/application-error';

export class OrderProcessingError extends ApplicationError {
  constructor(orderId: string) {
    super(
      'ORDER_PROCESSING',
      `Order '${orderId}' is already being processed`,
      409,
    );
  }
}
