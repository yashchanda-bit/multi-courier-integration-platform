import type { NormalizedOrder } from '../../orders/domain/order';
import type {
  ShipmentStatus,
  TrackingEventResult,
} from '../../orders/domain/shipment';
import type { UrbaneBoltConfig } from './urbanebolt.config';

export interface UrbaneBoltManifestRequest {
  customerCode: string;
  orderNumber: string;
  declaredValue: number;
  itemDescription: string;
  collectableValue: number;
  height: number;
  length: number;
  pieces: number;
  weight: number;
  breadth: number;
  serviceType: string;
  payMode: string;
  rtnCity: string;
  rtnName: string;
  rtnEmail?: string;
  rtnState: string;
  rtnMobile: string;
  rtnAddress: string;
  rtnAddressType: string;
  rtnCountry: string;
  rtnPincode: string;
  shprCity: string;
  shprName: string;
  shprEmail?: string;
  shprState: string;
  shprMobile: string;
  shprAddress: string;
  shprAddressType: string;
  shprCountry: string;
  shprPincode: string;
  consCity: string;
  consName: string;
  consEmail?: string;
  consState: string;
  consMobile: string;
  consAddress: string;
  consAddressType: string;
  consCountry: string;
  consPincode: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceValue: number;
  itemQuantity: number;
}

export const mapManifestRequest = (
  order: NormalizedOrder,
  config: UrbaneBoltConfig,
): UrbaneBoltManifestRequest[] => {
  const returnAddress = order.returnAddress ?? order.shipper;
  return [
    {
      customerCode: config.customerCode,
      orderNumber: order.orderId,
      declaredValue: order.invoice.value,
      itemDescription: order.items.map((item) => item.name).join(', '),
      collectableValue:
        order.payment.mode === 'COD' ? order.payment.collectableAmount : 0,
      height: order.package.heightCm,
      length: order.package.lengthCm,
      pieces: order.package.pieces,
      weight: order.package.weightKg,
      breadth: order.package.breadthCm,
      serviceType: order.serviceLevel ?? 'SDD',
      payMode: order.payment.mode === 'COD' ? 'COD' : 'PPD',
      rtnCity: returnAddress.city,
      rtnName: returnAddress.name,
      rtnEmail: returnAddress.email,
      rtnState: returnAddress.state,
      rtnMobile: returnAddress.phone,
      rtnAddress: joinAddress(
        returnAddress.addressLine1,
        returnAddress.addressLine2,
      ),
      rtnAddressType: 'Seller',
      rtnCountry: returnAddress.country,
      rtnPincode: returnAddress.postalCode,
      shprCity: order.shipper.city,
      shprName: order.shipper.name,
      shprEmail: order.shipper.email,
      shprState: order.shipper.state,
      shprMobile: order.shipper.phone,
      shprAddress: joinAddress(
        order.shipper.addressLine1,
        order.shipper.addressLine2,
      ),
      shprAddressType: 'Seller',
      shprCountry: order.shipper.country,
      shprPincode: order.shipper.postalCode,
      consCity: order.consignee.city,
      consName: order.consignee.name,
      consEmail: order.consignee.email,
      consState: order.consignee.state,
      consMobile: order.consignee.phone,
      consAddress: joinAddress(
        order.consignee.addressLine1,
        order.consignee.addressLine2,
      ),
      consAddressType: 'Home',
      consCountry: order.consignee.country,
      consPincode: order.consignee.postalCode,
      invoiceNumber: order.invoice.number,
      invoiceDate: order.invoice.date,
      invoiceValue: order.invoice.value,
      itemQuantity: order.items.reduce(
        (quantity, item) => quantity + item.quantity,
        0,
      ),
    },
  ];
};

export const mapUrbaneBoltStatus = (code: string): ShipmentStatus => {
  const normalized = code.trim().toUpperCase();
  if (normalized === 'MAN') return 'CREATED';
  if (normalized === 'CAN') return 'CANCELLED';
  if (['PKD', 'PUP'].includes(normalized)) return 'PICKED_UP';
  if (['OFD', 'OUT'].includes(normalized)) return 'OUT_FOR_DELIVERY';
  if (['DEL', 'DLV'].includes(normalized)) return 'DELIVERED';
  if (['RTL', 'RTO'].includes(normalized)) return 'RETURN_TO_ORIGIN';
  if (['FAIL', 'FAL'].includes(normalized)) return 'FAILED';
  return 'IN_TRANSIT';
};

export const mapTrackingEvent = (
  raw: Record<string, unknown>,
): TrackingEventResult => {
  const code = stringValue(raw.statusCode);
  const dateTime = stringValue(raw.statusDateTime);
  const parsedDate = dateTime ? new Date(dateTime) : undefined;
  return {
    status: mapUrbaneBoltStatus(code),
    courierStatusCode: code,
    courierStatusDescription: optionalString(raw.statusCodeDescription),
    courierReasonCode: optionalString(raw.reasonCode),
    courierReasonDescription: optionalString(raw.reasonCodeDescription),
    location: optionalString(raw.currentLocation),
    eventTime:
      parsedDate && !Number.isNaN(parsedDate.getTime())
        ? parsedDate
        : undefined,
    rawPayload: raw,
  };
};

export const stringValue = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

const optionalString = (value: unknown): string | undefined => {
  const result = stringValue(value);
  return result || undefined;
};

const joinAddress = (line1: string, line2?: string): string =>
  [line1, line2].filter(Boolean).join(', ');
