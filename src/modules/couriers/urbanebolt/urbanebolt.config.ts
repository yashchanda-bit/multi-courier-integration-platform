import { ConfigService } from '@nestjs/config';

export const URBANEBOLT_CONFIG = Symbol('URBANEBOLT_CONFIG');
export const HTTP_FETCH = Symbol('HTTP_FETCH');

export interface UrbaneBoltConfig {
  baseUrl: string;
  username: string;
  password: string;
  customerCode: string;
  timeoutMs: number;
  maxAttempts: number;
  retryBaseDelayMs: number;
}

export const createUrbaneBoltConfig = (
  config: ConfigService,
): UrbaneBoltConfig => ({
  baseUrl: config.getOrThrow<string>('URBANEBOLT_BASE_URL').replace(/\/$/, ''),
  username: config.getOrThrow<string>('URBANEBOLT_USERNAME'),
  password: config.getOrThrow<string>('URBANEBOLT_PASSWORD'),
  customerCode: config.getOrThrow<string>('URBANEBOLT_CUSTOMER_CODE'),
  timeoutMs: config.getOrThrow<number>('URBANEBOLT_TIMEOUT_MS'),
  maxAttempts: config.getOrThrow<number>('URBANEBOLT_RETRY_MAX_ATTEMPTS'),
  retryBaseDelayMs: config.getOrThrow<number>('URBANEBOLT_RETRY_BASE_DELAY_MS'),
});
