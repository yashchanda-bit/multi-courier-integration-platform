import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { NormalizedOrder } from '../../orders/domain/order';
import type {
  BatchRecord,
  BatchRepository,
  BatchStatus,
  CompleteBatchItemInput,
} from '../domain/batch.repository';

const batchInclude = {
  items: { orderBy: { position: 'asc' as const } },
} satisfies Prisma.BatchInclude;

type BatchWithItems = Prisma.BatchGetPayload<{ include: typeof batchInclude }>;

@Injectable()
export class PrismaBatchRepository implements BatchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(orders: NormalizedOrder[]): Promise<BatchRecord> {
    const batch = await this.prisma.batch.create({
      data: {
        status: 'PENDING',
        totalCount: orders.length,
        items: {
          create: orders.map((order, position) => ({
            submittedOrderId: order.orderId,
            submittedCourierPartner: order.courierPartner,
            position,
            status: 'PENDING',
          })),
        },
      },
      include: batchInclude,
    });
    return this.mapBatch(batch);
  }

  async findById(batchId: string): Promise<BatchRecord | null> {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      include: batchInclude,
    });
    return batch ? this.mapBatch(batch) : null;
  }

  async markItemProcessing(
    batchId: string,
    position: number,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const item = await transaction.batchItem.updateMany({
        where: { batchId, position, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'PROCESSING' },
      });
      if (item.count === 0) return false;
      await transaction.batch.updateMany({
        where: { id: batchId, status: 'PENDING' },
        data: { status: 'PROCESSING', startedAt: new Date() },
      });
      return true;
    });
  }

  async completeItem(input: CompleteBatchItemInput): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const order = await transaction.order.findUnique({
        where: { orderId: input.orderId },
        select: { id: true },
      });
      const updated = await transaction.batchItem.updateMany({
        where: {
          batchId: input.batchId,
          position: input.position,
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: {
          orderId: order?.id,
          status: input.success ? 'SUCCEEDED' : 'FAILED',
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
        },
      });
      if (updated.count === 0) return;

      const batch = await transaction.batch.update({
        where: { id: input.batchId },
        data: input.success
          ? { successCount: { increment: 1 } }
          : { failureCount: { increment: 1 } },
      });
      if (batch.successCount + batch.failureCount !== batch.totalCount) return;

      const status: BatchStatus =
        batch.failureCount === 0
          ? 'COMPLETED'
          : batch.successCount === 0
            ? 'FAILED'
            : 'PARTIALLY_COMPLETED';
      await transaction.batch.update({
        where: { id: input.batchId },
        data: { status, completedAt: new Date() },
      });
    });
  }

  async failEnqueue(
    batchId: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.batchItem.updateMany({
        where: { batchId, status: 'PENDING' },
        data: { status: 'FAILED', errorCode, errorMessage },
      });
      const batch = await transaction.batch.findUniqueOrThrow({
        where: { id: batchId },
      });
      await transaction.batch.update({
        where: { id: batchId },
        data: {
          status: 'FAILED',
          failureCount: batch.totalCount,
          completedAt: new Date(),
        },
      });
    });
  }

  private mapBatch(batch: BatchWithItems): BatchRecord {
    return {
      id: batch.id,
      status: batch.status as BatchRecord['status'],
      totalCount: batch.totalCount,
      successCount: batch.successCount,
      failureCount: batch.failureCount,
      createdAt: batch.createdAt,
      startedAt: batch.startedAt,
      completedAt: batch.completedAt,
      items: batch.items.map((item) => ({
        position: item.position,
        submittedOrderId: item.submittedOrderId,
        submittedCourierPartner: item.submittedCourierPartner,
        status: item.status as BatchRecord['items'][number]['status'],
        errorCode: item.errorCode,
        errorMessage: item.errorMessage,
      })),
    };
  }
}
