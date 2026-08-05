import { createHash } from 'node:crypto';
import type { TrackingEventResult } from '../domain/shipment';

export const createTrackingFingerprint = (
  shipmentId: string,
  event: TrackingEventResult,
): string =>
  createHash('sha256')
    .update(
      [
        shipmentId,
        event.courierStatusCode,
        event.eventTime?.toISOString() ?? '',
        event.courierReasonCode ?? '',
        event.location ?? '',
      ].join('|'),
    )
    .digest('hex');
