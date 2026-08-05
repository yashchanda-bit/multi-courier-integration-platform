import { createHash } from 'node:crypto';
import { NormalizedOrder } from '../domain/order';

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }

  return value;
};

export const createRequestHash = (order: NormalizedOrder): string =>
  createHash('sha256')
    .update(JSON.stringify(canonicalize(order)))
    .digest('hex');
