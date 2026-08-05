import type { UrbaneBoltConfig } from './urbanebolt.config';
import { UrbaneBoltAuthService } from './urbanebolt-auth.service';
import { UrbaneBoltAuthenticationError } from './urbanebolt.errors';

const config: UrbaneBoltConfig = {
  baseUrl: 'https://courier.test',
  username: 'user',
  password: 'password',
  customerCode: 'CUSTOMER-1',
  timeoutMs: 1000,
  maxAttempts: 3,
  retryBaseDelayMs: 0,
};

const response = (status: number, body: unknown): Response =>
  ({
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  }) as Response;

describe('UrbaneBoltAuthService', () => {
  it('shares one authentication call and caches the token', async () => {
    const httpFetch = jest.fn().mockResolvedValue(
      response(200, {
        status: 'Success',
        access_token: 'secret-token',
        expires_in: 86400,
      }),
    );
    const authentication = new UrbaneBoltAuthService(config, httpFetch);

    const tokens = await Promise.all([
      authentication.getToken(),
      authentication.getToken(),
    ]);
    await authentication.getToken();

    expect(tokens).toEqual(['secret-token', 'secret-token']);
    expect(httpFetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry deterministic authentication rejection', async () => {
    const httpFetch = jest.fn().mockResolvedValue(response(401, {}));
    const authentication = new UrbaneBoltAuthService(config, httpFetch);

    await expect(authentication.getToken()).rejects.toBeInstanceOf(
      UrbaneBoltAuthenticationError,
    );
    expect(httpFetch).toHaveBeenCalledTimes(1);
  });

  it('retries transient server failures', async () => {
    const httpFetch = jest
      .fn()
      .mockResolvedValueOnce(response(503, {}))
      .mockResolvedValueOnce(
        response(200, {
          status: 'Success',
          access_token: 'new-token',
          expires_in: 86400,
        }),
      );
    const authentication = new UrbaneBoltAuthService(config, httpFetch);

    await expect(authentication.getToken()).resolves.toBe('new-token');
    expect(httpFetch).toHaveBeenCalledTimes(2);
  });
});
