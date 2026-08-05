import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Response } from 'express';
import { ApplicationError, ErrorDetail } from './application-error';
import { RequestWithId } from '../request-context/request-with-id';

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details: ErrorDetail[];
    request_id: string;
  };
}

@Catch()
export class NormalizedExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(NormalizedExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const requestId = request.requestId ?? randomUUID();

    const normalized = this.normalize(exception);
    this.logException(exception, requestId, request.method, request.url);
    const body: ErrorResponse = {
      error: {
        code: normalized.code,
        message: normalized.message,
        details: normalized.details,
        request_id: requestId,
      },
    };

    response.status(normalized.status).json(body);
  }

  private logException(
    exception: unknown,
    requestId: string,
    method: string,
    url: string,
  ): void {
    const context = `${method} ${url} request_id=${requestId}`;
    if (exception instanceof ApplicationError && exception.httpStatus < 500) {
      this.logger.warn(
        `${context} error=${exception.name} code=${exception.code}`,
      );
      return;
    }
    if (exception instanceof HttpException && exception.getStatus() < 500) {
      this.logger.warn(
        `${context} error=${exception.name} status=${exception.getStatus()}`,
      );
      return;
    }
    if (exception instanceof Error) {
      this.logger.error(`${context} error=${exception.name}`, exception.stack);
      return;
    }
    this.logger.error(`${context} error=UnknownException`);
  }

  private normalize(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details: ErrorDetail[];
  } {
    if (exception instanceof ApplicationError) {
      return {
        status: exception.httpStatus,
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      return {
        status: exception.getStatus(),
        code: `HTTP_${exception.getStatus()}`,
        message: this.httpMessage(exception),
        details: [],
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      details: [],
    };
  }

  private httpMessage(exception: HttpException): string {
    const response = exception.getResponse();
    if (typeof response === 'string') {
      return response;
    }

    const message: unknown = (response as Record<string, unknown>).message;
    return typeof message === 'string' ? message : exception.message;
  }
}
