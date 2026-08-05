import { Module } from '@nestjs/common';
import { ApplicationConfigModule } from './common/config/application-config.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [ApplicationConfigModule, DatabaseModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
