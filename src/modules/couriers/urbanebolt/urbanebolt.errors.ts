import { ApplicationError } from '../../../common/errors/application-error';
import type { CourierFailureAudit } from '../domain/courier-failure-audit';

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
  readonly courierRequestPayload?: unknown;
  readonly courierResponsePayload?: unknown;
  readonly courierHttpStatus?: number;

  constructor(
    operation: string,
    audit: CourierFailureAudit = {},
    options?: ErrorOptions,
  ) {
    super(
      'COURIER_REQUEST_FAILED',
      `The courier could not complete the ${operation} operation`,
      502,
      [],
      options,
    );
    this.courierRequestPayload = audit.courierRequestPayload;
    this.courierResponsePayload = audit.courierResponsePayload;
    this.courierHttpStatus = audit.courierHttpStatus;
  }
}

export class UrbaneBoltBusinessError extends ApplicationError {
  readonly courierRequestPayload?: unknown;
  readonly courierResponsePayload?: unknown;
  readonly courierHttpStatus?: number;

  constructor(operation: string, audit: CourierFailureAudit = {}) {
    super(
      'COURIER_REJECTED_REQUEST',
      `The courier rejected the ${operation} operation`,
      422,
    );
    this.courierRequestPayload = audit.courierRequestPayload;
    this.courierResponsePayload = audit.courierResponsePayload;
    this.courierHttpStatus = audit.courierHttpStatus;
  }
}
