export interface ErrorDetail {
  field?: string;
  message: string;
}

export class ApplicationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number,
    readonly details: ErrorDetail[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}
