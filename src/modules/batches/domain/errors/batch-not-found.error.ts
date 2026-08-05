import { ApplicationError } from '../../../../common/errors/application-error';
import { HTTP_STATUS } from '../../../../common/errors/http-status';

export class BatchNotFoundError extends ApplicationError {
  constructor(batchId: string) {
    super(
      'BATCH_NOT_FOUND',
      `Batch '${batchId}' was not found`,
      HTTP_STATUS.NOT_FOUND,
    );
  }
}
