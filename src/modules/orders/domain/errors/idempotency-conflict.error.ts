import { ApplicationError } from '../../../../common/errors/application-error';

export class IdempotencyConflictError extends ApplicationError {
  constructor(orderId: string) {
    super(
      'IDEMPOTENCY_CONFLICT',
      `Order '${orderId}' already exists with different request data`,
      409,
    );
  }
}
