import { Module } from '@nestjs/common';
import {
  COURIER_ADAPTERS,
  CourierRegistry,
} from './application/courier-registry';
import { MockCourierAdapter } from './mock/mock-courier.adapter';
import { COURIER_PARTNER_REPOSITORY } from './domain/courier-partner.repository';
import { PrismaCourierPartnerRepository } from './infrastructure/prisma-courier-partner.repository';

@Module({
  providers: [
    MockCourierAdapter,
    {
      provide: COURIER_PARTNER_REPOSITORY,
      useClass: PrismaCourierPartnerRepository,
    },
    {
      provide: COURIER_ADAPTERS,
      inject: [MockCourierAdapter],
      useFactory: (mockCourier: MockCourierAdapter) => [mockCourier],
    },
    CourierRegistry,
  ],
  exports: [CourierRegistry, COURIER_PARTNER_REPOSITORY],
})
export class CouriersModule {}
