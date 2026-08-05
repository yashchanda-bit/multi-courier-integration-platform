import Redis from 'ioredis';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ReadinessCheckFailedError } from '../domain/readiness-check-failed.error';
import { ReadinessService } from './readiness.service';

jest.mock('ioredis');

describe('ReadinessService', () => {
  const queryRaw = jest.fn();
  const connect = jest.fn();
  const ping = jest.fn();
  const disconnect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(Redis)
      .mockImplementation(
        () =>
          ({ connect, ping, disconnect }) as unknown as InstanceType<
            typeof Redis
          >,
      );
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    connect.mockResolvedValue(undefined);
    ping.mockResolvedValue('PONG');
  });

  it('reports ready only after PostgreSQL and Redis respond', async () => {
    const service = new ReadinessService(
      { $queryRaw: queryRaw } as unknown as PrismaService,
      { host: 'localhost', port: 6379 },
    );

    await expect(service.check()).resolves.toEqual({
      status: 'ready',
      dependencies: { postgres: 'up', redis: 'up' },
    });
    expect(ping).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('normalizes a dependency failure and closes the Redis connection', async () => {
    queryRaw.mockRejectedValue(new Error('private database error'));
    const service = new ReadinessService(
      { $queryRaw: queryRaw } as unknown as PrismaService,
      { host: 'localhost', port: 6379 },
    );

    await expect(service.check()).rejects.toBeInstanceOf(
      ReadinessCheckFailedError,
    );
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
