import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  CompleteShipmentInput,
  FailShipmentInput,
  OrderRepository,
  PersistedOrder,
  RecordCancellationInput,
  RecordOperationFailureInput,
  RecordTrackingInput,
  ReserveOrderInput,
} from '../domain/order.repository';
import { ShipmentStatus } from '../domain/shipment';

const orderInclude = {
  shipments: {
    where: { isActive: true },
    take: 1,
    include: { courierPartner: true },
  },
} satisfies Prisma.OrderInclude;

type OrderWithActiveShipment = Prisma.OrderGetPayload<{
  include: typeof orderInclude;
}>;

const toJson = (value: unknown): Prisma.InputJsonValue => {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    return {};
  }
  return JSON.parse(serialized) as Prisma.InputJsonValue;
};

const isUniqueConstraintError = (error: unknown): boolean =>
  Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'P2002',
  );

@Injectable()
export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByOrderId(orderId: string): Promise<PersistedOrder | null> {
    const order = await this.prisma.order.findUnique({
      where: { orderId },
      include: orderInclude,
    });
    return order ? this.mapOrder(order) : null;
  }

  async reserve(input: ReserveOrderInput): Promise<{
    order: PersistedOrder;
    created: boolean;
  }> {
    try {
      const order = await this.prisma.$transaction(async (transaction) => {
        const createdOrder = await transaction.order.create({
          data: {
            orderId: input.order.orderId,
            requestHash: input.requestHash,
            normalizedRequest: toJson(input.order),
            status: 'PROCESSING',
          },
        });
        await transaction.shipment.create({
          data: {
            orderId: createdOrder.id,
            courierPartnerId: input.courierPartnerId,
            shipmentSequence: 1,
            status: 'PENDING',
          },
        });
        return transaction.order.findUniqueOrThrow({
          where: { id: createdOrder.id },
          include: orderInclude,
        });
      });
      return { order: this.mapOrder(order), created: true };
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
      const existing = await this.findByOrderId(input.order.orderId);
      if (!existing) {
        throw error;
      }
      return { order: existing, created: false };
    }
  }

  async completeShipment(
    input: CompleteShipmentInput,
  ): Promise<PersistedOrder> {
    const order = await this.prisma.$transaction(async (transaction) => {
      await transaction.shipment.update({
        where: { id: input.shipmentDatabaseId },
        data: {
          courierShipmentId: input.courierShipmentId,
          awbNumber: input.awbNumber,
          status: input.status,
          courierStatusCode: input.courierStatusCode,
          courierRequestPayload: toJson(input.courierRequestPayload),
          courierResponsePayload: toJson(input.courierResponsePayload),
          failureCode: null,
          failureMessage: null,
        },
      });
      await transaction.order.update({
        where: { id: input.orderDatabaseId },
        data: { status: 'SHIPMENT_CREATED' },
      });
      await transaction.courierApiAttempt.create({
        data: {
          shipmentId: input.shipmentDatabaseId,
          courierPartnerId: input.courierPartnerId,
          operation: 'CREATE_SHIPMENT',
          attemptNumber: 1,
          requestId: input.requestId,
          requestPayload: toJson(input.courierRequestPayload),
          responsePayload: toJson(input.courierResponsePayload),
          businessStatus: 'SUCCESS',
          durationMs: input.durationMs,
        },
      });
      await transaction.trackingEvent.create({
        data: {
          shipmentId: input.shipmentDatabaseId,
          normalizedStatus: input.status,
          courierStatusCode: input.courierStatusCode,
          eventFingerprint: input.eventFingerprint,
          rawPayload: toJson(input.courierResponsePayload),
        },
      });
      return transaction.order.findUniqueOrThrow({
        where: { id: input.orderDatabaseId },
        include: orderInclude,
      });
    });
    return this.mapOrder(order);
  }

  async failShipment(input: FailShipmentInput): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.shipment.update({
        where: { id: input.shipmentDatabaseId },
        data: {
          status: 'FAILED',
          failureCode: input.errorCode,
          failureMessage: input.errorMessage,
          ...(input.courierRequestPayload === undefined
            ? {}
            : {
                courierRequestPayload: toJson(input.courierRequestPayload),
              }),
          ...(input.courierResponsePayload === undefined
            ? {}
            : {
                courierResponsePayload: toJson(input.courierResponsePayload),
              }),
        },
      }),
      this.prisma.order.update({
        where: { id: input.orderDatabaseId },
        data: {
          status: 'FAILED',
          failureCode: input.errorCode,
          failureMessage: input.errorMessage,
        },
      }),
      this.prisma.courierApiAttempt.create({
        data: {
          shipmentId: input.shipmentDatabaseId,
          courierPartnerId: input.courierPartnerId,
          operation: 'CREATE_SHIPMENT',
          attemptNumber: 1,
          requestId: input.requestId,
          ...(input.courierRequestPayload === undefined
            ? {}
            : { requestPayload: toJson(input.courierRequestPayload) }),
          ...(input.courierResponsePayload === undefined
            ? {}
            : { responsePayload: toJson(input.courierResponsePayload) }),
          httpStatus: input.courierHttpStatus,
          businessStatus: 'FAILED',
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
          durationMs: input.durationMs,
        },
      }),
    ]);
  }

  async recordTracking(input: RecordTrackingInput): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.shipment.update({
        where: { id: input.shipmentDatabaseId },
        data: {
          status: input.currentStatus,
          courierStatusCode: input.courierStatusCode,
        },
      });
      if (input.events.length > 0) {
        await transaction.trackingEvent.createMany({
          data: input.events.map((event) => ({
            shipmentId: input.shipmentDatabaseId,
            normalizedStatus: event.status,
            courierStatusCode: event.courierStatusCode,
            courierStatusDescription: event.courierStatusDescription,
            courierReasonCode: event.courierReasonCode,
            courierReasonDescription: event.courierReasonDescription,
            location: event.location,
            courierEventTime: event.eventTime,
            eventFingerprint: event.eventFingerprint,
            rawPayload: toJson(event.rawPayload),
          })),
          skipDuplicates: true,
        });
      }
      await transaction.courierApiAttempt.create({
        data: {
          shipmentId: input.shipmentDatabaseId,
          courierPartnerId: input.courierPartnerId,
          operation: 'TRACK_SHIPMENT',
          attemptNumber: 1,
          requestId: input.requestId,
          requestPayload: toJson(input.requestPayload),
          responsePayload: toJson(input.responsePayload),
          businessStatus: 'SUCCESS',
          durationMs: input.durationMs,
        },
      });
    });
  }

  async recordCancellation(input: RecordCancellationInput): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.shipment.update({
        where: { id: input.shipmentDatabaseId },
        data: {
          status: input.status,
          courierStatusCode: input.courierStatusCode,
        },
      });
      await transaction.trackingEvent.createMany({
        data: [
          {
            shipmentId: input.shipmentDatabaseId,
            normalizedStatus: input.status,
            courierStatusCode: input.courierStatusCode,
            eventFingerprint: input.eventFingerprint,
            rawPayload: toJson(input.responsePayload),
          },
        ],
        skipDuplicates: true,
      });
      await transaction.courierApiAttempt.create({
        data: {
          shipmentId: input.shipmentDatabaseId,
          courierPartnerId: input.courierPartnerId,
          operation: 'CANCEL_SHIPMENT',
          attemptNumber: 1,
          requestId: input.requestId,
          requestPayload: toJson(input.requestPayload),
          responsePayload: toJson(input.responsePayload),
          businessStatus: 'SUCCESS',
          durationMs: input.durationMs,
        },
      });
    });
  }

  async recordOperationFailure(
    input: RecordOperationFailureInput,
  ): Promise<void> {
    await this.prisma.courierApiAttempt.create({
      data: {
        shipmentId: input.shipmentDatabaseId,
        courierPartnerId: input.courierPartnerId,
        operation: input.operation,
        attemptNumber: 1,
        requestId: input.requestId,
        requestPayload: toJson(input.requestPayload),
        ...(input.responsePayload === undefined
          ? {}
          : { responsePayload: toJson(input.responsePayload) }),
        httpStatus: input.courierHttpStatus,
        businessStatus: 'FAILED',
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        durationMs: input.durationMs,
      },
    });
  }

  async failStaleProcessingOrders(input: {
    staleBefore: Date;
    errorCode: string;
    errorMessage: string;
  }): Promise<number> {
    return this.prisma.$transaction(async (transaction) => {
      const staleOrders = await transaction.order.findMany({
        where: {
          status: 'PROCESSING',
          updatedAt: { lt: input.staleBefore },
        },
        select: { id: true },
        take: 100,
        orderBy: { updatedAt: 'asc' },
      });
      if (staleOrders.length === 0) return 0;

      let claimedCount = 0;
      for (const staleOrder of staleOrders) {
        const claimed = await transaction.order.updateMany({
          where: {
            id: staleOrder.id,
            status: 'PROCESSING',
            updatedAt: { lt: input.staleBefore },
          },
          data: {
            status: 'FAILED',
            failureCode: input.errorCode,
            failureMessage: input.errorMessage,
          },
        });
        if (claimed.count === 0) continue;

        await transaction.shipment.updateMany({
          where: {
            orderId: staleOrder.id,
            isActive: true,
            status: { in: ['PENDING', 'PROCESSING'] },
          },
          data: {
            status: 'FAILED',
            failureCode: input.errorCode,
            failureMessage: input.errorMessage,
          },
        });
        claimedCount += 1;
      }
      return claimedCount;
    });
  }

  private mapOrder(order: OrderWithActiveShipment): PersistedOrder {
    const shipment = order.shipments[0];
    if (!shipment) {
      throw new Error(`Order '${order.orderId}' has no active shipment`);
    }
    return {
      id: order.id,
      orderId: order.orderId,
      requestHash: order.requestHash,
      status: order.status,
      failureCode: order.failureCode,
      failureMessage: order.failureMessage,
      createdAt: order.createdAt,
      activeShipment: {
        id: shipment.id,
        courierPartnerId: shipment.courierPartnerId,
        courierPartnerCode: shipment.courierPartner.code,
        courierShipmentId: shipment.courierShipmentId,
        awbNumber: shipment.awbNumber,
        status: shipment.status as ShipmentStatus,
        courierStatusCode: shipment.courierStatusCode,
      },
    };
  }
}
