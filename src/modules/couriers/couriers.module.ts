import { Module } from '@nestjs/common';
import {
  COURIER_ADAPTERS,
  CourierRegistry,
} from './application/courier-registry';
import { MockCourierAdapter } from './mock/mock-courier.adapter';
import { COURIER_PARTNER_REPOSITORY } from './domain/courier-partner.repository';
import { PrismaCourierPartnerRepository } from './infrastructure/prisma-courier-partner.repository';
import { ConfigService } from '@nestjs/config';
import { UrbaneBoltAdapter } from './urbanebolt/urbanebolt.adapter';
import { UrbaneBoltAuthService } from './urbanebolt/urbanebolt-auth.service';
import {
  createUrbaneBoltConfig,
  HTTP_FETCH,
  URBANEBOLT_CONFIG,
} from './urbanebolt/urbanebolt.config';
import { UrbaneBoltHttpClient } from './urbanebolt/urbanebolt-http.client';

@Module({
  providers: [
    MockCourierAdapter,
    UrbaneBoltAdapter,
    UrbaneBoltAuthService,
    UrbaneBoltHttpClient,
    { provide: HTTP_FETCH, useValue: globalThis.fetch.bind(globalThis) },
    {
      provide: URBANEBOLT_CONFIG,
      inject: [ConfigService],
      useFactory: createUrbaneBoltConfig,
    },
    {
      provide: COURIER_PARTNER_REPOSITORY,
      useClass: PrismaCourierPartnerRepository,
    },
    {
      provide: COURIER_ADAPTERS,
      inject: [MockCourierAdapter, UrbaneBoltAdapter],
      useFactory: (
        mockCourier: MockCourierAdapter,
        urbaneBolt: UrbaneBoltAdapter,
      ) => [mockCourier, urbaneBolt],
    },
    CourierRegistry,
  ],
  exports: [CourierRegistry, COURIER_PARTNER_REPOSITORY],
})
export class CouriersModule {}
