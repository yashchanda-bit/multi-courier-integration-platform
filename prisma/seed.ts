import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed courier partners');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const seed = async (): Promise<void> => {
  await prisma.courierPartner.upsert({
    where: { code: 'urbanebolt' },
    update: { displayName: 'UrbaneBolt' },
    create: {
      code: 'urbanebolt',
      displayName: 'UrbaneBolt',
      isEnabled: false,
    },
  });
  await prisma.courierPartner.upsert({
    where: { code: 'mock' },
    update: {
      displayName: 'MockCourier',
      isEnabled: process.env.ENABLE_MOCK_COURIER === 'true',
    },
    create: {
      code: 'mock',
      displayName: 'MockCourier',
      isEnabled: process.env.ENABLE_MOCK_COURIER === 'true',
    },
  });
};

void seed()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
