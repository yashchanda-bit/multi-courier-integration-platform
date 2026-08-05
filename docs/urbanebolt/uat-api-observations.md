# UrbaneBolt UAT API observations

Captured on 2026-08-05 from controlled calls to the UrbaneBolt UAT environment.
This document contains sanitized response contracts only. Credentials, bearer
tokens, personal data, cookies, and signed label URLs are intentionally omitted.

## Test scope and resulting UAT data

- All 12 endpoints in the supplied Postman collection were called.
- One isolated shipment was created and moved from `MAN` to `RTL` while testing
  the NDR/RTO operation.
- A second isolated shipment was created and successfully cancelled, producing
  the `MAN` to `CAN` tracking sequence.
- No unrelated shipment was modified.
- The documented global manifest endpoint returned HTTP 404 and created nothing.

## Cross-cutting behavior

- Authentication uses a bearer token with a reported lifetime of 86,400 seconds.
- Authentication works without the cookie copied into the Postman collection.
- Business success and failure are commonly returned with HTTP 200. Clients must
  inspect the response body rather than relying only on HTTP status.
- Response naming is inconsistent: `awbNumber`/`awb`,
  `orderNumber`/`order_number`, and `errorResponse`/`failedResponse`/
  `failureResponse`/`errData`.
- AWBs are numbers in some responses and strings in others. Normalize them as
  strings at the adapter boundary.
- Manifest creation accepts a list, including when creating one shipment.
- Several operations return separate success and failure arrays, allowing
  partial success.
- Tracking returns current shipment state and historical scan events.
- The Postman collection has no saved response examples.

## Endpoint inventory

| Operation | Method and path | Observed result |
|---|---|---|
| Authenticate | `POST /api/v1/auth/getToken/` | HTTP 200, success |
| Pincode lookup | `GET /api/v1/location/pincodes/?pincodes=...` | HTTP 200, success |
| Bulk pincodes | `GET /api/v1/location/pincodes/?type=ex` | HTTP 200, success |
| Manifest | `POST /api/v1/services/manifest/` | HTTP 200, shipment created |
| Print label data | `GET /api/v1/services/label/?awbs=...` | HTTP 200, success |
| Tracking | `GET /api/v1/services/tracking-pub/?awb=...` | HTTP 200, success |
| Cancellation | `POST /api/v1/services/cancel/` | HTTP 200, success and failure cases |
| NDR/RTO | `POST /api/v1/services/ndr/?type=rtoLock` | HTTP 200, success |
| Payment-mode change | `POST /api/v1/services/update-paymode/` | HTTP 200, state-dependent failure |
| ePOD | `GET /api/v1/services/epod/?awbs=...` | HTTP 200, no ePOD for new shipment |
| NDR reattempt | `POST /api/v1/services/ndr/?type=reAttempt` | HTTP 200, state-dependent failure |
| Global manifest | `POST /api/v1/services/global-manifest/` | HTTP 404 |

## Authentication

Request content type is `application/json`. The response includes:

- `access_token`: bearer token
- `expires_in`: `86400`
- `token_type`: `Bearer`
- `expires`: ISO-like expiry timestamp
- `status`: `Success`

The access token must never be logged or persisted in audit payloads.

## Pincode lookup

Both lookup variants return `status`, `message`, `data`, and `errorPincodes`.
Each `data` entry contains:

- `id`, `pincode`
- `inbound`, `outbound`, `rtn`, `isActive`
- `serviceCenter`, `city`, `state`, `region`, `zone`, `routeCode`
- `serviceType`, represented as a comma-separated string

## Manifest/create shipment

The request body must be a JSON list of shipment objects. Passing a single
object returns HTTP 200 with `status: Failed` and the message
`Payload must be a list of shipments!`.

The success response contains `status`, `successResponse`, and `errorResponse`.
Each successful item contains:

- `status`
- `orderNumber`
- `awbNumber`
- `routeCode`
- `shippingLabel`
- `customerCode`

The successful UAT request generated an AWB immediately.

## Print label

Despite its name, this endpoint returned structured label data rather than a PDF.
It includes shipment dimensions, payment data, consignee details, return details,
route information, item information, and logo URL. Its top-level arrays are
`data` and `errData`.

## Tracking

The `data` object contains shipment identity, invoice details, origin,
destination, current location, expected delivery date, current status and reason,
product/payment type, POD/OTP fields, coordinates, and `scans`.

Each scan includes:

- `statusDateTime`
- `statusCode`, `statusCodeDescription`
- `reasonCode`, `reasonCodeDescription`
- `currentLocation`

Observed status codes:

| Courier code | Description | Observed transition |
|---|---|---|
| `MAN` | Shipment Manifested | Initial create state |
| `RTL` | RTO Lock | After successful NDR/RTO request |
| `CAN` | Cancelled | After successful cancellation |

## Cancellation

Request body accepts `awbs`. The response contains `successResponse` and
`failureResponse`. A newly manifested shipment was cancelled successfully.
Cancellation after RTO lock failed with `Cancellation is not allowed on this
stage!`, still under HTTP 200.

## NDR/RTO and reattempt

The RTO operation succeeded for a manifested test shipment and changed tracking
status to `RTL`.

The documented reattempt object shape was rejected. The API validation message
requires a list of objects. A list was accepted structurally, after which the
operation returned a state-dependent failure in `failedResponse`.

## Payment-mode change

The operation returned top-level `status: Success` while placing the item-level
failure in `failedResponse`. This confirms that the top-level status alone is not
sufficient to determine per-shipment success.

## ePOD

A newly created, undelivered AWB returned an item-level failure indicating that
the requested AWB/ePOD was not found. A successful ePOD payload cannot be
observed until a suitable delivered UAT shipment is available.

## Global manifest

The documented UAT URL returned HTTP 404 with no useful JSON body. Treat this
endpoint as unavailable or outdated until UrbaneBolt confirms its current URL.

## Known documentation discrepancies

- Manifest's list requirement is easy to miss.
- NDR reattempt documentation shows an object while the server requires a list.
- Print Label authorization formatting differs in the exported collection, but a
  fresh bearer token worked.
- The copied cookies are unnecessary for tested server-to-server calls.
- `Cancellation Proccess` and other response messages contain spelling errors;
  never use human-readable messages as programmatic identifiers.

