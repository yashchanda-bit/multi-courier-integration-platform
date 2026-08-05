import { ApplicationError } from '../../../../common/errors/application-error';
import { HTTP_STATUS } from '../../../../common/errors/http-status';

export class OrderNotFoundError extends ApplicationError {
  constructor(orderId: string) {
    super(
      'ORDER_NOT_FOUND',
      `Order '${orderId}' was not found`,
      HTTP_STATUS.NOT_FOUND,
    );
  }
}
