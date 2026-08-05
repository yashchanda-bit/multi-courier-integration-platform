import 'reflect-metadata';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/courier_platform_test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.BULK_WORKER_ENABLED ??= 'false';
