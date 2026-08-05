import { ApplicationError } from '../../../common/errors/application-error';
import { normalizedOrderFixture } from '../../../../test/fixtures/normalized-order.fixture';
import type { CreateOrderService } from '../../orders/application/create-order.service';
import type { BatchRepository } from '../domain/batch.repository';
import type { BulkOrderJobData } from '../infrastructure/bulk-order.job';
import { ProcessBatchItemService } from './process-batch-item.service';

const jobData = (): BulkOrderJobData => ({
  batchId: 'batch-id',
  position: 0,
  order: normalizedOrderFixture({ orderId: 'ORDER-1' }),
  originatingRequestId: 'request-1',
});

describe(ProcessBatchItemService.name, () => {
  let batches: jest.Mocked<BatchRepository>;
  let createOrder: jest.Mocked<Pick<CreateOrderService, 'execute'>>;
  let service: ProcessBatchItemService;

  beforeEach(() => {
    batches = {
      create: jest.fn(),
      findById: jest.fn(),
      markItemProcessing: jest.fn(),
      completeItem: jest.fn(),
      failEnqueue: jest.fn(),
    };
    createOrder = { execute: jest.fn() };
    service = new ProcessBatchItemService(
      batches,
      createOrder as unknown as CreateOrderService,
    );
  });

  it('marks a successfully created or replayed order as succeeded', async () => {
    batches.markItemProcessing.mockResolvedValue(true);
    createOrder.execute.mockResolvedValue({
      replayed: false,
      response: {
        order_id: 'ORDER-1',
        courier_partner: 'mock',
        courier_shipment_id: 'SHIPMENT-1',
        awb_number: 'AWB-1',
        status: 'CREATED',
        created_at: '2026-08-06T00:00:00Z',
      },
    });

    await service.execute(jobData());

    expect(batches.completeItem.mock.calls[0]?.[0]).toEqual({
      batchId: 'batch-id',
      position: 0,
      orderId: 'ORDER-1',
      success: true,
    });
  });

  it('does nothing when a duplicate delivery finds a terminal item', async () => {
    batches.markItemProcessing.mockResolvedValue(false);

    await service.execute(jobData());

    expect(createOrder.execute.mock.calls).toHaveLength(0);
    expect(batches.completeItem.mock.calls).toHaveLength(0);
  });

  it('stores normalized per-item failure without throwing the worker job', async () => {
    batches.markItemProcessing.mockResolvedValue(true);
    createOrder.execute.mockRejectedValue(
      new ApplicationError('UNSUPPORTED_COURIER', 'Unsupported courier', 400),
    );

    await expect(service.execute(jobData())).resolves.toBeUndefined();
    expect(batches.completeItem.mock.calls[0]?.[0]).toEqual({
      batchId: 'batch-id',
      position: 0,
      orderId: 'ORDER-1',
      success: false,
      errorCode: 'UNSUPPORTED_COURIER',
      errorMessage: 'Unsupported courier',
    });
  });
});
