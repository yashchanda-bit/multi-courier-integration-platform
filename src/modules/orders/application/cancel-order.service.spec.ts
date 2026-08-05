import { CourierRegistry } from '../../couriers/application/courier-registry';
import type { CourierAdapter } from '../../couriers/domain/courier-adapter';
import type { CourierPartnerRepository } from '../../couriers/domain/courier-partner.repository';
import type {
  OrderRepository,
  PersistedOrder,
} from '../domain/order.repository';
import { CancelOrderService } from './cancel-order.service';

const persistedOrder = (
  status: 'CREATED' | 'CANCELLED' = 'CREATED',
): PersistedOrder => ({
  id: 'order-db-id',
  orderId: 'ORDER-1',
  requestHash: 'a'.repeat(64),
  status: status === 'CANCELLED' ? 'CANCELLED' : 'SHIPMENT_CREATED',
  failureCode: null,
  failureMessage: null,
  createdAt: new Date('2026-08-06T00:00:00Z'),
  activeShipment: {
    id: 'shipment-db-id',
    courierPartnerId: 'courier-db-id',
    courierPartnerCode: 'mock',
    courierShipmentId: 'SHIPMENT-1',
    awbNumber: 'AWB-1',
    status,
    courierStatusCode: status === 'CANCELLED' ? 'CAN' : 'MAN',
  },
});

describe(CancelOrderService.name, () => {
  let orders: jest.Mocked<OrderRepository>;
  let partners: jest.Mocked<CourierPartnerRepository>;
  let adapter: jest.Mocked<CourierAdapter>;
  let service: CancelOrderService;

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
    partners = { findByCode: jest.fn() };
    adapter = {
      code: 'mock',
      createShipment: jest.fn(),
      trackShipment: jest.fn(),
      cancelShipment: jest.fn(),
    };
    service = new CancelOrderService(
      orders,
      partners,
      new CourierRegistry([adapter]),
    );
  });

  it('cancels through the stored courier and persists the outcome', async () => {
    orders.findByOrderId.mockResolvedValue(persistedOrder());
    partners.findByCode.mockResolvedValue({
      id: 'courier-db-id',
      code: 'mock',
      isEnabled: true,
    });
    adapter.cancelShipment.mockResolvedValue({
      status: 'CANCELLED',
      courierStatusCode: 'CAN',
      rawRequest: { awb: 'AWB-1' },
      rawResponse: { status: 'Success' },
    });

    await expect(service.execute('ORDER-1', 'request-cancel')).resolves.toEqual(
      {
        order_id: 'ORDER-1',
        courier_partner: 'mock',
        awb_number: 'AWB-1',
        status: 'CANCELLED',
      },
    );
    const persisted = orders.recordCancellation.mock.calls[0]?.[0];
    expect(persisted?.requestId).toBe('request-cancel');
    expect(persisted?.eventFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns an already cancelled shipment without another courier call', async () => {
    orders.findByOrderId.mockResolvedValue(persistedOrder('CANCELLED'));

    await expect(
      service.execute('ORDER-1', 'request-replay'),
    ).resolves.toMatchObject({
      status: 'CANCELLED',
    });
    expect(adapter.cancelShipment.mock.calls).toHaveLength(0);
  });

  it('rejects a disabled courier before cancellation', async () => {
    orders.findByOrderId.mockResolvedValue(persistedOrder());
    partners.findByCode.mockResolvedValue({
      id: 'courier-db-id',
      code: 'mock',
      isEnabled: false,
    });

    await expect(service.execute('ORDER-1', 'request')).rejects.toMatchObject({
      code: 'COURIER_DISABLED',
    });
    expect(adapter.cancelShipment.mock.calls).toHaveLength(0);
  });

  it('audits a normalized cancellation failure without changing state', async () => {
    orders.findByOrderId.mockResolvedValue(persistedOrder());
    partners.findByCode.mockResolvedValue({
      id: 'courier-db-id',
      code: 'mock',
      isEnabled: true,
    });
    adapter.cancelShipment.mockRejectedValue(new Error('private failure'));

    await expect(
      service.execute('ORDER-1', 'request-fail'),
    ).rejects.toMatchObject({
      code: 'COURIER_OPERATION_FAILED',
    });
    expect(orders.recordOperationFailure.mock.calls[0]?.[0].operation).toBe(
      'CANCEL_SHIPMENT',
    );
    expect(orders.recordCancellation.mock.calls).toHaveLength(0);
  });
});
