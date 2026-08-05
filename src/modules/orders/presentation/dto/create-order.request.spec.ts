import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { mapCreateOrderRequest } from '../mappers/order-request.mapper';
import { CreateOrderRequestDto } from './create-order.request';

const validRequest = {
  order_id: 'ORDER-1001',
  courier_partner: 'mock',
  consignee: {
    name: 'Test Consignee',
    phone: '+919999999999',
    address_line_1: 'Test address',
    city: 'Gurugram',
    state: 'Haryana',
    country: 'India',
    postal_code: '122001',
  },
  shipper: {
    name: 'Test Warehouse',
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
  invoice: { number: 'INV-1001', date: '2026-08-05', value: 100 },
  items: [{ name: 'Book', quantity: 1, unit_value: 100 }],
};

describe(CreateOrderRequestDto.name, () => {
  it('accepts and maps a normalized courier-independent order', async () => {
    const request = plainToInstance(CreateOrderRequestDto, validRequest);

    await expect(validate(request)).resolves.toEqual([]);
    expect(mapCreateOrderRequest(request)).toMatchObject({
      orderId: 'ORDER-1001',
      courierPartner: 'mock',
      consignee: { postalCode: '122001' },
      package: { weightKg: 1.1 },
      payment: { mode: 'COD', collectableAmount: 100 },
    });
  });

  it('rejects invalid nested shipment data', async () => {
    const request = plainToInstance(CreateOrderRequestDto, {
      ...validRequest,
      consignee: { ...validRequest.consignee, postal_code: 'invalid' },
      package: { ...validRequest.package, weight_kg: 0 },
    });

    const errors = await validate(request);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['consignee', 'package']),
    );
  });

  it('does not use a closed enum for courier partners', async () => {
    const request = plainToInstance(CreateOrderRequestDto, {
      ...validRequest,
      courier_partner: 'future_courier',
    });

    await expect(validate(request)).resolves.toEqual([]);
  });
});
