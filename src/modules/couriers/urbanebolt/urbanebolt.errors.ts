import { ApplicationError } from '../../../common/errors/application-error';

export class UrbaneBoltConfigurationError extends ApplicationError {
  constructor() {
    super(
      'COURIER_CONFIGURATION_ERROR',
      'UrbaneBolt is not configured correctly',
      503,
    );
  }
}

export class UrbaneBoltAuthenticationError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'COURIER_AUTHENTICATION_FAILED',
      'The courier could not authenticate the request',
      502,
      [],
      options,
    );
  }
}

export class UrbaneBoltRequestError extends ApplicationError {
  constructor(operation: string, options?: ErrorOptions) {
    super(
      'COURIER_REQUEST_FAILED',
      `The courier could not complete the ${operation} operation`,
      502,
      [],
      options,
    );
  }
}

export class UrbaneBoltBusinessError extends ApplicationError {
  constructor(operation: string) {
    super(
      'COURIER_REJECTED_REQUEST',
      `The courier rejected the ${operation} operation`,
      422,
    );
  }
}
