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
      httpStatus: 200,
      body: {
        status: 'Success',
        successResponse: [
          {
            status: 'Success',
            orderNumber: 'ORDER-1',
            awbNumber: 200000000001,
          },
        ],
        errorResponse: [],
      },
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
    const rawResponse = { status: 'Failed', message: 'Payload rejected' };
    request.mockResolvedValue({
      httpStatus: 200,
      body: rawResponse,
    });

    let failure: unknown;
    try {
      await adapter.createShipment(order);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(UrbaneBoltBusinessError);
    const businessError = failure as UrbaneBoltBusinessError;
    expect(businessError.courierResponsePayload).toEqual(rawResponse);
    expect(businessError.courierHttpStatus).toBe(200);
    expect(Array.isArray(businessError.courierRequestPayload)).toBe(true);
  });

  it('normalizes tracking and scan history', async () => {
    request.mockResolvedValue({
      httpStatus: 200,
      body: {
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
      httpStatus: 200,
      body: {
        status: 'Success',
        successResponse: [],
        failureResponse: [{ awb: '200000000001', message: 'Not allowed' }],
      },
    });

    await expect(
      adapter.cancelShipment({
        orderId: 'ORDER-1',
        awbNumber: '200000000001',
      }),
    ).rejects.toBeInstanceOf(UrbaneBoltBusinessError);
  });

  it('normalizes serviceability and service levels', async () => {
    request.mockResolvedValue({
      httpStatus: 200,
      body: {
        status: 'Success',
        data: [
          {
            pincode: 122001,
            inbound: true,
            outbound: true,
            rtn: true,
            isActive: true,
            city: 'Gurugram',
            serviceType: 'SDD,NDD',
          },
        ],
        errorPincodes: [999999],
      },
    });

    await expect(adapter.checkServiceability(['122001'])).resolves.toEqual({
      locations: [
        expect.objectContaining({
          postalCode: '122001',
          serviceLevels: ['SDD', 'NDD'],
        }),
      ],
      unsupportedPostalCodes: ['999999'],
    });
  });

  it('normalizes label and unavailable ePOD responses', async () => {
    request
      .mockResolvedValueOnce({
        httpStatus: 200,
        body: {
          status: 'Success',
          data: [{ awb: '200000000001' }],
          errData: [],
        },
      })
      .mockResolvedValueOnce({
        httpStatus: 200,
        body: {
          status: 'Success',
          successResponse: [],
          failedResponse: [{ message: 'Requested AWB not found!' }],
        },
      });
    const reference = { orderId: 'ORDER-1', awbNumber: '200000000001' };

    await expect(adapter.getLabel(reference)).resolves.toMatchObject({
      available: true,
      errors: [],
    });
    await expect(adapter.getProofOfDelivery(reference)).resolves.toEqual({
      available: false,
      documents: [],
      errors: ['Document is not available'],
    });
  });

  it('uses the documented NDR and payment action contracts', async () => {
    request.mockResolvedValue({
      httpStatus: 200,
      body: {
        status: 'Success',
        successResponse: [
          { awb: '200000000001', message: 'Operation accepted' },
        ],
        failedResponse: [],
      },
    });
    const reference = { orderId: 'ORDER-1', awbNumber: '200000000001' };

    await expect(
      adapter.requestReturnToOrigin(reference),
    ).resolves.toMatchObject({
      accepted: true,
    });
    await expect(adapter.changePaymentMode(reference)).resolves.toMatchObject({
      accepted: true,
    });
    await expect(
      adapter.reattemptDelivery(reference, {
        name: 'Buyer',
        address: 'New address',
        city: 'Delhi',
        state: 'Delhi',
        postalCode: '110001',
        phone: '+919000000001',
      }),
    ).resolves.toMatchObject({ accepted: true });
    expect(request).toHaveBeenNthCalledWith(
      1,
      'request return to origin',
      '/api/v1/services/ndr/?type=rtoLock',
      expect.any(Object),
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      'change payment mode',
      '/api/v1/services/update-paymode/',
      expect.any(Object),
    );
    expect(request).toHaveBeenNthCalledWith(
      3,
      'reattempt delivery',
      '/api/v1/services/ndr/?type=reAttempt',
      expect.any(Object),
    );
  });
});
