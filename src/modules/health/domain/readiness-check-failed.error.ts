import { ApplicationError } from '../../../common/errors/application-error';
import { HTTP_STATUS } from '../../../common/errors/http-status';

export class ReadinessCheckFailedError extends ApplicationError {
  constructor() {
    super(
      'SERVICE_NOT_READY',
      'One or more required services are unavailable',
      HTTP_STATUS.SERVICE_UNAVAILABLE,
    );
  }
}
