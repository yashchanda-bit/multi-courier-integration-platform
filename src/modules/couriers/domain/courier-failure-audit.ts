export interface CourierFailureAudit {
  readonly courierRequestPayload?: unknown;
  readonly courierResponsePayload?: unknown;
  readonly courierHttpStatus?: number;
}

export const getCourierFailureAudit = (error: unknown): CourierFailureAudit => {
  if (!error || typeof error !== 'object') return {};
  const candidate = error as Record<string, unknown>;
  return {
    courierRequestPayload: candidate.courierRequestPayload,
    courierResponsePayload: candidate.courierResponsePayload,
    courierHttpStatus:
      typeof candidate.courierHttpStatus === 'number'
        ? candidate.courierHttpStatus
        : undefined,
  };
};
