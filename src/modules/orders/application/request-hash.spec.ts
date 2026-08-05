import { normalizedOrderFixture } from '../../../../test/fixtures/normalized-order.fixture';
import { createRequestHash } from './request-hash';

describe(createRequestHash.name, () => {
  it('is stable when object key insertion order differs', () => {
    const order = normalizedOrderFixture();
    const reordered = {
      ...order,
      consignee: {
        postalCode: order.consignee.postalCode,
        country: order.consignee.country,
        state: order.consignee.state,
        city: order.consignee.city,
        addressLine1: order.consignee.addressLine1,
        email: order.consignee.email,
        phone: order.consignee.phone,
        name: order.consignee.name,
      },
    };

    expect(createRequestHash(reordered)).toBe(createRequestHash(order));
  });

  it('changes when shipment data changes', () => {
    const order = normalizedOrderFixture();
    const changed = normalizedOrderFixture({
      package: { ...order.package, weightKg: 2 },
    });

    expect(createRequestHash(changed)).not.toBe(createRequestHash(order));
  });
});
