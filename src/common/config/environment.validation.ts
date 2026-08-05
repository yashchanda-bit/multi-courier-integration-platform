import Joi from 'joi';

export const environmentValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
  BULK_QUEUE_NAME: Joi.string()
    .pattern(/^[a-z0-9-]+$/)
    .default('bulk-orders'),
  BULK_WORKER_ENABLED: Joi.boolean().default(true),
  BULK_WORKER_CONCURRENCY: Joi.number().integer().min(1).max(100).default(10),
  BULK_JOB_RETENTION_SECONDS: Joi.number().integer().min(60).default(86400),
  URBANEBOLT_BASE_URL: Joi.string()
    .uri({ scheme: ['https', 'http'] })
    .default('https://uat.urbanebolt.in'),
  URBANEBOLT_USERNAME: Joi.string().allow('').default(''),
  URBANEBOLT_PASSWORD: Joi.string().allow('').default(''),
  URBANEBOLT_CUSTOMER_CODE: Joi.string().allow('').default(''),
  URBANEBOLT_TIMEOUT_MS: Joi.number().integer().min(100).default(5000),
  URBANEBOLT_RETRY_MAX_ATTEMPTS: Joi.number()
    .integer()
    .min(1)
    .max(5)
    .default(3),
  URBANEBOLT_RETRY_BASE_DELAY_MS: Joi.number()
    .integer()
    .min(0)
    .max(10_000)
    .default(250),
}).unknown(true);
