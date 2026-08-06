import type { NormalizedOrder } from '../../orders/domain/order';
import type { UrbaneBoltConfig } from './urbanebolt.config';
import { mapManifestRequest, mapUrbaneBoltStatus } from './urbanebolt.mapper';

const config: UrbaneBoltConfig = {
  baseUrl: 'https://courier.test',
  username: 'user',
  password: 'password',
  customerCode: 'CUSTOMER-1',
  timeoutMs: 1000,
  maxAttempts: 3,
  retryBaseDelayMs: 0,
};

const order: NormalizedOrder = {
  orderId: 'ORDER-1',
  courierPartner: 'urbanebolt',
  consignee: {
    name: 'Buyer',
    phone: '+919000000001',
    addressLine1: 'Buyer street',
    city: 'Gurugram',
    state: 'Haryana',
    country: 'India',
    postalCode: '122001',
  },
  shipper: {
    name: 'Warehouse',
    phone: '+919000000002',
    addressLine1: 'Warehouse street',
    city: 'Gurugram',
    state: 'Haryana',
    country: 'India',
    postalCode: '122017',
  },
  package: {
    weightKg: 1.2,
    lengthCm: 12,
    breadthCm: 10,
    heightCm: 8,
    pieces: 1,
  },
  payment: { mode: 'COD', collectableAmount: 250 },
  invoice: { number: 'INV-1', date: '2026-08-06', value: 250 },
  items: [
    { name: 'Book', quantity: 1, unitValue: 100 },
    { name: 'Pen', quantity: 2, unitValue: 75 },
  ],
};

describe('UrbaneBolt mapping', () => {
  it('maps the normalized order to the observed manifest list contract', () => {
    const request = mapManifestRequest(order, config);

    expect(request).toHaveLength(1);
    expect(request[0]).toMatchObject({
      customerCode: 'CUSTOMER-1',
      orderNumber: 'ORDER-1',
      collectableValue: 250,
      payMode: 'COD',
      consPincode: '122001',
      shprPincode: '122017',
      rtnPincode: '122017',
      consMobile: 9000000001,
      shprMobile: 9000000002,
      rtnMobile: 9000000002,
      itemDescription: 'Book, Pen',
      itemQuantity: 3,
    });
  });

  it.each([
    ['+919000000001', 9000000001],
    ['919000000001', 9000000001],
    ['90000 00001', 9000000001],
  ])('maps unified phone %s to UrbaneBolt mobile %d', (phone, expected) => {
    const request = mapManifestRequest(
      { ...order, consignee: { ...order.consignee, phone } },
      config,
    );

    expect(request[0]?.consMobile).toBe(expected);
  });

  it.each([
    ['MAN', 'CREATED'],
    ['CAN', 'CANCELLED'],
    ['OFD', 'OUT_FOR_DELIVERY'],
    ['DEL', 'DELIVERED'],
    ['RTL', 'RETURN_TO_ORIGIN'],
    ['unknown', 'IN_TRANSIT'],
  ] as const)('normalizes courier status %s', (courier, normalized) => {
    expect(mapUrbaneBoltStatus(courier)).toBe(normalized);
  });
});
