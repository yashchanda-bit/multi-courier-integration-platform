import { HttpStatus } from '@nestjs/common';
import { ApplicationError, ErrorDetail } from './application-error';

export class ValidationFailedError extends ApplicationError {
  constructor(details: ErrorDetail[]) {
    super(
      'VALIDATION_FAILED',
      'The request contains invalid fields',
      HttpStatus.BAD_REQUEST,
      details,
    );
  }
}
