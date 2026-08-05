import { UnsupportedCourierError } from '../domain/errors/unsupported-courier.error';
import { MockCourierAdapter } from '../mock/mock-courier.adapter';
import { CourierRegistry } from './courier-registry';

describe(CourierRegistry.name, () => {
  it('resolves a registered courier without case sensitivity', () => {
    const mockCourier = new MockCourierAdapter();
    const registry = new CourierRegistry([mockCourier]);

    expect(registry.get(' MOCK ')).toBe(mockCourier);
    expect(registry.supportedCouriers()).toEqual(['mock']);
  });

  it('returns a normalized unsupported-courier error', () => {
    const registry = new CourierRegistry([new MockCourierAdapter()]);

    expect(() => registry.get('unknown')).toThrow(UnsupportedCourierError);

    try {
      registry.get('unknown');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'UNSUPPORTED_COURIER',
        httpStatus: 400,
        details: [
          {
            field: 'courier_partner',
            message: 'Supported couriers: mock',
          },
        ],
      });
    }
  });

  it('fails fast when two adapters use the same code', () => {
    expect(
      () =>
        new CourierRegistry([
          new MockCourierAdapter(),
          new MockCourierAdapter(),
        ]),
    ).toThrow("Duplicate courier adapter code 'mock'");
  });
});
