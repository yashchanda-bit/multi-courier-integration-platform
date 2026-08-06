import type { CourierAdapter } from '../../couriers/domain/courier-adapter';
import { CourierRegistry } from '../../couriers/application/courier-registry';
import type { CourierPartnerRepository } from '../../couriers/domain/courier-partner.repository';
import type {
  OrderRepository,
  PersistedOrder,
} from '../domain/order.repository';
import { OrderNotFoundError } from '../domain/errors/order-not-found.error';
import { TrackOrderService } from './track-order.service';

const persistedOrder = (): PersistedOrder => ({
  id: 'order-db-id',
  orderId: 'ORDER-1',
  requestHash: 'a'.repeat(64),
  status: 'SHIPMENT_CREATED',
  failureCode: null,
  failureMessage: null,
  createdAt: new Date('2026-08-06T00:00:00Z'),
  activeShipment: {
    id: 'shipment-db-id',
    courierPartnerId: 'courier-db-id',
    courierPartnerCode: 'mock',
    courierShipmentId: 'SHIPMENT-1',
    awbNumber: 'AWB-1',
    status: 'CREATED',
    courierStatusCode: 'MAN',
  },
});

describe(TrackOrderService.name, () => {
  let orders: jest.Mocked<OrderRepository>;
  let partners: jest.Mocked<CourierPartnerRepository>;
  let adapter: jest.Mocked<CourierAdapter>;
  let service: TrackOrderService;

  beforeEach(() => {
    orders = {
      findByOrderId: jest.fn(),
      reserve: jest.fn(),
      completeShipment: jest.fn(),
      failShipment: jest.fn(),
      recordTracking: jest.fn(),
      recordCancellation: jest.fn(),
      recordOperationFailure: jest.fn(),
      failStaleProcessingOrders: jest.fn(),
    };
    partners = { findByCode: jest.fn() };
    adapter = {
      code: 'mock',
      createShipment: jest.fn(),
      trackShipment: jest.fn(),
      cancelShipment: jest.fn(),
    };
    service = new TrackOrderService(
      orders,
      partners,
      new CourierRegistry([adapter]),
    );
  });

  it('tracks through the stored courier and persists append-only events', async () => {
    orders.findByOrderId.mockResolvedValue(persistedOrder());
    partners.findByCode.mockResolvedValue({
      id: 'courier-db-id',
      code: 'mock',
      isEnabled: true,
    });
    adapter.trackShipment.mockResolvedValue({
      currentStatus: 'IN_TRANSIT',
      courierStatusCode: 'IT',
      events: [
        {
          status: 'IN_TRANSIT',
          courierStatusCode: 'IT',
          location: 'Delhi Hub',
          eventTime: new Date('2026-08-06T10:00:00Z'),
          rawPayload: { code: 'IT' },
        },
      ],
      rawResponse: { status: 'Success' },
    });

    const result = await service.execute('ORDER-1', 'request-track');

    expect(result).toMatchObject({
      order_id: 'ORDER-1',
      courier_partner: 'mock',
      awb_number: 'AWB-1',
      current_status: 'IN_TRANSIT',
    });
    const persisted = orders.recordTracking.mock.calls[0]?.[0];
    expect(persisted?.shipmentDatabaseId).toBe('shipment-db-id');
    expect(persisted?.requestId).toBe('request-track');
    expect(persisted?.events[0]?.courierStatusCode).toBe('IT');
    expect(persisted?.events[0]?.eventFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('creates a current-state event when the courier returns no scans', async () => {
    orders.findByOrderId.mockResolvedValue(persistedOrder());
    partners.findByCode.mockResolvedValue({
      id: 'courier-db-id',
      code: 'mock',
      isEnabled: true,
    });
    adapter.trackShipment.mockResolvedValue({
      currentStatus: 'CREATED',
      courierStatusCode: 'MAN',
      events: [],
      rawResponse: { code: 'MAN' },
    });

    await service.execute('ORDER-1', 'request-no-scans');

    expect(orders.recordTracking.mock.calls[0]?.[0].events).toHaveLength(1);
  });

  it('rejects an unknown order before calling a courier', async () => {
    orders.findByOrderId.mockResolvedValue(null);

    await expect(service.execute('MISSING', 'request')).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
    expect(adapter.trackShipment.mock.calls).toHaveLength(0);
  });

  it('audits a normalized courier failure', async () => {
    orders.findByOrderId.mockResolvedValue(persistedOrder());
    partners.findByCode.mockResolvedValue({
      id: 'courier-db-id',
      code: 'mock',
      isEnabled: true,
    });
    adapter.trackShipment.mockRejectedValue(new Error('private failure'));

    await expect(
      service.execute('ORDER-1', 'request-fail'),
    ).rejects.toMatchObject({ code: 'COURIER_OPERATION_FAILED' });
    expect(orders.recordOperationFailure.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        operation: 'TRACK_SHIPMENT',
        errorCode: 'COURIER_OPERATION_FAILED',
      }),
    );
  });
});
