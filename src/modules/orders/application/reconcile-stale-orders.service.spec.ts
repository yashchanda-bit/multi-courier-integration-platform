import { ConfigService } from '@nestjs/config';
import type { OrderRepository } from '../domain/order.repository';
import { ReconcileStaleOrdersService } from './reconcile-stale-orders.service';

describe(ReconcileStaleOrdersService.name, () => {
  let orders: jest.Mocked<OrderRepository>;
  let service: ReconcileStaleOrdersService;

  beforeEach(() => {
    orders = {
      findByOrderId: jest.fn(),
      reserve: jest.fn(),
      completeShipment: jest.fn(),
      failShipment: jest.fn(),
      recordTracking: jest.fn(),
      recordCancellation: jest.fn(),
      recordOperationFailure: jest.fn(),
      failStaleProcessingOrders: jest.fn().mockResolvedValue(0),
    };
    const config = {
      getOrThrow: jest.fn((key: string) =>
        key === 'ORDER_PROCESSING_TIMEOUT_SECONDS' ? 300 : 60,
      ),
    } as unknown as ConfigService;
    service = new ReconcileStaleOrdersService(orders, config);
  });

  it('fails orders older than the configured processing lease', async () => {
    orders.failStaleProcessingOrders.mockResolvedValue(2);

    await expect(
      service.reconcile(new Date('2026-08-06T12:05:00.000Z')),
    ).resolves.toBe(2);

    expect(orders.failStaleProcessingOrders.mock.calls[0]?.[0]).toEqual({
      staleBefore: new Date('2026-08-06T12:00:00.000Z'),
      errorCode: 'PROCESSING_TIMEOUT',
      errorMessage: 'Order processing exceeded its configured time limit',
    });
  });

  it('contains repository failures so reconciliation cannot crash the app', async () => {
    orders.failStaleProcessingOrders.mockRejectedValue(
      new Error('database unavailable'),
    );

    await expect(service.reconcile()).resolves.toBe(0);
  });
});
