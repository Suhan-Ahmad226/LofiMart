# Courier Flow Architecture

This project should handle courier operations in two layers:

## Multi-Vendor Shipment Model

This platform is now shipment-aware for multi-vendor commerce.

Important rule:

- one `Order` can contain many `OrderShipment` records
- each shipment belongs to one seller
- each shipment can optionally point to one warehouse / pickup location
- courier booking should happen per shipment, not per order

Current shipment split logic:

- checkout creates one order
- order items are grouped by `sellerId + warehouseId`
- each group becomes a separate shipment
- seller courier operations now work on those shipment records

Customer-facing result:

- one customer order can show multiple shipment cards
- each shipment can have a different pickup location, courier, and tracking ID

## Phase 1: Operationally Safe Manual Courier Flow

Use this flow immediately for production without courier API dependency:

1. Customer places an order.
2. Seller/Admin confirms the order.
3. Seller prepares the parcel and marks the order `packed`.
4. Seller marks the parcel `ready_for_pickup`.
5. Seller chooses a courier partner and requests pickup.
6. Order status becomes `pickup_requested`.
7. After handover, seller marks it `picked_up`.
8. Order moves to `in_transit`.
9. Final-mile state becomes `out_for_delivery`.
10. Completed delivery becomes `delivered`.
11. Exceptions use `delivery_failed`, `returned`, or `cancelled`.

## Recommended Status Pipeline

- `pending`
- `processing`
- `packed`
- `ready_for_pickup`
- `pickup_requested`
- `picked_up`
- `in_transit`
- `out_for_delivery`
- `delivered`
- `delivery_failed`
- `returned`
- `cancelled`

## Role Responsibilities

### Customer
- submits address and phone during checkout
- receives order confirmation
- tracks delivery progress from the tracking page
- sees exception states if delivery fails or returns

### Seller
- prepares and packs the parcel
- selects a courier partner
- requests pickup
- updates shipment milestones until delivery

### Admin
- monitors overall shipment health
- resolves failed deliveries and returns
- audits courier performance and SLA issues

### Reseller
- sees order-origin impact where needed
- normally does not operate the courier flow

## Current Codebase Fit

The current `Order.status` field is already flexible enough to support the full status pipeline above.
That means the flow can be rolled out without a schema migration for the status model itself.

Current courier-related UI paths:

- Seller courier workspace: `/seller/courier`
- Customer tracking page: `/track`
- Order status update API: `PATCH /api/orders/:id/status`
- Customer tracking API: `GET /api/orders/track/:id`

## Immediate Production Recommendation

Use manual courier operations first:

- seller updates live shipment status from the seller courier page
- customer sees real milestone progression on the tracking page
- tracking IDs can remain manual until a real courier API is connected

## Phase 2: Courier API Integration

Recommended partners for Bangladesh:

- Pathao Courier
- RedX
- Steadfast
- eCourier
- Paperfly

Environment placeholders already prepared for first-party adapter work:

- `PATHAO_CLIENT_ID`
- `PATHAO_CLIENT_SECRET`
- `PATHAO_BASE_URL`
- `PATHAO_BOOKING_ENDPOINT`
- `REDX_API_KEY`
- `REDX_SECRET_KEY`
- `REDX_BASE_URL`
- `REDX_BOOKING_ENDPOINT`

Current provider registry reports readiness honestly:

- `manual_ready`: manual workflow is active
- `missing_config`: API credentials are not configured yet
- `api_ready`: credentials are present and the provider is ready for direct adapter implementation

Pathao now supports a direct API booking adapter when these values are configured:

- `PATHAO_CLIENT_ID`
- `PATHAO_CLIENT_SECRET`
- `PATHAO_BASE_URL`
- `PATHAO_USERNAME`
- `PATHAO_PASSWORD`
- optional `PATHAO_BOOKING_ENDPOINT`

When enabled:

- OAuth token is issued and refreshed automatically with Redis-backed persistence
- seller pickup requests call the Pathao merchant order API directly
- warehouse pickup locations can store Pathao `store_id`, `city_id`, `zone_id`, and `area_id`
- if a warehouse has Pathao city/zone/area configured but no store yet, the adapter can create the Pathao store and persist the returned `store_id`
- courier-generated tracking IDs are stored on the shipment/order
- raw provider response is preserved inside `shipmentMetadata`
- customer shipment notifications continue through the same shipment workflow
- Pathao merchant helper endpoints are available for:
  - city list
  - zone list
  - area list
  - store list
  - store creation
  - order short info
  - delivery price calculation

RedX now supports a direct API booking adapter when these values are configured:

- `REDX_API_KEY`
- `REDX_SECRET_KEY`
- `REDX_BASE_URL`
- `REDX_BOOKING_ENDPOINT`

When enabled:

- seller pickup requests call the RedX HTTP booking adapter
- courier-generated tracking IDs are stored on the order
- raw provider response is preserved inside `shipmentMetadata`
- customer shipment notifications still fire from the same order workflow

Steadfast is currently supported through the manual production workflow:

- direct API booking is available when `STEADFAST_API_KEY`, `STEADFAST_SECRET_KEY`, and `STEADFAST_BASE_URL` are configured
- seller can still use the production-safe manual merchant workflow if API mode is not enabled yet
- shipment-level booking, tracking ID persistence, and customer/admin tracking all work
- seller or admin can sync shipment milestones from the internal courier flow
- webhook-based delivery status refresh is supported through `POST /api/logistics/webhooks/steadfast`

See also:

- `docs/STEADFAST_FLOW.md`

Webhook ingestion endpoints are now available for courier tracking sync:

- `POST /api/logistics/webhooks/pathao`
- `POST /api/logistics/webhooks/redx`

Optional protection:

- query param: `?token=...`
- or header: `x-courier-webhook-token`

Environment tokens:

- `PATHAO_WEBHOOK_TOKEN`
- `REDX_WEBHOOK_TOKEN`

Pathao webhook specifics:

- `X-PATHAO-Signature` is accepted as the verification signature header
- webhook integration challenge responds with:
  - status `202`
  - header `X-Pathao-Merchant-Webhook-Integration-Secret`
- Pathao event names such as `order.created`, `pickup.requested`, `assigned_for_delivery`, `delivered`, and `returned_to_merchant` are normalized into internal shipment statuses

Webhook processing currently:

- finds the shipment by `trackingId`
- stores the raw courier payload in `shipmentMetadata`
- updates recognized shipment statuses
- pushes a customer shipment notification when a status is normalized

When API integration is added, extend the flow with:

- courier booking API adapters
- courier-generated tracking IDs
- pickup booking response storage
- webhook-driven shipment status sync
- delivery charge calculation per zone/city
- COD reconciliation

## Recommended Future Data Fields

For deeper courier integration, add dedicated shipment data such as:

- `courierProvider`
- `trackingId`
- `pickupRequestedAt`
- `pickedUpAt`
- `outForDeliveryAt`
- `deliveredAt`
- `deliveryFailureReason`
- `shipmentMetadata`

These can live in the `Order` model or a separate `Shipment` model if courier operations grow larger.




