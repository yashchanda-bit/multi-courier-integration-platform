export const PAYMENT_MODES = ['PREPAID', 'COD'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export interface Address {
  name: string;
  phone: string;
  email?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export interface PackageDetails {
  weightKg: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  pieces: number;
}

export interface PaymentDetails {
  mode: PaymentMode;
  collectableAmount: number;
}

export interface InvoiceDetails {
  number: string;
  date: string;
  value: number;
}

export interface OrderItem {
  name: string;
  description?: string;
  quantity: number;
  unitValue: number;
  sku?: string;
  hsnCode?: string;
}

export interface NormalizedOrder {
  orderId: string;
  courierPartner: string;
  consignee: Address;
  shipper: Address;
  returnAddress?: Address;
  package: PackageDetails;
  payment: PaymentDetails;
  invoice: InvoiceDetails;
  items: OrderItem[];
  serviceLevel?: string;
}
