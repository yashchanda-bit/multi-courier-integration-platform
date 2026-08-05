import { ValidationError } from 'class-validator';
import { ErrorDetail } from './application-error';

export const mapValidationErrors = (
  errors: ValidationError[],
  parent = '',
): ErrorDetail[] =>
  errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const ownErrors = Object.values(error.constraints ?? {}).map((message) => ({
      field,
      message,
    }));
    const childErrors = mapValidationErrors(error.children ?? [], field);
    return [...ownErrors, ...childErrors];
  });
