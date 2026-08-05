import { NormalizedOrder } from '../../src/modules/orders/domain/order';

export const normalizedOrderFixture = (
  overrides: Partial<NormalizedOrder> = {},
): NormalizedOrder => ({
  orderId: 'ORDER-1001',
  courierPartner: 'mock',
  consignee: {
    name: 'Test Consignee',
    phone: '+919999999999',
    email: 'consignee@example.com',
    addressLine1: 'Test consignee address',
    city: 'Gurugram',
    state: 'Haryana',
    country: 'India',
    postalCode: '122001',
  },
  shipper: {
    name: 'Test Warehouse',
    phone: '+919888888888',
    email: 'warehouse@example.com',
    addressLine1: 'Test warehouse address',
    city: 'Gurugram',
    state: 'Haryana',
    country: 'India',
    postalCode: '122017',
  },
  package: {
    weightKg: 1.1,
    lengthCm: 12,
    breadthCm: 10,
    heightCm: 10,
    pieces: 1,
  },
  payment: { mode: 'COD', collectableAmount: 100 },
  invoice: { number: 'INV-1001', date: '2026-08-05', value: 100 },
  items: [{ name: 'Book', quantity: 1, unitValue: 100 }],
  ...overrides,
});
