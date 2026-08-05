# Multi-Courier Integration Platform

A backend service that gives e-commerce applications one API for working with
different courier partners. UrbaneBolt is the first real integration, and a mock
courier will demonstrate that new partners can be added without changing the
public API.

## Current status

The NestJS foundation, PostgreSQL schema, normalized contracts, global error
handling, courier registry, and MockCourier adapter are ready. Order persistence,
the UrbaneBolt adapter, and background bulk processing are being implemented
incrementally.

## Planned API

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

## Quality checks

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
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

Configuration will come from environment variables. A future `.env.example`
will document required values such as database URL, Redis URL, courier base URL,
timeouts, retries, and credential names.

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
- Ambiguous courier timeouts are retained for reconciliation rather than blindly
  retried.
