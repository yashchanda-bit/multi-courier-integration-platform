import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApplication } from './../src/bootstrap/configure-application';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect('Hello World!');
  });

  it('returns the normalized error shape with a request ID', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .set('x-request-id', 'request-test-123')
      .expect(404);

    expect(response.headers['x-request-id']).toBe('request-test-123');
    expect(response.body).toEqual({
      error: {
        code: 'HTTP_404',
        message: 'Cannot GET /api/v1/does-not-exist',
        details: [],
        request_id: 'request-test-123',
      },
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
