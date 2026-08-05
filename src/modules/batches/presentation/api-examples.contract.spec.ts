import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CreateOrderRequestDto } from '../../orders/presentation/dto/create-order.request';
import { CreateBatchRequestDto } from './dto/create-batch.request';

const readExample = (name: string): unknown =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'docs', 'examples', name), 'utf8'),
  ) as unknown;

describe('documented API request examples', () => {
  it('keeps the create-order example aligned with the public DTO', async () => {
    const request = plainToInstance(
      CreateOrderRequestDto,
      readExample('create-order.json'),
    );

    await expect(validate(request)).resolves.toEqual([]);
  });

  it('keeps the bulk example aligned with nested public DTOs', async () => {
    const request = plainToInstance(
      CreateBatchRequestDto,
      readExample('bulk-orders.json'),
    );

    await expect(validate(request)).resolves.toEqual([]);
  });
});
