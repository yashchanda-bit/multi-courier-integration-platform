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

interface PostmanItem {
  name: string;
  item?: PostmanItem[];
  request?: {
    url: string;
    body?: { raw?: string };
  };
}

interface PostmanCollection {
  item: PostmanItem[];
}

const postmanCollection = JSON.parse(
  readFileSync(
    join(
      process.cwd(),
      'docs',
      'postman',
      'multi-courier-integration-platform.postman_collection.json',
    ),
    'utf8',
  ),
) as PostmanCollection;

const flattenItems = (items: PostmanItem[]): PostmanItem[] =>
  items.flatMap((item) => [item, ...flattenItems(item.item ?? [])]);

const postmanItems = flattenItems(postmanCollection.item);

const postmanBody = (requestName: string, variable: string): unknown => {
  const raw = postmanItems.find((item) => item.name === requestName)?.request
    ?.body?.raw;
  if (!raw) throw new Error(`Missing Postman body for '${requestName}'`);
  return JSON.parse(raw.replaceAll(`{{${variable}}}`, 'CONTRACT-ORDER-1'));
};

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

  it('covers every public endpoint in the Postman collection', () => {
    const urls = postmanItems
      .map((item) => item.request?.url)
      .filter((url): url is string => Boolean(url));

    expect(urls).toEqual(
      expect.arrayContaining([
        '{{base_url}}/health/live',
        '{{base_url}}/health/ready',
        '{{base_url}}/orders',
        '{{base_url}}/orders/{{order_id}}/track',
        '{{base_url}}/orders/{{order_id}}/cancel',
        '{{base_url}}/orders/bulk',
        '{{base_url}}/batches/{{batch_id}}',
      ]),
    );
  });

  it('keeps Postman request bodies aligned with the public DTOs', async () => {
    const createRequest = plainToInstance(
      CreateOrderRequestDto,
      postmanBody('Create Order', 'order_id'),
    );
    const bulkRequest = plainToInstance(
      CreateBatchRequestDto,
      postmanBody('Create Bulk Order Batch', 'bulk_order_id'),
    );

    await expect(validate(createRequest)).resolves.toEqual([]);
    await expect(validate(bulkRequest)).resolves.toEqual([]);
  });
});
