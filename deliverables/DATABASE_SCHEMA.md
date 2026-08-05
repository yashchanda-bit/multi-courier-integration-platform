# Database Schema

**Status:** FROZEN  
**Database:** PostgreSQL  
**Frozen on:** 2026-08-05

This is the definitive schema for the assignment. Application code and API
contracts must conform to it. A change requires an explicit design review rather
than an incidental implementation edit.

## Final relationship model

```text
courier_partners
        |
        +----< shipments >---- orders
        |          |              |
        |          +----< tracking_events
        |          +----< courier_api_attempts
        |                         |
        +-------------------------+

orders ----< batch_items >---- batches
```

The schema contains seven tables:

1. `courier_partners`
2. `orders`
3. `shipments`
4. `tracking_events`
5. `courier_api_attempts`
6. `batches`
7. `batch_items`

## 1. `courier_partners`

Identifies installed courier plug-ins and controls operational availability.
Credentials, tokens, base URLs, timeouts, and retry settings are not stored in
the database.

| Column | PostgreSQL type | Constraints |
|---|---|---|
| `id` | `UUID` | Primary key |
| `code` | `VARCHAR(50)` | Unique, not null |
| `display_name` | `VARCHAR(100)` | Not null |
| `is_enabled` | `BOOLEAN` | Not null, default `TRUE` |
| `created_at` | `TIMESTAMPTZ` | Not null, default current time |
| `updated_at` | `TIMESTAMPTZ` | Not null, default current time |

Examples of `code` are `urbanebolt` and `mock`. Adding a courier adds an adapter,
configuration, and a row; it does not change this schema.

## 2. `orders`

Represents the consumer's idempotent commercial request. Courier execution data
belongs to `shipments`.

| Column | PostgreSQL type | Constraints |
|---|---|---|
| `id` | `UUID` | Primary key |
| `order_id` | `VARCHAR(100)` | Unique, not null |
| `request_hash` | `CHAR(64)` | Not null |
| `normalized_request` | `JSONB` | Not null |
| `status` | `VARCHAR(40)` | Not null |
| `failure_code` | `VARCHAR(100)` | Nullable |
| `failure_message` | `TEXT` | Nullable |
| `created_at` | `TIMESTAMPTZ` | Not null, default current time |
| `updated_at` | `TIMESTAMPTZ` | Not null, default current time |

Allowed order statuses:

```text
PENDING
PROCESSING
SHIPMENT_CREATED
FAILED
```

Idempotency rule:

- Same `order_id` and same `request_hash`: return the existing result.
- Same `order_id` and different `request_hash`: return an idempotency conflict.

The hash is SHA-256 over a canonical representation of the complete normalized
request, including the selected courier partner.

## 3. `shipments`

Represents a courier's execution of an order. It owns courier identity, AWB,
current delivery status, and the final create-shipment audit snapshot.

| Column | PostgreSQL type | Constraints |
|---|---|---|
| `id` | `UUID` | Primary key |
| `order_id` | `UUID` | FK, not null |
| `courier_partner_id` | `UUID` | FK, not null |
| `shipment_sequence` | `SMALLINT` | Not null, greater than zero |
| `is_active` | `BOOLEAN` | Not null, default `TRUE` |
| `courier_shipment_id` | `VARCHAR(150)` | Nullable |
| `awb_number` | `VARCHAR(150)` | Nullable |
| `status` | `VARCHAR(40)` | Not null |
| `courier_status_code` | `VARCHAR(50)` | Nullable |
| `courier_request_payload` | `JSONB` | Nullable |
| `courier_response_payload` | `JSONB` | Nullable |
| `failure_code` | `VARCHAR(100)` | Nullable |
| `failure_message` | `TEXT` | Nullable |
| `created_at` | `TIMESTAMPTZ` | Not null, default current time |
| `updated_at` | `TIMESTAMPTZ` | Not null, default current time |

Foreign keys:

```text
shipments.order_id -> orders.id ON DELETE RESTRICT
shipments.courier_partner_id -> courier_partners.id ON DELETE RESTRICT
```

Constraints:

```text
UNIQUE (order_id, shipment_sequence)
UNIQUE (order_id) WHERE is_active = TRUE
UNIQUE (courier_partner_id, courier_shipment_id)
  WHERE courier_shipment_id IS NOT NULL
UNIQUE (courier_partner_id, awb_number)
  WHERE awb_number IS NOT NULL
CHECK (shipment_sequence > 0)
```

Allowed shipment statuses:

```text
PENDING
CREATED
PICKED_UP
IN_TRANSIT
OUT_FOR_DELIVERY
DELIVERED
CANCELLED
RETURN_TO_ORIGIN
FAILED
```

AWBs and courier shipment IDs are stored as strings because courier APIs can
return identifiers using inconsistent JSON types. The assignment normally uses
one shipment per order. Sequence and active-state constraints preserve history
without allowing two current shipments for one order.

The final create request and response are stored here to make assignment
compliance explicit. Every individual retry remains available in
`courier_api_attempts`.

## 4. `tracking_events`

Stores append-only tracking history for one shipment. Normal application flows
must never update or delete existing events.

| Column | PostgreSQL type | Constraints |
|---|---|---|
| `id` | `UUID` | Primary key |
| `shipment_id` | `UUID` | FK, not null |
| `normalized_status` | `VARCHAR(40)` | Not null |
| `courier_status_code` | `VARCHAR(50)` | Not null |
| `courier_status_description` | `VARCHAR(255)` | Nullable |
| `courier_reason_code` | `VARCHAR(50)` | Nullable |
| `courier_reason_description` | `VARCHAR(255)` | Nullable |
| `location` | `VARCHAR(255)` | Nullable |
| `courier_event_time` | `TIMESTAMPTZ` | Nullable |
| `event_fingerprint` | `CHAR(64)` | Not null |
| `raw_payload` | `JSONB` | Not null |
| `recorded_at` | `TIMESTAMPTZ` | Not null, default current time |

Foreign key and constraint:

```text
tracking_events.shipment_id -> shipments.id ON DELETE RESTRICT
UNIQUE (shipment_id, event_fingerprint)
```

The fingerprint is SHA-256 over stable event attributes such as courier status,
event time, reason, and location. It prevents duplicate rows when polling returns
the same scans repeatedly. `raw_payload` contains the individual raw scan; the
complete tracking response is stored in its API-attempt row.

## 5. `courier_api_attempts`

Audits every outbound courier attempt, including transient failures and retries.
A `PENDING` shipment is persisted before calling create-shipment, allowing the
create attempt to reference a shipment even if the external call fails.

| Column | PostgreSQL type | Constraints |
|---|---|---|
| `id` | `UUID` | Primary key |
| `shipment_id` | `UUID` | FK, nullable |
| `courier_partner_id` | `UUID` | FK, not null |
| `operation` | `VARCHAR(40)` | Not null |
| `attempt_number` | `SMALLINT` | Not null, greater than zero |
| `request_id` | `VARCHAR(100)` | Not null |
| `request_payload` | `JSONB` | Nullable |
| `response_payload` | `JSONB` | Nullable |
| `http_status` | `SMALLINT` | Nullable |
| `business_status` | `VARCHAR(20)` | Not null |
| `error_code` | `VARCHAR(100)` | Nullable |
| `error_message` | `TEXT` | Nullable |
| `duration_ms` | `INTEGER` | Nullable, zero or greater |
| `created_at` | `TIMESTAMPTZ` | Not null, default current time |

Foreign keys:

```text
courier_api_attempts.shipment_id -> shipments.id ON DELETE RESTRICT
courier_api_attempts.courier_partner_id -> courier_partners.id ON DELETE RESTRICT
```

Constraints:

```text
UNIQUE (courier_partner_id, operation, request_id, attempt_number)
CHECK (attempt_number > 0)
CHECK (duration_ms IS NULL OR duration_ms >= 0)
```

Allowed operations initially:

```text
AUTHENTICATE
CREATE_SHIPMENT
TRACK_SHIPMENT
CANCEL_SHIPMENT
```

Allowed business statuses:

```text
SUCCESS
FAILED
```

Authentication attempts have no shipment, so `shipment_id` is nullable. Their
payload fields must not contain credentials or tokens. `http_status` is nullable
for network failures and mock calls. HTTP and business status remain separate
because UrbaneBolt can report failures inside HTTP 200 responses.

## 6. `batches`

Represents one asynchronous bulk-create submission.

| Column | PostgreSQL type | Constraints |
|---|---|---|
| `id` | `UUID` | Primary key and public `batch_id` |
| `status` | `VARCHAR(40)` | Not null |
| `total_count` | `SMALLINT` | Not null, between 1 and 100 |
| `success_count` | `SMALLINT` | Not null, default `0` |
| `failure_count` | `SMALLINT` | Not null, default `0` |
| `created_at` | `TIMESTAMPTZ` | Not null, default current time |
| `started_at` | `TIMESTAMPTZ` | Nullable |
| `completed_at` | `TIMESTAMPTZ` | Nullable |

Allowed statuses:

```text
PENDING
PROCESSING
COMPLETED
PARTIALLY_COMPLETED
FAILED
```

Constraints:

```text
CHECK (total_count BETWEEN 1 AND 100)
CHECK (success_count >= 0)
CHECK (failure_count >= 0)
CHECK (success_count + failure_count <= total_count)
```

## 7. `batch_items`

Stores the outcome of every order submitted in a batch.

| Column | PostgreSQL type | Constraints |
|---|---|---|
| `id` | `UUID` | Primary key |
| `batch_id` | `UUID` | FK, not null |
| `order_id` | `UUID` | FK, nullable |
| `submitted_order_id` | `VARCHAR(100)` | Not null |
| `submitted_courier_partner` | `VARCHAR(50)` | Not null |
| `position` | `SMALLINT` | Not null, zero or greater |
| `status` | `VARCHAR(20)` | Not null |
| `error_code` | `VARCHAR(100)` | Nullable |
| `error_message` | `TEXT` | Nullable |
| `created_at` | `TIMESTAMPTZ` | Not null, default current time |
| `updated_at` | `TIMESTAMPTZ` | Not null, default current time |

Foreign keys:

```text
batch_items.batch_id -> batches.id ON DELETE RESTRICT
batch_items.order_id -> orders.id ON DELETE RESTRICT
```

Constraints:

```text
UNIQUE (batch_id, position)
UNIQUE (batch_id, submitted_order_id)
CHECK (position >= 0)
```

Allowed statuses:

```text
PENDING
PROCESSING
SUCCEEDED
FAILED
```

`order_id` is nullable because validation or an unknown courier can fail before
an order is created. The submitted courier remains a string so an invalid value
can still be recorded in the batch result.

## Final indexes

Primary keys and unique constraints create their own indexes. Add:

```text
orders (status, created_at)
shipments (order_id, is_active)
shipments (courier_partner_id, status)
shipments (updated_at)
tracking_events (shipment_id, courier_event_time DESC)
courier_api_attempts (shipment_id, created_at DESC)
courier_api_attempts (request_id)
batches (status, created_at)
batch_items (batch_id, status)
```

## Frozen invariants

- `order_id` is globally unique and is the idempotency key.
- An order may retain multiple historical shipments but has at most one active
  shipment.
- Courier and shipment identifiers are strings at the persistence boundary.
- New couriers and MockCourier require no schema change.
- Courier-specific payloads remain in JSONB instead of courier-specific columns.
- Tracking events are append-only and deduplicated.
- Every courier call and retry has a separate audit attempt.
- The final create request/response is also snapshotted on its shipment.
- Bulk idempotency is provided by each submitted `order_id`.
- No credentials, tokens, cookies, or authorization headers are persisted.
- Audit relationships use restricted deletion.

## Sensitive-data policy

All JSON payloads must be sanitized before persistence. Credentials, access
tokens, authorization headers, cookies, and API keys are always removed. Customer
addresses, email addresses, and phone numbers are personal data; production must
apply appropriate encryption, access control, and retention policies.
