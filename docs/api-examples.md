# API examples

These examples use the local MockCourier and do not call UrbaneBolt UAT. Run
them from the repository root after completing the README setup.

```bash
BASE_URL=http://localhost:3000/api/v1
```

## Create an order

```bash
curl --fail-with-body \
  --request POST "$BASE_URL/orders" \
  --header "Content-Type: application/json" \
  --header "X-Request-Id: demo-create-1001" \
  --data @docs/examples/create-order.json
```

The first request returns HTTP `201`. Repeating the identical request returns
HTTP `200` and the same shipment. Changing the payload while retaining the same
`order_id` returns HTTP `409`.

## Track an order

```bash
curl --fail-with-body \
  --request GET "$BASE_URL/orders/DEMO-ORDER-1001/track" \
  --header "X-Request-Id: demo-track-1001"
```

## Cancel an order

```bash
curl --fail-with-body \
  --request POST "$BASE_URL/orders/DEMO-ORDER-1001/cancel" \
  --header "X-Request-Id: demo-cancel-1001"
```

Repeating cancellation returns HTTP `200` without calling the courier again.

## Submit a bulk order batch

```bash
curl --fail-with-body \
  --request POST "$BASE_URL/orders/bulk" \
  --header "Content-Type: application/json" \
  --header "X-Request-Id: demo-bulk-2001" \
  --data @docs/examples/bulk-orders.json
```

This returns HTTP `202`. Copy the returned `batch_id` into the next command.

## Read batch results

```bash
BATCH_ID=replace-with-returned-batch-id

curl --fail-with-body \
  --request GET "$BASE_URL/batches/$BATCH_ID" \
  --header "X-Request-Id: demo-batch-status-2001"
```

Poll until `status` is `COMPLETED`, `PARTIALLY_COMPLETED`, or `FAILED`. Each item
contains its independent status and normalized error, if any.

## Error shape

All endpoints use the same client-safe shape:

```json
{
  "error": {
    "code": "ORDER_NOT_FOUND",
    "message": "Order 'UNKNOWN' was not found",
    "details": [],
    "request_id": "demo-request-id"
  }
}
```
