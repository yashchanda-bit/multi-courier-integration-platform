import { ApplicationError } from '../../../../common/errors/application-error';
import { HTTP_STATUS } from '../../../../common/errors/http-status';

export class UnsupportedCourierError extends ApplicationError {
  constructor(code: string, supportedCouriers: string[]) {
    super(
      'UNSUPPORTED_COURIER',
      `Courier partner '${code}' is not supported`,
      HTTP_STATUS.BAD_REQUEST,
      [
        {
          field: 'courier_partner',
          message: `Supported couriers: ${supportedCouriers.join(', ')}`,
        },
      ],
    );
  }
}
