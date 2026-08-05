import { normalizedOrderFixture } from '../../../../test/fixtures/normalized-order.fixture';
import { CourierShipmentNotFoundError } from '../domain/errors/courier-shipment-not-found.error';
import { MockCourierAdapter } from './mock-courier.adapter';

describe(MockCourierAdapter.name, () => {
  let adapter: MockCourierAdapter;

  beforeEach(() => {
    adapter = new MockCourierAdapter();
  });

  it('creates a normalized deterministic shipment', async () => {
    const order = normalizedOrderFixture();
    const first = await adapter.createShipment(order);
    const replay = await adapter.createShipment(order);

    expect(first).toMatchObject({
      courierShipmentId: 'MOCK-ORDER-1001',
      status: 'CREATED',
      courierStatusCode: 'MOCK_CREATED',
    });
    expect(first.awbNumber).toMatch(/^MOCK-[A-F0-9]{16}$/);
    expect(replay.awbNumber).toBe(first.awbNumber);
  });

  it('tracks and cancels its shipment through the shared contract', async () => {
    const created = await adapter.createShipment(normalizedOrderFixture());
    const reference = {
      orderId: 'ORDER-1001',
      awbNumber: created.awbNumber,
      courierShipmentId: created.courierShipmentId ?? undefined,
    };

    const beforeCancellation = await adapter.trackShipment(reference);
    const cancellation = await adapter.cancelShipment(reference);
    const afterCancellation = await adapter.trackShipment(reference);

    expect(beforeCancellation.currentStatus).toBe('CREATED');
    expect(cancellation.status).toBe('CANCELLED');
    expect(afterCancellation.currentStatus).toBe('CANCELLED');
    expect(afterCancellation.events).toHaveLength(1);
  });

  it('normalizes an unknown AWB failure', async () => {
    await expect(
      adapter.trackShipment({
        orderId: 'ORDER-404',
        awbNumber: 'MOCK-NOT-FOUND',
      }),
    ).rejects.toBeInstanceOf(CourierShipmentNotFoundError);
  });
});
