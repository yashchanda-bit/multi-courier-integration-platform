import type { CourierAdapter } from '../../couriers/domain/courier-adapter';
import type { CourierPartnerRepository } from '../../couriers/domain/courier-partner.repository';
import { CourierRegistry } from '../../couriers/application/courier-registry';
import type {
  OrderRepository,
  PersistedOrder,
} from '../domain/order.repository';
import { CourierCapabilitiesService } from './courier-capabilities.service';

const persistedOrder: PersistedOrder = {
  id: 'database-order-id',
  orderId: 'ORDER-1',
  requestHash: 'a'.repeat(64),
  status: 'SHIPMENT_CREATED',
  failureCode: null,
  failureMessage: null,
  createdAt: new Date('2026-08-06T00:00:00.000Z'),
  activeShipment: {
    id: 'shipment-id',
    courierPartnerId: 'partner-id',
    courierPartnerCode: 'test',
    courierShipmentId: 'courier-shipment-id',
    awbNumber: 'AWB-1',
    status: 'CREATED',
    courierStatusCode: 'CREATED',
  },
};

describe(CourierCapabilitiesService.name, () => {
  let orders: jest.Mocked<OrderRepository>;
  let partners: jest.Mocked<CourierPartnerRepository>;

  beforeEach(() => {
    orders = {
      findByOrderId: jest.fn().mockResolvedValue(persistedOrder),
      reserve: jest.fn(),
      completeShipment: jest.fn(),
      failShipment: jest.fn(),
      recordTracking: jest.fn(),
      recordCancellation: jest.fn(),
      recordOperationFailure: jest.fn(),
      failStaleProcessingOrders: jest.fn(),
    };
    partners = {
      findByCode: jest
        .fn()
        .mockResolvedValue({ id: 'partner-id', code: 'test', isEnabled: true }),
    };
  });

  it('resolves an order to its stored courier shipment before getting a label', async () => {
    const getLabel = jest.fn().mockResolvedValue({
      available: true,
      documents: [{ awb_number: 'AWB-1' }],
      errors: [],
    });
    const service = createService({ getLabel });

    await expect(
      service.getLabel('ORDER-1', 'request-1'),
    ).resolves.toMatchObject({
      available: true,
    });
    expect(getLabel).toHaveBeenCalledWith({
      orderId: 'ORDER-1',
      awbNumber: 'AWB-1',
      courierShipmentId: 'courier-shipment-id',
    });
  });

  it('returns normalized serviceability results', async () => {
    const checkServiceability = jest.fn().mockResolvedValue({
      locations: [],
      unsupportedPostalCodes: ['999999'],
    });
    const service = createService({ checkServiceability });

    await expect(
      service.checkServiceability('test', ['122001'], 'request-2'),
    ).resolves.toEqual({
      courier_partner: 'test',
      locations: [],
      unsupported_postal_codes: ['999999'],
    });
  });

  it('returns a normalized error when a courier lacks a capability', async () => {
    const service = createService({});

    await expect(
      service.getProofOfDelivery('ORDER-1', 'request-3'),
    ).rejects.toMatchObject({
      code: 'COURIER_CAPABILITY_UNSUPPORTED',
      httpStatus: 501,
    });
  });

  const createService = (capabilities: Partial<CourierAdapter>) => {
    const adapter = {
      code: 'test',
      createShipment: jest.fn(),
      trackShipment: jest.fn(),
      cancelShipment: jest.fn(),
      ...capabilities,
    } satisfies CourierAdapter;
    return new CourierCapabilitiesService(
      orders,
      partners,
      new CourierRegistry([adapter]),
    );
  };
});
