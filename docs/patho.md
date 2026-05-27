# Pathao Production Setup

This document explains how Pathao Courier works inside this marketplace and what must be configured before going live.

## What Is Already Built

The codebase now supports:

- OAuth token issue and refresh for Pathao Courier Merchant API
- Redis-backed token persistence
- Pathao city, zone, and area lookup APIs
- Pathao store list and store creation APIs
- Pathao single-order booking
- Pathao bulk order booking
- Pathao order short info lookup
- Pathao price calculation
- webhook challenge handling and status sync
- multi-vendor shipment-level booking from seller warehouses

## Required Environment Variables

Set these in `.env` for live use:

```env
PATHAO_BASE_URL=https://api-hermes.pathao.com
PATHAO_CLIENT_ID=your_live_client_id
PATHAO_CLIENT_SECRET=your_live_client_secret
PATHAO_USERNAME=your_merchant_login_email
PATHAO_PASSWORD=your_merchant_login_password
PATHAO_BOOKING_ENDPOINT=/aladdin/api/v1/orders
PATHAO_WEBHOOK_TOKEN=your_private_webhook_token
```

Ready-to-paste example file:

```text
docs/PATHAO_LIVE_ENV.example
```

Sandbox example:

```env
PATHAO_BASE_URL=https://courier-api-sandbox.pathao.com
PATHAO_BOOKING_ENDPOINT=/aladdin/api/v1/orders
```

## Required Warehouse Configuration

Every pickup warehouse should have:

- primary phone number
- contact name
- Pathao `city_id`
- Pathao `zone_id`
- Pathao `area_id`

Optional but recommended:

- `secondary_contact`
- `otp_number`
- existing `store_id`

If `store_id` is missing but city/zone/area mapping exists, the system can create a Pathao store from the warehouse and save the returned store mapping.

## Admin or Seller Setup Flow

1. Go to `/admin/inventory`
2. Open the `Warehouse and Pathao Mapping` section
3. Choose a warehouse
4. Fill:
   - contact name
   - secondary phone
   - OTP number
   - city
   - zone
   - area
5. Save the Pathao config
6. Click `Create Pathao store` if the warehouse has no linked store yet
7. Verify that a `store_id` is now linked

## Shipment Booking Flow

When seller requests pickup from `/seller/courier`:

1. shipment warehouse is resolved
2. Pathao OAuth access token is loaded or refreshed
3. linked `store_id` is used
4. if store is not linked, the warehouse can create one first
5. Pathao order is created
6. `consignment_id` is saved as tracking ID
7. shipment metadata stores:
   - request payload
   - Pathao response
   - store linkage data

## Internal APIs

These routes are now available:

- `GET /api/logistics/pathao/cities`
- `GET /api/logistics/pathao/cities/:cityId/zones`
- `GET /api/logistics/pathao/zones/:zoneId/areas`
- `GET /api/logistics/pathao/stores`
- `POST /api/logistics/pathao/stores`
- `POST /api/logistics/pathao/price`
- `POST /api/logistics/pathao/orders/bulk`
- `GET /api/logistics/pathao/orders/:consignmentId/info`
- `PATCH /api/admin/inventory/warehouses/:id/pathao`

## Webhook Setup

Pathao webhook endpoint:

```text
POST /api/logistics/webhooks/pathao
```

The system supports:

- webhook integration challenge
- `X-PATHAO-Signature`
- token-based verification fallback
- event-to-status normalization

For Pathao integration verification:

- response status should be `202`
- header returned:

```text
X-Pathao-Merchant-Webhook-Integration-Secret: f3992ecc-59da-4cbe-a049-a13da2018d51
```

## Pathao Event Mapping

Common Pathao events map into internal shipment statuses like this:

- `order.created` -> `pending`
- `pickup.requested` -> `pickup_requested`
- `pickup` -> `picked_up`
- `at_the_sorting_hub` -> `in_transit`
- `in_transit` -> `in_transit`
- `assigned_for_delivery` -> `out_for_delivery`
- `delivered` -> `delivered`
- `delivery_failed` -> `delivery_failed`
- `returned_to_merchant` -> `returned`

## Go-Live Checklist

- live Pathao credentials added to `.env`
- webhook URL reachable from the internet
- webhook secret/token configured
- at least one warehouse fully mapped with city/zone/area
- warehouse has valid 11-digit Bangladeshi contact number
- warehouse has linked `store_id` or can create one
- seller can request pickup from `/seller/courier`
- order tracking reflects webhook updates

## Safe Copy Block

Use this exact block in `.env` with your live values:

```env
PATHAO_BASE_URL=https://api-hermes.pathao.com
PATHAO_CLIENT_ID=your_live_client_id
PATHAO_CLIENT_SECRET=your_live_client_secret
PATHAO_USERNAME=your_merchant_login_email
PATHAO_PASSWORD=your_live_merchant_password
PATHAO_BOOKING_ENDPOINT=/aladdin/api/v1/orders
PATHAO_WEBHOOK_TOKEN=your_private_webhook_token
```

Webhook URL to register in Pathao:

```text
https://your-domain.com/api/logistics/webhooks/pathao
```

## Operational Notes

- this is shipment-level, not order-level booking
- one customer order can create multiple Pathao shipments
- each seller warehouse can map to a different Pathao store
- Redis is required for token persistence and smooth refresh flow

## Recommended Next Step

If you want the last mile fully polished, the next best improvement is:

- add inline Pathao price estimation inside checkout or seller shipment booking
- add webhook event log/history view in admin panel
- add warehouse create/edit UI beyond the current Pathao mapping panel
