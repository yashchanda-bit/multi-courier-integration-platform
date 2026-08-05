import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { QueueConnectionModule } from '../../infrastructure/queue/queue-connection.module';
import { ReadinessService } from './application/readiness.service';
import { HealthController } from './presentation/health.controller';

@Module({
  imports: [DatabaseModule, QueueConnectionModule],
  controllers: [HealthController],
  providers: [ReadinessService],
})
export class HealthModule {}
