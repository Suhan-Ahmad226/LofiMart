# Steadfast Courier Flow

Steadfast now supports both:

- direct API booking and status sync
- production-safe manual merchant workflow fallback

## Environment Setup

Required for direct API mode:

- `STEADFAST_API_KEY`
- `STEADFAST_SECRET_KEY`
- `STEADFAST_BASE_URL`

Recommended for hardened inbound sync:

- `STEADFAST_WEBHOOK_TOKEN`

Default base URL:

- `https://portal.packzy.com/api/v1`

## What Works Today

- seller can choose `Steadfast` from `/seller/courier`
- shipment-level courier selection works for split multi-vendor orders
- direct shipment booking can call `POST /create_order`
- tracking code is saved on the shipment
- consignment ID and invoice are preserved in shipment metadata
- seller can manually trigger shipment sync from the courier queue
- webhook updates can refresh shipment state
- customer tracking pages and order details show the Steadfast shipment state
- admin orders, logistics diagnostics, and seller courier history include Steadfast shipments

## Shipment Booking Mapping

Internal shipment data is mapped to Steadfast order payload fields such as:

- `invoice`
- `recipient_name`
- `recipient_phone`
- `alternative_phone`
- `recipient_address`
- `cod_amount`
- `note`
- `item_description`
- `total_lot`
- `delivery_type`

Current default behavior:

- `delivery_type=0`
- home delivery flow is used unless you later extend the app with Steadfast hub-pickup rules

## Status Sync

Current sync sources:

- manual seller sync action
- webhook delivery status payload

Important internal mappings:

- `in_review` -> `pickup_requested`
- `pending` -> `pickup_requested`
- `delivered` -> `delivered`
- `partial_delivered` -> `delivered`
- `cancelled` -> `cancelled`
- `hold` -> `delivery_failed`

## Available Internal Endpoints

- `POST /api/logistics/steadfast/shipments/:shipmentId/sync`
- `GET /api/logistics/steadfast/balance`
- `POST /api/logistics/steadfast/orders/bulk`
- `POST /api/logistics/steadfast/returns`
- `GET /api/logistics/steadfast/returns`
- `GET /api/logistics/steadfast/returns/:id`
- `GET /api/logistics/steadfast/payments`
- `GET /api/logistics/steadfast/payments/:paymentId`
- `GET /api/logistics/steadfast/police-stations`

## Webhook Notes

Webhook endpoint:

- `POST /api/logistics/webhooks/steadfast`

Supported auth checks:

- `Authorization: Bearer <STEADFAST_WEBHOOK_TOKEN>`
- fallback: `Authorization: Bearer <STEADFAST_API_KEY>` if no dedicated webhook token is configured
- query `?token=...`
- header `x-courier-webhook-token`

The webhook can match shipments by:

- tracking code
- consignment ID stored in shipment metadata
- invoice stored in shipment metadata

## Manual Fallback Workflow

If direct API config is not ready yet:

1. Seller prepares the shipment from the correct pickup location.
2. Seller selects `Steadfast` in the courier workspace.
3. Seller books the parcel from the Steadfast merchant panel or merchant app.
4. Seller saves the returned tracking ID inside the platform shipment.
5. Seller or admin mirrors milestone updates into the internal shipment flow.
6. Customer still sees shipment progress from `/track` and account order pages.

This fallback keeps seller/admin/customer ops working even before full live automation is enabled.
