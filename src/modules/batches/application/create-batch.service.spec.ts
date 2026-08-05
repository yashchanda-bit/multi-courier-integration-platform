import { normalizedOrderFixture } from '../../../../test/fixtures/normalized-order.fixture';
import type { BatchRecord, BatchRepository } from '../domain/batch.repository';
import { BatchEnqueueFailedError } from '../domain/errors/batch-enqueue-failed.error';
import { DuplicateBatchOrderError } from '../domain/errors/duplicate-batch-order.error';
import type { BulkOrderQueue } from '../infrastructure/bulk-order.queue';
import { CreateBatchService } from './create-batch.service';

const batch = (): BatchRecord => ({
  id: 'batch-id',
  status: 'PENDING',
  totalCount: 2,
  successCount: 0,
  failureCount: 0,
  createdAt: new Date('2026-08-06T00:00:00Z'),
  startedAt: null,
  completedAt: null,
  items: [],
});

describe(CreateBatchService.name, () => {
  let batches: jest.Mocked<BatchRepository>;
  let queue: jest.Mocked<BulkOrderQueue>;
  let service: CreateBatchService;

  beforeEach(() => {
    batches = {
      create: jest.fn(),
      findById: jest.fn(),
      markItemProcessing: jest.fn(),
      completeItem: jest.fn(),
      failEnqueue: jest.fn(),
    };
    queue = { enqueue: jest.fn() };
    service = new CreateBatchService(batches, queue);
  });

  it('persists before enqueueing and returns an asynchronous status URL', async () => {
    const orders = [
      normalizedOrderFixture({ orderId: 'ORDER-1' }),
      normalizedOrderFixture({ orderId: 'ORDER-2' }),
    ];
    batches.create.mockResolvedValue(batch());

    await expect(service.execute(orders, 'request-1')).resolves.toEqual({
      batch_id: 'batch-id',
      status: 'PENDING',
      total_count: 2,
      status_url: '/api/v1/batches/batch-id',
    });
    expect(queue.enqueue.mock.calls[0]).toEqual([
      'batch-id',
      orders,
      'request-1',
    ]);
  });

  it('rejects duplicate order IDs before writing a batch', async () => {
    const orders = [normalizedOrderFixture(), normalizedOrderFixture()];

    await expect(service.execute(orders, 'request')).rejects.toBeInstanceOf(
      DuplicateBatchOrderError,
    );
    expect(batches.create.mock.calls).toHaveLength(0);
  });

  it('marks every pending item failed if Redis enqueueing fails', async () => {
    batches.create.mockResolvedValue(batch());
    queue.enqueue.mockRejectedValue(new Error('redis unavailable'));

    await expect(
      service.execute(
        [
          normalizedOrderFixture({ orderId: 'ORDER-1' }),
          normalizedOrderFixture({ orderId: 'ORDER-2' }),
        ],
        'request',
      ),
    ).rejects.toBeInstanceOf(BatchEnqueueFailedError);
    expect(batches.failEnqueue.mock.calls[0]).toEqual([
      'batch-id',
      'BATCH_ENQUEUE_FAILED',
      'The order could not be scheduled',
    ]);
  });
});
