import { Module } from '@nestjs/common';
import {
  COURIER_ADAPTERS,
  CourierRegistry,
} from './application/courier-registry';
import { MockCourierAdapter } from './mock/mock-courier.adapter';

@Module({
  providers: [
    MockCourierAdapter,
    {
      provide: COURIER_ADAPTERS,
      inject: [MockCourierAdapter],
      useFactory: (mockCourier: MockCourierAdapter) => [mockCourier],
    },
    CourierRegistry,
  ],
  exports: [CourierRegistry],
})
export class CouriersModule {}
