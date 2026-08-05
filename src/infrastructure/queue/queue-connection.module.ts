import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'bullmq';

export const QUEUE_CONNECTION = Symbol('QUEUE_CONNECTION');

const createConnectionOptions = (config: ConfigService): RedisOptions => {
  const redisUrl = new URL(config.getOrThrow<string>('REDIS_URL'));
  const database = redisUrl.pathname.slice(1);
  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username
      ? decodeURIComponent(redisUrl.username)
      : undefined,
    password: redisUrl.password
      ? decodeURIComponent(redisUrl.password)
      : undefined,
    db: database ? Number(database) : 0,
    tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
    connectTimeout: 5000,
  };
};

@Module({
  providers: [
    {
      provide: QUEUE_CONNECTION,
      inject: [ConfigService],
      useFactory: createConnectionOptions,
    },
  ],
  exports: [QUEUE_CONNECTION],
})
export class QueueConnectionModule {}
