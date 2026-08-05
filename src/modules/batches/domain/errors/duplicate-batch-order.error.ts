import { ApplicationError } from '../../../../common/errors/application-error';
import { HTTP_STATUS } from '../../../../common/errors/http-status';

export class DuplicateBatchOrderError extends ApplicationError {
  constructor(orderId: string) {
    super(
      'DUPLICATE_BATCH_ORDER',
      `Order '${orderId}' appears more than once in the batch`,
      HTTP_STATUS.BAD_REQUEST,
      [{ field: 'orders', message: `Duplicate order_id '${orderId}'` }],
    );
  }
}
