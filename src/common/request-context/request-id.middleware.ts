import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Response } from 'express';
import { RequestWithId } from './request-with-id';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: RequestWithId, response: Response, next: NextFunction): void {
    const incomingRequestId = request.header('x-request-id');
    request.requestId = this.isValidRequestId(incomingRequestId)
      ? incomingRequestId
      : randomUUID();
    response.setHeader('x-request-id', request.requestId);
    next();
  }

  private isValidRequestId(value: string | undefined): value is string {
    return Boolean(value && /^[A-Za-z0-9._-]{1,100}$/.test(value));
  }
}
