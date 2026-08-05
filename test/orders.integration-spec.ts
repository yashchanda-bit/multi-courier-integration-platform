import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap/configure-application';
import { PrismaService } from '../src/infrastructure/database/prisma.service';

const orderRequest = {
  order_id: 'INTEGRATION-ORDER-1001',
  courier_partner: 'mock',
  consignee: {
    name: 'Integration Consignee',
    phone: '+919999999999',
    address_line_1: 'Test address',
    city: 'Gurugram',
    state: 'Haryana',
    country: 'India',
    postal_code: '122001',
  },
  shipper: {
    name: 'Integration Warehouse',
    phone: '+919888888888',
    address_line_1: 'Warehouse address',
    city: 'Gurugram',
    state: 'Haryana',
    country: 'India',
    postal_code: '122017',
  },
  package: {
    weight_kg: 1.1,
    length_cm: 12,
    breadth_cm: 10,
    height_cm: 10,
    pieces: 1,
  },
  payment: { mode: 'COD', collectable_amount: 100 },
  invoice: { number: 'INV-INTEGRATION-1001', date: '2026-08-06', value: 100 },
  items: [{ name: 'Book', quantity: 1, unit_value: 100 }],
};

describe('POST /api/v1/orders (database integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.courierPartner.upsert({
      where: { code: 'mock' },
      update: { isEnabled: true },
      create: { code: 'mock', displayName: 'MockCourier', isEnabled: true },
    });
  });

  beforeEach(async () => {
    await removeIntegrationOrders(prisma);
  });

  afterAll(async () => {
    await removeIntegrationOrders(prisma);
    await app.close();
  });

  it('persists order, shipment, attempt, and tracking data atomically', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('x-request-id', 'integration-create-1')
      .send(orderRequest)
      .expect(201);
    const createdBody = created.body as Record<string, unknown>;

    expect(createdBody).toMatchObject({
      order_id: orderRequest.order_id,
      courier_partner: 'mock',
      courier_shipment_id: `MOCK-${orderRequest.order_id}`,
      status: 'CREATED',
    });
    expect(createdBody.awb_number).toMatch(/^MOCK-[A-F0-9]{16}$/);

    const stored = await prisma.order.findUniqueOrThrow({
      where: { orderId: orderRequest.order_id },
      include: {
        shipments: {
          include: { apiAttempts: true, trackingEvents: true },
        },
      },
    });
    expect(stored.status).toBe('SHIPMENT_CREATED');
    expect(stored.shipments).toHaveLength(1);
    expect(stored.shipments[0].apiAttempts).toHaveLength(1);
    expect(stored.shipments[0].trackingEvents).toHaveLength(1);
    expect(stored.shipments[0].apiAttempts[0]).toMatchObject({
      requestId: 'integration-create-1',
      operation: 'CREATE_SHIPMENT',
      businessStatus: 'SUCCESS',
    });
  });

  it('returns the existing shipment for an identical replay', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send(orderRequest)
      .expect(201);
    const replay = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send(orderRequest)
      .expect(200);

    expect(replay.body).toEqual(first.body);
    expect(
      await prisma.order.count({ where: { orderId: orderRequest.order_id } }),
    ).toBe(1);
    expect(
      await prisma.courierApiAttempt.count({
        where: {
          shipment: { order: { orderId: orderRequest.order_id } },
        },
      }),
    ).toBe(1);
  });

  it('rejects the same order ID with a different request hash', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send(orderRequest)
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send({
        ...orderRequest,
        invoice: { ...orderRequest.invoice, value: 200 },
      })
      .expect(409);
    const responseBody = response.body as {
      error: Record<string, unknown>;
    };

    expect(responseBody.error).toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
      details: [],
    });
  });
});

const removeIntegrationOrders = async (
  prisma: PrismaService,
): Promise<void> => {
  const orders = await prisma.order.findMany({
    where: { orderId: { startsWith: 'INTEGRATION-' } },
    select: { id: true, shipments: { select: { id: true } } },
  });
  const orderIds = orders.map((order) => order.id);
  const shipmentIds = orders.flatMap((order) =>
    order.shipments.map((shipment) => shipment.id),
  );
  if (shipmentIds.length > 0) {
    await prisma.courierApiAttempt.deleteMany({
      where: { shipmentId: { in: shipmentIds } },
    });
    await prisma.trackingEvent.deleteMany({
      where: { shipmentId: { in: shipmentIds } },
    });
    await prisma.shipment.deleteMany({ where: { id: { in: shipmentIds } } });
  }
  if (orderIds.length > 0) {
    await prisma.batchItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  }
};
