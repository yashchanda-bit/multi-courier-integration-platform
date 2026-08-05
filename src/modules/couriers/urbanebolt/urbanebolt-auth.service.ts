import { Inject, Injectable } from '@nestjs/common';
import {
  HTTP_FETCH,
  URBANEBOLT_CONFIG,
  type UrbaneBoltConfig,
} from './urbanebolt.config';
import {
  UrbaneBoltAuthenticationError,
  UrbaneBoltConfigurationError,
} from './urbanebolt.errors';

interface AuthenticationResponse {
  access_token?: unknown;
  expires_in?: unknown;
  status?: unknown;
}

@Injectable()
export class UrbaneBoltAuthService {
  private token?: { value: string; expiresAt: number };
  private pendingAuthentication?: Promise<string>;

  constructor(
    @Inject(URBANEBOLT_CONFIG)
    private readonly config: UrbaneBoltConfig,
    @Inject(HTTP_FETCH) private readonly httpFetch: typeof fetch,
  ) {}

  getToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) {
      return Promise.resolve(this.token.value);
    }
    this.pendingAuthentication ??= this.authenticate().finally(() => {
      this.pendingAuthentication = undefined;
    });
    return this.pendingAuthentication;
  }

  invalidate(): void {
    this.token = undefined;
  }

  private async authenticate(): Promise<string> {
    if (!this.config.username || !this.config.password) {
      throw new UrbaneBoltConfigurationError();
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt += 1) {
      try {
        const response = await this.httpFetch(
          `${this.config.baseUrl}/api/v1/auth/getToken/`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              username: this.config.username,
              password: this.config.password,
            }),
            signal: AbortSignal.timeout(this.config.timeoutMs),
          },
        );
        if (response.status >= 500 && attempt < this.config.maxAttempts) {
          await this.backoff(attempt);
          continue;
        }
        if (!response.ok) {
          throw new UrbaneBoltAuthenticationError({
            cause: new Error(`Authentication returned HTTP ${response.status}`),
          });
        }
        const body = (await response.json()) as AuthenticationResponse;
        if (
          body.status !== 'Success' ||
          typeof body.access_token !== 'string'
        ) {
          throw new Error('Authentication response was invalid');
        }
        const lifetimeSeconds =
          typeof body.expires_in === 'number' ? body.expires_in : 300;
        this.token = {
          value: body.access_token,
          expiresAt: Date.now() + Math.max(lifetimeSeconds - 60, 1) * 1000,
        };
        return this.token.value;
      } catch (error) {
        if (error instanceof UrbaneBoltAuthenticationError) {
          throw error;
        }
        lastError = error;
        if (attempt < this.config.maxAttempts) {
          await this.backoff(attempt);
        }
      }
    }
    throw new UrbaneBoltAuthenticationError({ cause: lastError });
  }

  private backoff(attempt: number): Promise<void> {
    return new Promise((resolve) =>
      setTimeout(resolve, this.config.retryBaseDelayMs * 2 ** (attempt - 1)),
    );
  }
}
