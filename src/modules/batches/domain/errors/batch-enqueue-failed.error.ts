import { ApplicationError } from '../../../../common/errors/application-error';

export class BatchEnqueueFailedError extends ApplicationError {
  constructor(batchId: string, options?: ErrorOptions) {
    super(
      'BATCH_ENQUEUE_FAILED',
      'The bulk request could not be scheduled',
      503,
      [{ field: 'batch_id', message: batchId }],
      options,
    );
  }
}
