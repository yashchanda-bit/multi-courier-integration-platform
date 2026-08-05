import { ApplicationError } from '../../../../common/errors/application-error';

export class CourierDisabledError extends ApplicationError {
  constructor(code: string) {
    super(
      'COURIER_DISABLED',
      `Courier partner '${code}' is currently disabled`,
      400,
      [{ field: 'courier_partner', message: 'Courier is not available' }],
    );
  }
}
