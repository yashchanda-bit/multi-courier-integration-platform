import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { QUEUE_CONNECTION } from '../../../infrastructure/queue/queue-connection.module';
import { ReadinessCheckFailedError } from '../domain/readiness-check-failed.error';

export interface ReadinessResult {
  status: 'ready';
  dependencies: {
    postgres: 'up';
    redis: 'up';
  };
}

@Injectable()
export class ReadinessService {
  private readonly logger = new Logger(ReadinessService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(QUEUE_CONNECTION) private readonly redisOptions: RedisOptions,
  ) {}

  async check(): Promise<ReadinessResult> {
    const redis = new Redis({
      ...this.redisOptions,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });

    try {
      await Promise.all([this.prisma.$queryRaw`SELECT 1`, redis.connect()]);
      await redis.ping();
      return {
        status: 'ready',
        dependencies: { postgres: 'up', redis: 'up' },
      };
    } catch (error) {
      this.logger.error(
        'Readiness check failed',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ReadinessCheckFailedError();
    } finally {
      redis.disconnect();
    }
  }
}
