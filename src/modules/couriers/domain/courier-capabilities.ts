export interface ServiceabilityLocation {
  postalCode: string;
  inbound: boolean;
  outbound: boolean;
  returns: boolean;
  active: boolean;
  city?: string;
  state?: string;
  serviceCenter?: string;
  serviceLevels: string[];
}

export interface ServiceabilityResult {
  locations: ServiceabilityLocation[];
  unsupportedPostalCodes: string[];
}

export interface CourierDocumentResult {
  available: boolean;
  documents: Array<Record<string, unknown>>;
  errors: string[];
}

export interface CourierActionResult {
  accepted: boolean;
  message: string;
  rawRequest: unknown;
  rawResponse: unknown;
}

export interface ReattemptDeliveryInput {
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  email?: string;
}
