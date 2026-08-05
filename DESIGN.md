# Multi-Courier Integration Platform — Design

**Status:** Final  
**Stack:** NestJS, strict TypeScript, PostgreSQL, Prisma, Redis, BullMQ

## Goals and constraints

The service exposes one courier-agnostic API for creating, tracking, and
cancelling shipments. Consumers select an installed courier using
`courier_partner`; they never send or receive that courier's native payload.
UrbaneBolt is the first real integration and MockCourier proves extensibility.

Adding a courier may add a new adapter, configuration, and an enabled database
record. It must not change controllers, routes, unified DTOs, application
services, existing adapters, or the database schema.

## Architecture and patterns

The service uses a pragmatic Ports and Adapters (Hexagonal) architecture:

```text
REST controllers / BullMQ workers
                |
                v
        Application use cases
                |
                v
          Domain contracts
             /      \
            v        v
 Courier adapters   Prisma repositories
```

- **Adapter:** each courier implements the stable `CourierAdapter` port for
  create, track, and cancel. Authentication, native payloads, statuses, and
  errors remain inside that adapter.
- **Strategy + Registry:** `courier_partner` selects an adapter at runtime from
  `CourierRegistry`. Core services contain no courier-specific branching.
- **Repository:** application code uses domain-specific persistence ports;
  feature-owned Prisma implementations handle PostgreSQL. Generic CRUD
  repositories are avoided.
- **Mapper:** each adapter translates normalized domain objects to and from its
  external API contract.
- **Application services:** focused create, track, cancel, submit-batch, and
  process-batch-item use cases keep controllers and workers thin.

NestJS was selected for module boundaries, dependency injection, DTO validation,
exception filters, OpenAPI generation, configuration validation, and worker
integration. Its additional structure is justified by multiple external
adapters, persistence, retries, and asynchronous processing.

```text
src/modules/orders     Order, shipment, and tracking use cases
src/modules/couriers   Adapter port, registry, UrbaneBolt and MockCourier
src/modules/batches    Bulk submission, jobs, worker, and batch persistence
src/infrastructure     Shared Prisma, Redis/BullMQ, and logging connections
src/common             Configuration, error contract, and request context
```

## Database design

PostgreSQL provides transactions, foreign keys, concurrency control, and unique
constraints for idempotency. JSONB retains variable courier payloads without
adding courier-specific columns.

```text
courier_partners ----< shipments >---- orders
                           |
                           +----< tracking_events
                           +----< courier_api_attempts

orders ----< batch_items >---- batches
```

| Table | Responsibility |
|---|---|
| `courier_partners` | Installed courier identity and enablement; never secrets |
| `orders` | Consumer `order_id`, canonical request hash, normalized input, and processing result |
| `shipments` | Courier, AWB, courier shipment ID, current status, and final create request/response |
| `tracking_events` | Append-only courier scans with normalized and raw status data |
| `courier_api_attempts` | Every outbound attempt, retry, HTTP result, business result, and sanitized payload |
| `batches` | Aggregate state and counts for an asynchronous bulk request |
| `batch_items` | Per-submitted-order state and success/failure result |

`orders.order_id` is globally unique. A SHA-256 hash of the canonical normalized
request distinguishes a safe replay from reuse of the same ID with different
data. An order can retain historical shipments but has at most one active
shipment. Courier shipment IDs and AWBs are strings and are unique per courier
when present.

Tracking events are append-only and unique by `(shipment_id,
event_fingerprint)`. The fingerprint prevents duplicate events when polling
returns the same scan history. The current normalized status is stored on the
shipment for fast reads, while raw courier codes and payloads preserve audit and
remapping information.

The detailed frozen schema, constraints, and indexes are documented in
[`deliverables/DATABASE_SCHEMA.md`](deliverables/DATABASE_SCHEMA.md).

## Core flows

For shipment creation, the service transactionally reserves the idempotent order
and a `PENDING` shipment before making an external call. It resolves the enabled
adapter, calls the courier, records the API attempt, and updates the shipment to
`CREATED` or `FAILED`. A successful creation also appends its first tracking
event. Track and cancel resolve the adapter from the persisted shipment rather
than trusting a new caller-supplied courier value.

UrbaneBolt returns business failures inside HTTP 200 responses and uses
inconsistent fields such as `awbNumber` and `awb`. Its adapter therefore checks
both transport and body-level outcomes, converts identifiers to strings, maps
raw codes such as `MAN` and `CAN`, and returns only normalized results.

All API errors use one public shape with a stable code, safe message, optional
field details, and `request_id`. Courier 4xx responses become normalized
application errors. Timeouts, network errors, 429s, and eligible 5xx responses
use configurable exponential backoff with jitter. Authentication failure
invalidates the cached token, re-authenticates, and retries the original call
once. Raw courier errors and secrets are never returned to consumers.

## Bulk processing

`POST /api/v1/orders/bulk` accepts 1–100 independently validated orders, persists
a batch and its items, and returns `202 Accepted` with a `batch_id`. BullMQ jobs
process items concurrently with configurable global and per-courier limits.
`GET /api/v1/batches/{batch_id}` returns aggregate counts and each item's
success/failure result.

Workers use `batch_item.id` as the deterministic queue job ID and call the same
create-order use case as the synchronous endpoint. PostgreSQL uniqueness makes
at-least-once job delivery safe. Request and correlation IDs are included in the
job payload and restored in the worker logging context.

PostgreSQL is the source of truth: a recovery task re-enqueues stale `PENDING`
items if the process fails after committing the batch but before publishing its
jobs. This provides recoverability without introducing a transactional outbox
for the assignment.

## Consistency, security, and tradeoffs

PostgreSQL and a courier API cannot share a transaction. A courier may create a
shipment immediately before the application loses the response. The platform
mitigates this by persisting first, sending the stable `order_id` as courier
reference, recording every attempt, retrying create calls only when safe, and
leaving ambiguous results available for reconciliation. Internal idempotency
cannot by itself promise exactly-once behavior in an external courier system.

The normalized DTO gives consumers a stable contract but cannot expose every
provider-specific feature. Raw statuses and JSONB payloads are retained so no
diagnostic information is lost. Storing both the final create snapshot and
individual attempts intentionally duplicates some data in exchange for direct
auditability and obvious assignment compliance.

Asynchronous bulk processing keeps HTTP responsive and supports partial success,
at the cost of eventual consistency and a Redis dependency. Explicit adapter
registration is type-safe and testable, but adding a real courier still requires
implementation, secrets, and deployment; a database row alone is not an
integration.

Credentials, tokens, cookies, and authorization headers are removed before
logging or persistence. Customer data in JSONB requires production access
control, encryption where appropriate, and a defined retention policy. Structured
logs include `order_id`, courier, request/correlation ID, error type, and stack
trace where appropriate.

Domain events, CQRS, dynamic code loading, microservices, and a transactional
outbox are intentionally excluded because the current workflows do not justify
their operational cost. The design keeps these boundaries replaceable without
pretending that additional infrastructure is free.
