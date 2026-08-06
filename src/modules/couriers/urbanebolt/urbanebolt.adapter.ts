import { Inject, Injectable } from '@nestjs/common';
import type { NormalizedOrder } from '../../orders/domain/order';
import type {
  CancellationResult,
  CreateShipmentResult,
  ShipmentReference,
  TrackingResult,
} from '../../orders/domain/shipment';
import type { CourierAdapter } from '../domain/courier-adapter';
import type {
  CourierActionResult,
  CourierDocumentResult,
  ReattemptDeliveryInput,
  ServiceabilityLocation,
  ServiceabilityResult,
} from '../domain/courier-capabilities';
import { URBANEBOLT_CONFIG, type UrbaneBoltConfig } from './urbanebolt.config';
import {
  UrbaneBoltBusinessError,
  UrbaneBoltConfigurationError,
} from './urbanebolt.errors';
import { UrbaneBoltHttpClient } from './urbanebolt-http.client';
import {
  mapManifestRequest,
  mapTrackingEvent,
  mapUrbaneBoltStatus,
  stringValue,
} from './urbanebolt.mapper';

interface ManifestItem {
  orderNumber?: unknown;
  awbNumber?: unknown;
  status?: unknown;
}

interface ManifestResponse {
  status?: unknown;
  successResponse?: ManifestItem[];
  errorResponse?: unknown[];
}

interface TrackingResponse {
  status?: unknown;
  data?: Record<string, unknown> & { scans?: unknown[] };
}

interface CancellationResponse {
  status?: unknown;
  successResponse?: Array<Record<string, unknown>>;
  failureResponse?: unknown[];
}

interface ListResponse {
  status?: unknown;
  message?: unknown;
  data?: unknown[];
  errData?: unknown[];
  successResponse?: unknown[];
  failedResponse?: unknown[];
  errorPincodes?: unknown[];
}

@Injectable()
export class UrbaneBoltAdapter implements CourierAdapter {
  readonly code = 'urbanebolt';

  constructor(
    @Inject(URBANEBOLT_CONFIG)
    private readonly config: UrbaneBoltConfig,
    private readonly client: UrbaneBoltHttpClient,
  ) {}

  async createShipment(order: NormalizedOrder): Promise<CreateShipmentResult> {
    if (!this.config.customerCode) {
      throw new UrbaneBoltConfigurationError();
    }
    const rawRequest = mapManifestRequest(order, this.config);
    const response = await this.client.request<ManifestResponse>(
      'create shipment',
      '/api/v1/services/manifest/',
      { method: 'POST', body: JSON.stringify(rawRequest) },
    );
    const rawResponse = response.body;
    const success = rawResponse.successResponse?.find(
      (item) => stringValue(item.orderNumber) === order.orderId,
    );
    const awbNumber = stringValue(success?.awbNumber);
    if (rawResponse.status !== 'Success' || !success || !awbNumber) {
      throw new UrbaneBoltBusinessError('create shipment', {
        courierRequestPayload: rawRequest,
        courierResponsePayload: rawResponse,
        courierHttpStatus: response.httpStatus,
      });
    }
    return {
      courierShipmentId: awbNumber,
      awbNumber,
      status: 'CREATED',
      courierStatusCode: 'MAN',
      rawRequest,
      rawResponse,
    };
  }

  async trackShipment(reference: ShipmentReference): Promise<TrackingResult> {
    const response = await this.client.request<TrackingResponse>(
      'track shipment',
      `/api/v1/services/tracking-pub/?awb=${encodeURIComponent(reference.awbNumber)}`,
      { method: 'GET' },
    );
    const rawResponse = response.body;
    const currentCode = stringValue(rawResponse.data?.currentStatusCode);
    if (rawResponse.status !== 'Success' || !rawResponse.data || !currentCode) {
      throw new UrbaneBoltBusinessError('track shipment', {
        courierRequestPayload: reference,
        courierResponsePayload: rawResponse,
        courierHttpStatus: response.httpStatus,
      });
    }
    const scans = Array.isArray(rawResponse.data.scans)
      ? rawResponse.data.scans.filter(isRecord).map(mapTrackingEvent)
      : [];
    return {
      currentStatus: mapUrbaneBoltStatus(currentCode),
      courierStatusCode: currentCode,
      events: scans,
      rawResponse,
    };
  }

  async cancelShipment(
    reference: ShipmentReference,
  ): Promise<CancellationResult> {
    const rawRequest = { awbs: reference.awbNumber };
    const response = await this.client.request<CancellationResponse>(
      'cancel shipment',
      '/api/v1/services/cancel/',
      { method: 'POST', body: JSON.stringify(rawRequest) },
    );
    const rawResponse = response.body;
    const success = rawResponse.successResponse?.find(
      (item) => stringValue(item.awb) === reference.awbNumber,
    );
    if (rawResponse.status !== 'Success' || !success) {
      throw new UrbaneBoltBusinessError('cancel shipment', {
        courierRequestPayload: rawRequest,
        courierResponsePayload: rawResponse,
        courierHttpStatus: response.httpStatus,
      });
    }
    return {
      status: 'CANCELLED',
      courierStatusCode: 'CAN',
      rawRequest,
      rawResponse,
    };
  }

  async checkServiceability(
    postalCodes?: string[],
  ): Promise<ServiceabilityResult> {
    const query = postalCodes?.length
      ? `pincodes=${encodeURIComponent(postalCodes.join(','))}`
      : 'type=ex';
    const response = await this.client.request<ListResponse>(
      'check serviceability',
      `/api/v1/location/pincodes/?${query}`,
      { method: 'GET' },
    );
    if (response.body.status !== 'Success') {
      throw this.businessError('check serviceability', { query }, response);
    }
    return {
      locations: (response.body.data ?? [])
        .filter(isRecord)
        .map(mapServiceability),
      unsupportedPostalCodes: (response.body.errorPincodes ?? []).map(
        stringValue,
      ),
    };
  }

  async getLabel(reference: ShipmentReference): Promise<CourierDocumentResult> {
    const response = await this.client.request<ListResponse>(
      'get label',
      `/api/v1/services/label/?awbs=${encodeURIComponent(reference.awbNumber)}`,
      { method: 'GET' },
    );
    return this.documentResult(response.body, 'data', 'errData');
  }

  async getProofOfDelivery(
    reference: ShipmentReference,
  ): Promise<CourierDocumentResult> {
    const response = await this.client.request<ListResponse>(
      'get proof of delivery',
      `/api/v1/services/epod/?awbs=${encodeURIComponent(reference.awbNumber)}`,
      { method: 'GET' },
    );
    return this.documentResult(
      response.body,
      'successResponse',
      'failedResponse',
    );
  }

  requestReturnToOrigin(
    reference: ShipmentReference,
  ): Promise<CourierActionResult> {
    return this.shipmentAction(
      'request return to origin',
      '/api/v1/services/ndr/?type=rtoLock',
      { awbs: reference.awbNumber },
      reference.awbNumber,
    );
  }

  reattemptDelivery(
    reference: ShipmentReference,
    input: ReattemptDeliveryInput,
  ): Promise<CourierActionResult> {
    return this.shipmentAction(
      'reattempt delivery',
      '/api/v1/services/ndr/?type=reAttempt',
      [
        {
          awb: reference.awbNumber,
          name: input.name,
          address: input.address,
          city: input.city,
          state: input.state,
          pincode: input.postalCode,
          mobile: Number(
            input.phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, ''),
          ),
          email: input.email,
        },
      ],
      reference.awbNumber,
    );
  }

  changePaymentMode(
    reference: ShipmentReference,
  ): Promise<CourierActionResult> {
    return this.shipmentAction(
      'change payment mode',
      '/api/v1/services/update-paymode/',
      { awbs: reference.awbNumber },
      reference.awbNumber,
    );
  }

  private documentResult(
    response: ListResponse,
    successKey: 'data' | 'successResponse',
    failureKey: 'errData' | 'failedResponse',
  ): CourierDocumentResult {
    const documents = (response[successKey] ?? []).filter(isRecord);
    const failures = response[failureKey] ?? [];
    return {
      available: response.status === 'Success' && documents.length > 0,
      documents,
      errors: failures.map(() => 'Document is not available'),
    };
  }

  private async shipmentAction(
    operation: string,
    path: string,
    rawRequest: unknown,
    awbNumber: string,
  ): Promise<CourierActionResult> {
    const response = await this.client.request<ListResponse>(operation, path, {
      method: 'POST',
      body: JSON.stringify(rawRequest),
    });
    const success = (response.body.successResponse ?? [])
      .filter(isRecord)
      .find((item) => stringValue(item.awb) === awbNumber);
    if (response.body.status !== 'Success' || !success) {
      throw this.businessError(operation, rawRequest, response);
    }
    return {
      accepted: true,
      message: stringValue(success.message) || 'Operation accepted',
      rawRequest,
      rawResponse: response.body,
    };
  }

  private businessError(
    operation: string,
    rawRequest: unknown,
    response: { body: unknown; httpStatus: number },
  ): UrbaneBoltBusinessError {
    return new UrbaneBoltBusinessError(operation, {
      courierRequestPayload: rawRequest,
      courierResponsePayload: response.body,
      courierHttpStatus: response.httpStatus,
    });
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const mapServiceability = (
  item: Record<string, unknown>,
): ServiceabilityLocation => ({
  postalCode: stringValue(item.pincode),
  inbound: item.inbound === true,
  outbound: item.outbound === true,
  returns: item.rtn === true,
  active: item.isActive === true,
  city: stringValue(item.city) || undefined,
  state: stringValue(item.state) || undefined,
  serviceCenter: stringValue(item.serviceCenter) || undefined,
  serviceLevels: stringValue(item.serviceType)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
});
