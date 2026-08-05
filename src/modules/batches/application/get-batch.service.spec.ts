import type { BatchRepository } from '../domain/batch.repository';
import { BatchNotFoundError } from '../domain/errors/batch-not-found.error';
import { GetBatchService } from './get-batch.service';

describe(GetBatchService.name, () => {
  const batches = {
    findById: jest.fn(),
  } as unknown as jest.Mocked<BatchRepository>;
  const service = new GetBatchService(batches);

  beforeEach(() => batches.findById.mockReset());

  it('returns normalized per-item partial-success data', async () => {
    batches.findById.mockResolvedValue({
      id: 'batch-id',
      status: 'PARTIALLY_COMPLETED',
      totalCount: 2,
      successCount: 1,
      failureCount: 1,
      createdAt: new Date('2026-08-06T00:00:00Z'),
      startedAt: new Date('2026-08-06T00:00:01Z'),
      completedAt: new Date('2026-08-06T00:00:02Z'),
      items: [
        {
          position: 0,
          submittedOrderId: 'ORDER-1',
          submittedCourierPartner: 'mock',
          status: 'SUCCEEDED',
          errorCode: null,
          errorMessage: null,
        },
        {
          position: 1,
          submittedOrderId: 'ORDER-2',
          submittedCourierPartner: 'missing',
          status: 'FAILED',
          errorCode: 'UNSUPPORTED_COURIER',
          errorMessage: 'Courier is unsupported',
        },
      ],
    });

    const result = await service.execute('batch-id');

    expect(result.status).toBe('PARTIALLY_COMPLETED');
    expect(result.items[0]?.error).toBeNull();
    expect(result.items[1]?.error).toEqual({
      code: 'UNSUPPORTED_COURIER',
      message: 'Courier is unsupported',
    });
  });

  it('returns a normalized not-found error', async () => {
    batches.findById.mockResolvedValue(null);

    await expect(service.execute('missing')).rejects.toBeInstanceOf(
      BatchNotFoundError,
    );
  });
});
