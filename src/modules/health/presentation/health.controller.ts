import { Controller, Get } from '@nestjs/common';
import {
  ReadinessResult,
  ReadinessService,
} from '../application/readiness.service';

@Controller('health')
export class HealthController {
  constructor(private readonly readiness: ReadinessService) {}

  @Get('live')
  live(): { status: 'up' } {
    return { status: 'up' };
  }

  @Get('ready')
  ready(): Promise<ReadinessResult> {
    return this.readiness.check();
  }
}
