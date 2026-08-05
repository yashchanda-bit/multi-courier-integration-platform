# Architecture and Design Patterns

**Status:** FROZEN  
**Framework:** NestJS with strict TypeScript  
**Frozen on:** 2026-08-05

This document freezes the code architecture and design-pattern decisions for the
assignment. It is a working deliverable and is intentionally separate from the
final 1–2 page `DESIGN.md`, which will later combine architecture, database
design, and evaluated tradeoffs.

## Architectural style

The service uses a pragmatic Ports and Adapters (Hexagonal Architecture) style.
Core workflows depend on domain/application contracts. Courier APIs, PostgreSQL,
HTTP, and BullMQ remain replaceable boundary implementations.

```text
HTTP controllers / BullMQ workers
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

Dependency direction always points inward. Domain code must not import NestJS,
Prisma, Axios, BullMQ, or courier-specific types.

## Module boundaries

```text
src/
  modules/
    orders/
      domain/
      application/
      presentation/
      infrastructure/

    couriers/
      domain/
      application/
      urbanebolt/
      mock/

    batches/
      domain/
      application/
      presentation/
      infrastructure/

  infrastructure/
    database/
    queue/
    logging/

  common/
    config/
    errors/
    request-context/
```

Layering is applied according to behavior rather than by creating empty folders:

- `domain`: entities, value types, repository ports, domain errors, and stable
  business contracts.
- `application`: use cases, orchestration, and adapter selection.
- `presentation`: HTTP controllers and validated public DTOs.
- `infrastructure`: Prisma repositories, external clients, BullMQ producers and
  workers, and other boundary implementations.

Tracking is owned by the orders module because tracking events belong to a
shipment. It is not a separate bounded context for this assignment.

## 1. Adapter pattern

The Adapter pattern is the primary integration pattern. Every courier implements
the stable platform contract:

```ts
interface CourierAdapter {
  readonly code: string;

  createShipment(order: NormalizedOrder): Promise<ShipmentResult>;
  trackShipment(reference: ShipmentReference): Promise<TrackingResult>;
  cancelShipment(reference: ShipmentReference): Promise<CancellationResult>;
}
```

```text
CourierAdapter
   +-- UrbaneBoltAdapter
   +-- MockCourierAdapter
```

An adapter owns its courier's authentication, request mapping, HTTP behavior,
business-error detection, status mapping, and response normalization. No
courier-specific field or error shape may leak into controllers, unified DTOs,
or generic application services.

## 2. Strategy pattern

Courier adapters also act as runtime strategies. The request's
`courier_partner` selects which implementation executes the standard shipment
workflow:

```ts
const adapter = courierRegistry.get(request.courier_partner);
const result = await adapter.createShipment(order);
```

Controllers and services must not use courier-specific `if`, `switch`, or direct
imports. Adding a courier must not modify controllers, routes, unified DTOs,
business services, or existing adapters.

## 3. Registry pattern

`CourierRegistry` belongs to `couriers/application`. It maps stable courier codes
to installed adapter instances, detects duplicate codes at startup, resolves the
requested adapter, and produces the supported-courier list for normalized
validation errors.

```text
urbanebolt -> UrbaneBoltAdapter
mock       -> MockCourierAdapter
```

Database enablement and code installation are both required. A
`courier_partners` row cannot implement an integration by itself.

The registry only resolves adapters. Future commercial routing behavior such as
cheapest-courier selection or fallback routing would use a separate
`CourierSelectionPolicy`; it must not be added to the registry.

## 4. Repository pattern

Application use cases persist data through domain-specific repository ports.
Prisma implementations live inside each feature's infrastructure layer.

```text
orders/domain/order.repository.ts
        ^
orders/infrastructure/prisma-order.repository.ts
```

Repositories expose use-case-oriented operations such as reserving an
idempotent order, creating a pending shipment, appending tracking events, and
claiming batch work. Generic CRUD repositories are prohibited because they hide
Prisma without expressing domain or transaction semantics.

Shared database infrastructure contains only the Prisma client/module and
connection lifecycle. Domain and application code must not import generated
Prisma models.

## 5. Application service/use-case pattern

Workflows are represented by focused application services:

```text
CreateOrderService
TrackOrderService
CancelOrderService
SubmitBatchService
GetBatchService
ProcessBatchItemService
```

Controllers validate and delegate. They contain no courier mapping, persistence,
retry, or business workflow logic. The BullMQ batch worker invokes the same
`CreateOrderService` used by the synchronous endpoint, preventing divergent
create-order implementations.

The batch worker is the explicit orchestrator: it calls the create-order use case
and records the resulting batch-item outcome. The orders module never imports or
calls the batches module.

## 6. Mapper pattern

Each real courier adapter maps both directions:

```text
Normalized domain request
          |
          v
Courier request mapper
          |
          v
External courier API
          |
          v
Courier response mapper
          |
          v
Normalized domain result
```

UrbaneBolt fields such as `consName`, `awbNumber`, `successResponse`, and status
codes such as `MAN` or `CAN` stay within its integration boundary. Mapping may
remain inside a small adapter initially and be extracted into a mapper once it
has meaningful independent behavior.

## 7. Dependency injection

NestJS dependency injection assembles use cases, repository implementations,
the courier registry, and adapters. Core services depend on tokens/interfaces,
not concrete Prisma repositories or courier adapters. Tests can therefore use
in-memory repositories and fake adapters.

Dependency injection is the composition mechanism; the Adapter and Registry
patterns provide courier extensibility.

## HTTP and worker flow

Synchronous creation:

```text
POST /api/v1/orders
        |
        v
OrdersController
        |
        v
CreateOrderService
        |
        +-- reserve idempotent order and pending shipment
        +-- CourierRegistry.get(courier_partner)
        +-- CourierAdapter.createShipment()
        +-- persist attempt, shipment result, and initial tracking event
        v
Normalized response
```

Bulk creation:

```text
BulkOrdersController
        |
        +-- persist batch and items
        +-- enqueue jobs with correlation metadata
        v
BullMQ worker
        |
        +-- rehydrate request context
        +-- call CreateOrderService
        +-- persist per-item result and batch counters
```

## Queue ownership

Global queue infrastructure owns only the BullMQ connection, configuration, and
health behavior. The batches module owns job payload types, producers, workers,
and processing rules. Shared queue code must not know the structure of a bulk
order.

Request and correlation IDs are serialized into each job and rehydrated into a
new async-local request context inside the worker. Async-local state is never
assumed to cross a process or queue boundary automatically.

## Error ownership

`common/errors` contains only stable shared primitives: the base application
error, normalized error response, and common error-code contract. Feature errors
remain feature-owned, for example `IdempotencyConflictError`,
`UnsupportedCourierError`, and `BatchNotFoundError`.

A global NestJS exception filter translates recognized errors into the single
public error shape. Raw courier errors, stack traces, credentials, and tokens are
never exposed to API consumers.

## Explicit exclusions

The following are intentionally not part of the frozen architecture:

- Generic repository abstractions
- Abstract courier base classes
- Courier-specific controller branches
- CQRS framework or command bus
- Domain-event/event-emitter infrastructure
- Transactional outbox
- Dynamic runtime plug-in loading from folders
- Shared domain-kernel abstractions created before demonstrated reuse
- Microservice decomposition

An in-process event emitter is specifically excluded because it cannot reliably
communicate between API and worker processes. Durable domain events would require
an outbox and an actual cross-system delivery requirement, neither of which is
part of this assignment or its frozen database schema.

## Frozen architectural invariants

- Unified controllers and DTOs remain courier-agnostic.
- Business services depend only on stable contracts.
- Each courier is isolated behind `CourierAdapter`.
- Runtime adapter choice uses Strategy plus Registry, never branching in core
  services.
- Prisma stays behind feature-owned repository implementations.
- HTTP and bulk workers reuse the same application use cases.
- Queue job definitions remain feature-owned.
- Tracking remains shipment-owned inside the orders module.
- Feature-specific errors remain within their modules.
- Cross-process correlation metadata is propagated explicitly.
- New couriers do not change routes, DTOs, services, existing adapters, or the
  database schema.
