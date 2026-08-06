import { ApplicationError } from '../../../common/errors/application-error';
import { CourierRegistry } from '../../couriers/application/courier-registry';
import { CourierAdapter } from '../../couriers/domain/courier-adapter';
import { UrbaneBoltBusinessError } from '../../couriers/urbanebolt/urbanebolt.errors';
import { CourierPartnerRepository } from '../../couriers/domain/courier-partner.repository';
import { MockCourierAdapter } from '../../couriers/mock/mock-courier.adapter';
import { normalizedOrderFixture } from '../../../../test/fixtures/normalized-order.fixture';
import { OrderRepository, PersistedOrder } from '../domain/order.repository';
import { IdempotencyConflictError } from '../domain/errors/idempotency-conflict.error';
import { createRequestHash } from './request-hash';
import { CreateOrderService } from './create-order.service';

const pendingOrder = (): PersistedOrder => ({
  id: 'order-db-id',
  orderId: 'ORDER-1001',
  requestHash: createRequestHash(normalizedOrderFixture()),
  status: 'PROCESSING',
  failureCode: null,
  failureMessage: null,
  createdAt: new Date('2026-08-05T00:00:00.000Z'),
  activeShipment: {
    id: 'shipment-db-id',
    courierPartnerId: 'courier-db-id',
    courierPartnerCode: 'mock',
    courierShipmentId: null,
    awbNumber: null,
    status: 'PENDING',
    courierStatusCode: null,
  },
});

const completedOrder = (): PersistedOrder => ({
  ...pendingOrder(),
  status: 'SHIPMENT_CREATED',
  activeShipment: {
    ...pendingOrder().activeShipment,
    courierShipmentId: 'MOCK-ORDER-1001',
    awbNumber: 'MOCK-ABC123',
    status: 'CREATED',
    courierStatusCode: 'MOCK_CREATED',
  },
});

describe(CreateOrderService.name, () => {
  let orders: jest.Mocked<OrderRepository>;
  let courierPartners: jest.Mocked<CourierPartnerRepository>;
  let adapter: MockCourierAdapter;
  let service: CreateOrderService;

  beforeEach(() => {
    orders = {
      findByOrderId: jest.fn(),
      reserve: jest.fn(),
      completeShipment: jest.fn(),
      failShipment: jest.fn(),
      recordTracking: jest.fn(),
      recordCancellation: jest.fn(),
      recordOperationFailure: jest.fn(),
    };
    courierPartners = { findByCode: jest.fn() };
    adapter = new MockCourierAdapter();
    service = new CreateOrderService(
      orders,
      courierPartners,
      new CourierRegistry([adapter]),
    );
  });

  it('creates a shipment and persists its complete audit outcome', async () => {
    orders.findByOrderId.mockResolvedValue(null);
    courierPartners.findByCode.mockResolvedValue({
      id: 'courier-db-id',
      code: 'mock',
      isEnabled: true,
    });
    orders.reserve.mockResolvedValue({ order: pendingOrder(), created: true });
    orders.completeShipment.mockResolvedValue(completedOrder());

    const result = await service.execute(
      normalizedOrderFixture(),
      'request-123',
    );

    expect(result).toEqual({
      replayed: false,
      response: {
        order_id: 'ORDER-1001',
        courier_partner: 'mock',
        courier_shipment_id: 'MOCK-ORDER-1001',
        awb_number: 'MOCK-ABC123',
        status: 'CREATED',
        created_at: '2026-08-05T00:00:00.000Z',
      },
    });
    expect(orders.completeShipment.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        requestId: 'request-123',
        courierPartnerId: 'courier-db-id',
        courierStatusCode: 'MOCK_CREATED',
      }),
    );
  });

  it('returns an existing result without calling a courier', async () => {
    orders.findByOrderId.mockResolvedValue(completedOrder());
    const createSpy = jest.spyOn(adapter, 'createShipment');

    const result = await service.execute(
      normalizedOrderFixture(),
      'request-replay',
    );

    expect(result.replayed).toBe(true);
    expect(createSpy).not.toHaveBeenCalled();
    expect(orders.reserve.mock.calls).toHaveLength(0);
  });

  it('rejects reuse of an order ID with different data', async () => {
    orders.findByOrderId.mockResolvedValue(completedOrder());
    const order = normalizedOrderFixture({
      invoice: { ...normalizedOrderFixture().invoice, value: 200 },
    });

    await expect(
      service.execute(order, 'request-conflict'),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it('rejects a disabled courier before reserving an order', async () => {
    orders.findByOrderId.mockResolvedValue(null);
    courierPartners.findByCode.mockResolvedValue({
      id: 'courier-db-id',
      code: 'mock',
      isEnabled: false,
    });

    await expect(
      service.execute(normalizedOrderFixture(), 'request-disabled'),
    ).rejects.toMatchObject({ code: 'COURIER_DISABLED' });
    expect(orders.reserve.mock.calls).toHaveLength(0);
  });

  it('persists a normalized failure when the adapter fails', async () => {
    const failingAdapter: CourierAdapter = {
      code: 'mock',
      createShipment: jest
        .fn()
        .mockRejectedValue(new Error('private courier failure')),
      trackShipment: jest.fn(),
      cancelShipment: jest.fn(),
    };
    service = new CreateOrderService(
      orders,
      courierPartners,
      new CourierRegistry([failingAdapter]),
    );
    orders.findByOrderId.mockResolvedValue(null);
    courierPartners.findByCode.mockResolvedValue({
      id: 'courier-db-id',
      code: 'mock',
      isEnabled: true,
    });
    orders.reserve.mockResolvedValue({ order: pendingOrder(), created: true });

    await expect(
      service.execute(normalizedOrderFixture(), 'request-failure'),
    ).rejects.toBeInstanceOf(ApplicationError);
    expect(orders.failShipment.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        errorCode: 'COURIER_OPERATION_FAILED',
        errorMessage: 'The courier could not create the shipment',
      }),
    );
  });

  it('persists courier audit context without exposing it to the client', async () => {
    const courierResponse = {
      status: 'Failed',
      errorResponse: [{ message: 'Private courier reason' }],
    };
    const failingAdapter: CourierAdapter = {
      code: 'mock',
      createShipment: jest.fn().mockRejectedValue(
        new UrbaneBoltBusinessError('create shipment', {
          courierRequestPayload: [{ orderNumber: 'ORDER-1001' }],
          courierResponsePayload: courierResponse,
          courierHttpStatus: 200,
        }),
      ),
      trackShipment: jest.fn(),
      cancelShipment: jest.fn(),
    };
    service = new CreateOrderService(
      orders,
      courierPartners,
      new CourierRegistry([failingAdapter]),
    );
    orders.findByOrderId.mockResolvedValue(null);
    courierPartners.findByCode.mockResolvedValue({
      id: 'courier-db-id',
      code: 'mock',
      isEnabled: true,
    });
    orders.reserve.mockResolvedValue({ order: pendingOrder(), created: true });

    await expect(
      service.execute(normalizedOrderFixture(), 'request-audited-failure'),
    ).rejects.toMatchObject({
      code: 'COURIER_REJECTED_REQUEST',
      message: 'The courier rejected the create shipment operation',
    });
    expect(orders.failShipment.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        courierRequestPayload: [{ orderNumber: 'ORDER-1001' }],
        courierResponsePayload: courierResponse,
        courierHttpStatus: 200,
      }),
    );
  });
});
