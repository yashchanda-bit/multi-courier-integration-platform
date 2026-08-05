import { Inject, Injectable } from '@nestjs/common';
import type { NormalizedOrder } from '../../orders/domain/order';
import type {
  CancellationResult,
  CreateShipmentResult,
  ShipmentReference,
  TrackingResult,
} from '../../orders/domain/shipment';
import type { CourierAdapter } from '../domain/courier-adapter';
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
    const rawResponse = await this.client.request<ManifestResponse>(
      'create shipment',
      '/api/v1/services/manifest/',
      { method: 'POST', body: JSON.stringify(rawRequest) },
    );
    const success = rawResponse.successResponse?.find(
      (item) => stringValue(item.orderNumber) === order.orderId,
    );
    const awbNumber = stringValue(success?.awbNumber);
    if (rawResponse.status !== 'Success' || !success || !awbNumber) {
      throw new UrbaneBoltBusinessError('create shipment');
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
    const rawResponse = await this.client.request<TrackingResponse>(
      'track shipment',
      `/api/v1/services/tracking-pub/?awb=${encodeURIComponent(reference.awbNumber)}`,
      { method: 'GET' },
    );
    const currentCode = stringValue(rawResponse.data?.currentStatusCode);
    if (rawResponse.status !== 'Success' || !rawResponse.data || !currentCode) {
      throw new UrbaneBoltBusinessError('track shipment');
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
    const rawResponse = await this.client.request<CancellationResponse>(
      'cancel shipment',
      '/api/v1/services/cancel/',
      { method: 'POST', body: JSON.stringify(rawRequest) },
    );
    const success = rawResponse.successResponse?.find(
      (item) => stringValue(item.awb) === reference.awbNumber,
    );
    if (rawResponse.status !== 'Success' || !success) {
      throw new UrbaneBoltBusinessError('cancel shipment');
    }
    return {
      status: 'CANCELLED',
      courierStatusCode: 'CAN',
      rawRequest,
      rawResponse,
    };
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
