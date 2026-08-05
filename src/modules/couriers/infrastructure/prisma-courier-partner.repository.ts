import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  CourierPartnerRecord,
  CourierPartnerRepository,
} from '../domain/courier-partner.repository';

@Injectable()
export class PrismaCourierPartnerRepository implements CourierPartnerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByCode(code: string): Promise<CourierPartnerRecord | null> {
    return this.prisma.courierPartner.findUnique({
      where: { code: code.toLowerCase() },
      select: { id: true, code: true, isEnabled: true },
    });
  }
}
