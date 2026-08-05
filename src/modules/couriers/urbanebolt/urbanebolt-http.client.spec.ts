import { UrbaneBoltAuthService } from './urbanebolt-auth.service';
import type { UrbaneBoltConfig } from './urbanebolt.config';
import { UrbaneBoltRequestError } from './urbanebolt.errors';
import { UrbaneBoltHttpClient } from './urbanebolt-http.client';

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

describe('UrbaneBoltHttpClient', () => {
  it('refreshes authentication once after a 401', async () => {
    const invalidate = jest.fn();
    const authentication = {
      getToken: jest
        .fn()
        .mockResolvedValueOnce('expired-token')
        .mockResolvedValueOnce('fresh-token'),
      invalidate,
    } as unknown as UrbaneBoltAuthService;
    const httpFetch = jest
      .fn()
      .mockResolvedValueOnce(response(401, {}))
      .mockResolvedValueOnce(response(200, { status: 'Success' }));
    const client = new UrbaneBoltHttpClient(config, httpFetch, authentication);

    await expect(
      client.request('track shipment', '/tracking', { method: 'GET' }),
    ).resolves.toEqual({ status: 'Success' });
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(httpFetch).toHaveBeenCalledTimes(2);
    const calls = httpFetch.mock.calls as unknown[][];
    const secondRequest = calls[1]?.[1] as RequestInit;
    expect(
      (secondRequest.headers as Record<string, string>).authorization,
    ).toBe('Bearer fresh-token');
  });

  it('retries 5xx responses with bounded attempts', async () => {
    const authentication = {
      getToken: jest.fn().mockResolvedValue('token'),
      invalidate: jest.fn(),
    } as unknown as UrbaneBoltAuthService;
    const httpFetch = jest.fn().mockResolvedValue(response(503, {}));
    const client = new UrbaneBoltHttpClient(config, httpFetch, authentication);

    await expect(
      client.request('create shipment', '/manifest', { method: 'POST' }),
    ).rejects.toBeInstanceOf(UrbaneBoltRequestError);
    expect(httpFetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry a deterministic 4xx response', async () => {
    const authentication = {
      getToken: jest.fn().mockResolvedValue('token'),
      invalidate: jest.fn(),
    } as unknown as UrbaneBoltAuthService;
    const httpFetch = jest.fn().mockResolvedValue(response(400, {}));
    const client = new UrbaneBoltHttpClient(config, httpFetch, authentication);

    await expect(
      client.request('create shipment', '/manifest', { method: 'POST' }),
    ).rejects.toBeInstanceOf(UrbaneBoltRequestError);
    expect(httpFetch).toHaveBeenCalledTimes(1);
  });
});
