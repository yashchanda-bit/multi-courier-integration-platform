export const COURIER_PARTNER_REPOSITORY = Symbol('COURIER_PARTNER_REPOSITORY');

export interface CourierPartnerRecord {
  id: string;
  code: string;
  isEnabled: boolean;
}

export interface CourierPartnerRepository {
  findByCode(code: string): Promise<CourierPartnerRecord | null>;
}
