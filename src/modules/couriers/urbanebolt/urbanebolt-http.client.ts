import { Inject, Injectable } from '@nestjs/common';
import {
  HTTP_FETCH,
  URBANEBOLT_CONFIG,
  type UrbaneBoltConfig,
} from './urbanebolt.config';
import { UrbaneBoltRequestError } from './urbanebolt.errors';
import { UrbaneBoltAuthService } from './urbanebolt-auth.service';

@Injectable()
export class UrbaneBoltHttpClient {
  constructor(
    @Inject(URBANEBOLT_CONFIG)
    private readonly config: UrbaneBoltConfig,
    @Inject(HTTP_FETCH) private readonly httpFetch: typeof fetch,
    private readonly authentication: UrbaneBoltAuthService,
  ) {}

  async request<T>(
    operation: string,
    path: string,
    init: RequestInit,
  ): Promise<T> {
    let authRetried = false;
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt += 1) {
      try {
        const token = await this.authentication.getToken();
        const response = await this.httpFetch(`${this.config.baseUrl}${path}`, {
          ...init,
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            ...init.headers,
            authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(this.config.timeoutMs),
        });
        if (response.status === 401 && !authRetried) {
          authRetried = true;
          this.authentication.invalidate();
          attempt -= 1;
          continue;
        }
        if (response.status >= 500 && attempt < this.config.maxAttempts) {
          await this.backoff(attempt);
          continue;
        }
        if (!response.ok) {
          throw new UrbaneBoltRequestError(operation, {
            cause: new Error(`UrbaneBolt returned HTTP ${response.status}`),
          });
        }
        return (await response.json()) as T;
      } catch (error) {
        if (error instanceof UrbaneBoltRequestError) {
          throw error;
        }
        lastError = error;
        if (attempt < this.config.maxAttempts) {
          await this.backoff(attempt);
          continue;
        }
      }
    }
    throw new UrbaneBoltRequestError(operation, { cause: lastError });
  }

  private backoff(attempt: number): Promise<void> {
    return new Promise((resolve) =>
      setTimeout(resolve, this.config.retryBaseDelayMs * 2 ** (attempt - 1)),
    );
  }
}
