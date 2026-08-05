import { environmentValidationSchema } from './environment.validation';

describe('environmentValidationSchema', () => {
  const validEnvironment = {
    NODE_ENV: 'test',
    PORT: 3000,
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/platform',
    REDIS_URL: 'redis://localhost:6379',
  };

  it('accepts valid application configuration', () => {
    const result = environmentValidationSchema.validate(validEnvironment, {
      abortEarly: false,
    });

    expect(result.error).toBeUndefined();
  });

  it.each(['DATABASE_URL', 'REDIS_URL'])('requires %s', (key) => {
    const environment = { ...validEnvironment };
    delete environment[key as keyof typeof environment];

    const result = environmentValidationSchema.validate(environment, {
      abortEarly: false,
    });

    expect(result.error?.details.some((detail) => detail.path[0] === key)).toBe(
      true,
    );
  });

  it('rejects an invalid port', () => {
    const result = environmentValidationSchema.validate(
      { ...validEnvironment, PORT: 70_000 },
      { abortEarly: false },
    );

    expect(result.error).toBeDefined();
  });
});
