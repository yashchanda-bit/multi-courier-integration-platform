import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap/configure-application';
import { PrismaService } from '../src/infrastructure/database/prisma.service';
import {
  ORDER_REPOSITORY,
  type OrderRepository,
} from '../src/modules/orders/domain/order.repository';
import { normalizedOrderFixture } from './fixtures/normalized-order.fixture';

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

describe('order lifecycle APIs (database integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let orders: OrderRepository;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
    prisma = app.get(PrismaService);
    orders = app.get<OrderRepository>(ORDER_REPOSITORY);
    await prisma.courierPartner.upsert({
      where: { code: 'mock' },
      update: { isEnabled: true },
      create: { code: 'mock', displayName: 'MockCourier', isEnabled: true },
    });
  });

  beforeEach(async () => {
    await removeIntegrationBatches(prisma);
    await removeIntegrationOrders(prisma);
  });

  afterAll(async () => {
    await removeIntegrationBatches(prisma);
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

  it('exposes courier-neutral optional capability APIs', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/couriers/serviceability')
      .query({ courier_partner: 'mock', pincodes: '122001,122017' })
      .expect(200)
      .expect((response) => {
        const body = response.body as {
          courier_partner: string;
          unsupported_postal_codes: string[];
          locations: unknown[];
        };
        expect(body).toMatchObject({
          courier_partner: 'mock',
          unsupported_postal_codes: [],
        });
        expect(body.locations).toHaveLength(2);
      });

    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('x-request-id', 'integration-capability-create')
      .send(orderRequest)
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderRequest.order_id}/label`)
      .expect(200)
      .expect((response) =>
        expect((response.body as { available: boolean }).available).toBe(true),
      );
    await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderRequest.order_id}/epod`)
      .expect(200)
      .expect((response) =>
        expect((response.body as { available: boolean }).available).toBe(false),
      );
    await request(app.getHttpServer())
      .post(`/api/v1/orders/${orderRequest.order_id}/ndr/reattempt`)
      .send({
        name: 'Updated Customer',
        address: 'Updated address',
        city: 'Delhi',
        state: 'Delhi',
        postal_code: '110001',
        phone: '+919000000001',
      })
      .expect(200)
      .expect({ accepted: true, message: 'Delivery reattempt accepted' });
    await request(app.getHttpServer())
      .post(`/api/v1/orders/${orderRequest.order_id}/payment-mode/change`)
      .expect(200)
      .expect({ accepted: true, message: 'Payment mode change accepted' });
    await request(app.getHttpServer())
      .post(`/api/v1/orders/${orderRequest.order_id}/ndr/rto`)
      .expect(200)
      .expect({ accepted: true, message: 'Return to origin accepted' });
  });

  it('atomically fails an order and shipment after the processing lease expires', async () => {
    const order = normalizedOrderFixture({
      orderId: 'INTEGRATION-STALE-ORDER-1001',
    });
    const partner = await prisma.courierPartner.findUniqueOrThrow({
      where: { code: 'mock' },
    });
    const reservation = await orders.reserve({
      order,
      requestHash: 'b'.repeat(64),
      courierPartnerId: partner.id,
    });
    await prisma.order.update({
      where: { id: reservation.order.id },
      data: { updatedAt: new Date('2026-08-06T00:00:00.000Z') },
    });

    await expect(
      orders.failStaleProcessingOrders({
        staleBefore: new Date('2026-08-06T00:05:00.000Z'),
        errorCode: 'PROCESSING_TIMEOUT',
        errorMessage: 'Order processing exceeded its configured time limit',
      }),
    ).resolves.toBe(1);

    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: reservation.order.id },
      include: { shipments: true },
    });
    expect(stored).toMatchObject({
      status: 'FAILED',
      failureCode: 'PROCESSING_TIMEOUT',
    });
    expect(stored.shipments[0]).toMatchObject({
      status: 'FAILED',
      failureCode: 'PROCESSING_TIMEOUT',
    });
  });

  it('persists raw request, response, and HTTP status for a failed courier attempt', async () => {
    const order = normalizedOrderFixture({
      orderId: 'INTEGRATION-FAILED-AUDIT-1005',
    });
    const partner = await prisma.courierPartner.findUniqueOrThrow({
      where: { code: 'mock' },
    });
    const reservation = await orders.reserve({
      order,
      requestHash: 'a'.repeat(64),
      courierPartnerId: partner.id,
    });
    const courierRequest = [{ orderNumber: order.orderId }];
    const courierResponse = {
      status: 'Failed',
      errorResponse: [{ message: 'Internal courier-only reason' }],
    };

    await orders.failShipment({
      orderDatabaseId: reservation.order.id,
      shipmentDatabaseId: reservation.order.activeShipment.id,
      courierPartnerId: partner.id,
      requestId: 'integration-failed-audit',
      errorCode: 'COURIER_REJECTED_REQUEST',
      errorMessage: 'The courier rejected the create shipment operation',
      courierRequestPayload: courierRequest,
      courierResponsePayload: courierResponse,
      courierHttpStatus: 200,
      durationMs: 10,
    });

    const shipment = await prisma.shipment.findUniqueOrThrow({
      where: { id: reservation.order.activeShipment.id },
      include: { apiAttempts: true },
    });
    expect(shipment.courierRequestPayload).toEqual(courierRequest);
    expect(shipment.courierResponsePayload).toEqual(courierResponse);
    expect(shipment.apiAttempts[0]).toMatchObject({
      requestPayload: courierRequest,
      responsePayload: courierResponse,
      httpStatus: 200,
      businessStatus: 'FAILED',
    });
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

  it('tracks and idempotently cancels an order with complete audit history', async () => {
    const lifecycleOrder = {
      ...orderRequest,
      order_id: 'INTEGRATION-LIFECYCLE-1002',
      invoice: {
        ...orderRequest.invoice,
        number: 'INV-INTEGRATION-1002',
      },
    };
    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('x-request-id', 'integration-lifecycle-create')
      .send(lifecycleOrder)
      .expect(201);

    const tracking = await request(app.getHttpServer())
      .get(`/api/v1/orders/${lifecycleOrder.order_id}/track`)
      .set('x-request-id', 'integration-lifecycle-track')
      .expect(200);
    expect(tracking.body).toMatchObject({
      order_id: lifecycleOrder.order_id,
      courier_partner: 'mock',
      current_status: 'CREATED',
      events: [{ status: 'CREATED' }],
    });

    const cancellation = await request(app.getHttpServer())
      .post(`/api/v1/orders/${lifecycleOrder.order_id}/cancel`)
      .set('x-request-id', 'integration-lifecycle-cancel')
      .expect(200);
    expect(cancellation.body).toMatchObject({
      order_id: lifecycleOrder.order_id,
      courier_partner: 'mock',
      status: 'CANCELLED',
    });

    await request(app.getHttpServer())
      .post(`/api/v1/orders/${lifecycleOrder.order_id}/cancel`)
      .set('x-request-id', 'integration-lifecycle-cancel-replay')
      .expect(200);

    const stored = await prisma.order.findUniqueOrThrow({
      where: { orderId: lifecycleOrder.order_id },
      include: {
        shipments: {
          include: { apiAttempts: true, trackingEvents: true },
        },
      },
    });
    expect(stored.status).toBe('SHIPMENT_CREATED');
    expect(stored.shipments[0].status).toBe('CANCELLED');
    expect(
      stored.shipments[0].apiAttempts
        .map((attempt) => attempt.operation)
        .sort(),
    ).toEqual(['CANCEL_SHIPMENT', 'CREATE_SHIPMENT', 'TRACK_SHIPMENT']);
    expect(stored.shipments[0].trackingEvents).toHaveLength(3);
  });

  it('processes a bulk request asynchronously with per-order partial success', async () => {
    const successfulOrder = {
      ...orderRequest,
      order_id: 'INTEGRATION-BULK-SUCCESS-1003',
      invoice: { ...orderRequest.invoice, number: 'INV-BULK-1003' },
    };
    const failedOrder = {
      ...orderRequest,
      order_id: 'INTEGRATION-BULK-FAILURE-1004',
      courier_partner: 'missing',
      invoice: { ...orderRequest.invoice, number: 'INV-BULK-1004' },
    };
    const accepted = await request(app.getHttpServer())
      .post('/api/v1/orders/bulk')
      .set('x-request-id', 'integration-bulk-request')
      .send({ orders: [successfulOrder, failedOrder] })
      .expect(202);
    const acceptedBody = accepted.body as {
      batch_id: string;
      status: string;
      total_count: number;
      status_url: string;
    };
    expect(acceptedBody).toMatchObject({
      status: 'PENDING',
      total_count: 2,
      status_url: `/api/v1/batches/${acceptedBody.batch_id}`,
    });

    const completed = await waitForBatch(app, acceptedBody.batch_id);
    expect(completed).toMatchObject({
      batch_id: acceptedBody.batch_id,
      status: 'PARTIALLY_COMPLETED',
      total_count: 2,
      success_count: 1,
      failure_count: 1,
      items: [
        {
          position: 0,
          order_id: successfulOrder.order_id,
          courier_partner: 'mock',
          status: 'SUCCEEDED',
          error: null,
        },
        {
          position: 1,
          order_id: failedOrder.order_id,
          courier_partner: 'missing',
          status: 'FAILED',
          error: { code: 'UNSUPPORTED_COURIER' },
        },
      ],
    });
    expect(
      await prisma.order.count({
        where: {
          orderId: { in: [successfulOrder.order_id, failedOrder.order_id] },
        },
      }),
    ).toBe(1);
  });
});

const waitForBatch = async (
  app: INestApplication<App>,
  batchId: string,
): Promise<Record<string, unknown>> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/batches/${batchId}`)
      .expect(200);
    const body = response.body as Record<string, unknown>;
    if (
      ['COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED'].includes(
        String(body.status),
      )
    ) {
      return body;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Batch '${batchId}' did not reach a terminal state`);
};

const removeIntegrationBatches = async (
  prisma: PrismaService,
): Promise<void> => {
  const batches = await prisma.batch.findMany({
    where: {
      items: {
        some: { submittedOrderId: { startsWith: 'INTEGRATION-BULK-' } },
      },
    },
    select: { id: true },
  });
  const batchIds = batches.map((batch) => batch.id);
  if (batchIds.length === 0) return;
  await prisma.batchItem.deleteMany({ where: { batchId: { in: batchIds } } });
  await prisma.batch.deleteMany({ where: { id: { in: batchIds } } });
};

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
