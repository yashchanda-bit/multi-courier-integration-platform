# Multi-Courier Integration Platform

A backend service that gives e-commerce applications one API for working with
different courier partners. UrbaneBolt is the first real integration, and a mock
courier demonstrates that new partners can be added without changing the public
API.

## Current status

The NestJS foundation, PostgreSQL persistence, normalized contracts, global
error handling, idempotent order creation, MockCourier, and the UrbaneBolt
adapter are ready. Synchronous create, tracking, and idempotent cancellation
routes are implemented with database audit history. Bulk requests accept up to
100 orders, return immediately, and are processed concurrently through BullMQ
with per-order results.

## API

```http
POST /api/v1/orders
GET  /api/v1/orders/{order_id}/track
POST /api/v1/orders/{order_id}/cancel
POST /api/v1/orders/bulk
GET  /api/v1/batches/{batch_id}
```

Consumers send a normalized order and choose a courier using
`courier_partner`. They do not need to understand the courier's native request or
response format.

Runnable, credential-free requests for every endpoint are in
[docs/api-examples.md](docs/api-examples.md).

## Technology

- Node.js 22 and strict TypeScript
- NestJS
- PostgreSQL with Prisma
- Redis and BullMQ for background bulk processing
- Jest and Supertest
- Docker Compose for local dependencies
- GitHub Actions for continuous integration

## Design choices

The application uses a simple Ports and Adapters structure:

```text
Controller or worker
        ↓
Application service
        ↓
Stable domain contracts
       ↙         ↘
Courier adapter  Database repository
```

Each courier implements the same adapter contract. A registry selects the
adapter requested by `courier_partner`. Controllers, routes, normalized DTOs,
and order services contain no courier-specific branching.

PostgreSQL stores normalized order and shipment state. Courier-specific request
and response payloads are retained as sanitized JSON for audit and debugging.
BullMQ processes bulk orders asynchronously so the HTTP request remains
responsive and each item can succeed or fail independently.

Bulk creation accepts `{ "orders": [...] }` and returns HTTP `202` with a
`batch_id` and `status_url`. Polling that URL returns aggregate counts plus the
success or normalized failure for every submitted order.

The database has seven tables. An order has one or more shipments; shipments
belong to courier partners and own append-only tracking events and API-attempt
audits. Batches own batch items, and a successful item links back to its order.
Courier-specific payloads stay at the shipment/audit boundary, while public
DTOs remain courier-independent.

The main trade-off is eventual consistency for bulk requests: PostgreSQL stores
batch state and Redis stores durable job payloads. The API stays responsive and
supports partial success, but Redis must be available to accept new batches. If
enqueueing fails, the persisted batch and all its items are marked failed.

## Local setup

Prerequisites:

- Node.js 22
- npm 10 or later
- Docker Desktop with Docker Compose

Install dependencies:

```bash
npm ci
cp .env.example .env
docker compose up -d
npm run db:migrate:deploy
npm run db:generate
npm run db:seed
```

Run in development mode:

```bash
npm run start:dev
```

PostgreSQL listens on port `5432` and Redis on `6379` by default. Override the
development ports and credentials in `.env` when necessary.

## Environment variables

| Variable                                              | Purpose                           | Local default                                |
| ----------------------------------------------------- | --------------------------------- | -------------------------------------------- |
| `NODE_ENV` / `PORT`                                   | Runtime mode and HTTP port        | `development` / `3000`                       |
| `DATABASE_URL`                                        | PostgreSQL connection             | Local Compose database                       |
| `REDIS_URL`                                           | BullMQ Redis connection           | `redis://localhost:6379`                     |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Local Compose database            | `courier_platform` / `postgres` / `postgres` |
| `POSTGRES_PORT` / `REDIS_PORT`                        | Local published ports             | `5432` / `6379`                              |
| `ENABLE_MOCK_COURIER`                                 | Enables MockCourier during seed   | `true`                                       |
| `BULK_QUEUE_NAME`                                     | Redis queue name                  | `bulk-orders`                                |
| `BULK_WORKER_ENABLED`                                 | Runs workers in this process      | `true`                                       |
| `BULK_WORKER_CONCURRENCY`                             | Concurrent bulk items per process | `10`                                         |
| `BULK_JOB_RETENTION_SECONDS`                          | Completed-job retention           | `86400`                                      |
| `URBANEBOLT_BASE_URL`                                 | UrbaneBolt API origin             | UAT origin                                   |
| `URBANEBOLT_USERNAME` / `URBANEBOLT_PASSWORD`         | Courier credentials               | Empty                                        |
| `URBANEBOLT_CUSTOMER_CODE`                            | Manifest customer identifier      | Empty                                        |
| `URBANEBOLT_TIMEOUT_MS`                               | Per-request timeout               | `5000`                                       |
| `URBANEBOLT_RETRY_MAX_ATTEMPTS`                       | Bounded transient attempts        | `3`                                          |
| `URBANEBOLT_RETRY_BASE_DELAY_MS`                      | Backoff base delay                | `250`                                        |

`.env.example` is the authoritative template. Use a managed secret store outside
local development.

## Quality checks

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run test:integration
npm run build
npm audit --omit=dev
```

The same checks run automatically in GitHub Actions. Automated tests will mock
courier APIs and will not create UrbaneBolt UAT shipments.

## Adding a courier

To add a courier such as Delhivery:

1. Implement the shared `CourierAdapter` contract.
2. Map normalized requests to that courier's API payload.
3. Map courier responses, statuses, and errors back to normalized results.
4. Register the adapter with the courier registry.
5. Add validated environment configuration and secrets.
6. Enable the courier in the `courier_partners` data.
7. Add adapter contract and HTTP-client tests.

Adding a courier must not change existing controllers, routes, public DTOs,
business services, courier implementations, or the database schema.

## Configuration and secrets

All runtime configuration comes from validated environment variables documented
in `.env.example`; credentials and tokens are never hardcoded.

To enable UrbaneBolt, provide its username, password, customer code, base URL,
timeout, and retry settings from `.env.example`, then enable `urbanebolt` in the
`courier_partners` table. Tokens are cached in memory, refreshed automatically
after an authentication rejection, and never persisted or included in audit
payloads.

Never commit:

- `.env` files
- API credentials or bearer tokens
- Credential-bearing Postman collections
- Live customer data

## Assumptions

- `order_id` is the idempotency key.
- A request selects one courier; it does not create shipments with every courier.
- An order has at most one active shipment.
- Courier identifiers and AWBs are stored as strings.
- Bulk creation accepts at most 100 orders and returns a batch ID.
- Business failures may be returned by a courier with HTTP 200, so adapters must
  inspect the response body.
- UrbaneBolt manifest retries rely on its stable `orderNumber`; exhausted or
  ambiguous failures are persisted for reconciliation.
