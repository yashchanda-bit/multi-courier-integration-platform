import { ApplicationError } from '../../../../common/errors/application-error';

export class CourierCapabilityUnsupportedError extends ApplicationError {
  constructor(courierPartner: string, capability: string) {
    super(
      'COURIER_CAPABILITY_UNSUPPORTED',
      `Courier partner '${courierPartner}' does not support '${capability}'`,
      501,
    );
  }
}
