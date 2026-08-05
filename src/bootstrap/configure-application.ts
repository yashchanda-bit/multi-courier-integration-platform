import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NormalizedExceptionFilter } from '../common/errors/normalized-exception.filter';
import { ValidationFailedError } from '../common/errors/validation-failed.error';
import { mapValidationErrors } from '../common/errors/validation-error.mapper';

export const configureApplication = (app: INestApplication): void => {
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new NormalizedExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: false,
      exceptionFactory: (errors) =>
        new ValidationFailedError(mapValidationErrors(errors)),
    }),
  );
};
