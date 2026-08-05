import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ApplicationConfigModule } from './common/config/application-config.module';
import { RequestIdMiddleware } from './common/request-context/request-id.middleware';
import { DatabaseModule } from './infrastructure/database/database.module';
import { CouriersModule } from './modules/couriers/couriers.module';
import { OrdersModule } from './modules/orders/orders.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ApplicationConfigModule,
    DatabaseModule,
    CouriersModule,
    OrdersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
