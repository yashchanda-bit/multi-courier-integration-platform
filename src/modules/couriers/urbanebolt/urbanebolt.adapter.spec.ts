import type { NormalizedOrder } from '../../orders/domain/order';
import { UrbaneBoltAdapter } from './urbanebolt.adapter';
import type { UrbaneBoltConfig } from './urbanebolt.config';
import { UrbaneBoltBusinessError } from './urbanebolt.errors';
import { UrbaneBoltHttpClient } from './urbanebolt-http.client';

const config: UrbaneBoltConfig = {
  baseUrl: 'https://courier.test',
  username: 'user',
  password: 'password',
  customerCode: 'CUSTOMER-1',
  timeoutMs: 1000,
  maxAttempts: 3,
  retryBaseDelayMs: 0,
};

const order = {
  orderId: 'ORDER-1',
  courierPartner: 'urbanebolt',
  consignee: {
    name: 'Buyer',
    phone: '9000000001',
    addressLine1: 'Buyer street',
    city: 'Gurugram',
    state: 'Haryana',
    country: 'India',
    postalCode: '122001',
  },
  shipper: {
    name: 'Warehouse',
    phone: '9000000002',
    addressLine1: 'Warehouse street',
    city: 'Gurugram',
    state: 'Haryana',
    country: 'India',
    postalCode: '122017',
  },
  package: {
    weightKg: 1,
    lengthCm: 10,
    breadthCm: 10,
    heightCm: 10,
    pieces: 1,
  },
  payment: { mode: 'COD', collectableAmount: 100 },
  invoice: { number: 'INV-1', date: '2026-08-06', value: 100 },
  items: [{ name: 'Book', quantity: 1, unitValue: 100 }],
} satisfies NormalizedOrder;

describe('UrbaneBoltAdapter', () => {
  const request = jest.fn();
  const adapter = new UrbaneBoltAdapter(config, {
    request,
  } as unknown as UrbaneBoltHttpClient);

  beforeEach(() => request.mockReset());

  it('maps a successful manifest response', async () => {
    request.mockResolvedValue({
      status: 'Success',
      successResponse: [
        { status: 'Success', orderNumber: 'ORDER-1', awbNumber: 200000000001 },
      ],
      errorResponse: [],
    });

    await expect(adapter.createShipment(order)).resolves.toMatchObject({
      courierShipmentId: '200000000001',
      awbNumber: '200000000001',
      status: 'CREATED',
      courierStatusCode: 'MAN',
    });
    expect(request).toHaveBeenCalledWith(
      'create shipment',
      '/api/v1/services/manifest/',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects an HTTP-200 manifest business failure', async () => {
    request.mockResolvedValue({
      status: 'Failed',
      message: 'Payload rejected',
    });

    await expect(adapter.createShipment(order)).rejects.toBeInstanceOf(
      UrbaneBoltBusinessError,
    );
  });

  it('normalizes tracking and scan history', async () => {
    request.mockResolvedValue({
      status: 'Success',
      data: {
        currentStatusCode: 'CAN',
        scans: [
          {
            statusCode: 'CAN',
            statusCodeDescription: 'Cancelled',
            statusDateTime: '2026-08-06T10:00:00Z',
          },
          { statusCode: 'MAN', statusCodeDescription: 'Manifested' },
        ],
      },
    });

    const result = await adapter.trackShipment({
      orderId: 'ORDER-1',
      awbNumber: '200000000001',
    });

    expect(result.currentStatus).toBe('CANCELLED');
    expect(result.events.map((event) => event.status)).toEqual([
      'CANCELLED',
      'CREATED',
    ]);
  });

  it('detects an item-level cancellation failure', async () => {
    request.mockResolvedValue({
      status: 'Success',
      successResponse: [],
      failureResponse: [{ awb: '200000000001', message: 'Not allowed' }],
    });

    await expect(
      adapter.cancelShipment({
        orderId: 'ORDER-1',
        awbNumber: '200000000001',
      }),
    ).rejects.toBeInstanceOf(UrbaneBoltBusinessError);
  });
});
