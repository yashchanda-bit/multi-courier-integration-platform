import { Inject, Injectable } from '@nestjs/common';
import { CourierAdapter } from '../domain/courier-adapter';
import { UnsupportedCourierError } from '../domain/errors/unsupported-courier.error';

export const COURIER_ADAPTERS = Symbol('COURIER_ADAPTERS');

@Injectable()
export class CourierRegistry {
  private readonly adapters: ReadonlyMap<string, CourierAdapter>;

  constructor(
    @Inject(COURIER_ADAPTERS) courierAdapters: readonly CourierAdapter[],
  ) {
    const adapters = new Map<string, CourierAdapter>();
    for (const adapter of courierAdapters) {
      const code = adapter.code.toLowerCase();
      if (adapters.has(code)) {
        throw new Error(`Duplicate courier adapter code '${code}'`);
      }
      adapters.set(code, adapter);
    }
    this.adapters = adapters;
  }

  get(code: string): CourierAdapter {
    const normalizedCode = code.trim().toLowerCase();
    const adapter = this.adapters.get(normalizedCode);
    if (!adapter) {
      throw new UnsupportedCourierError(code, this.supportedCouriers());
    }
    return adapter;
  }

  supportedCouriers(): string[] {
    return [...this.adapters.keys()].sort();
  }
}
