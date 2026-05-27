# Seller Approval Workflow

## Lifecycle

- `draft`
- `pending_review`
- `under_review`
- `approved`
- `rejected`
- `suspended`

## Data model

`User`
- `sellerStatus`
- `submittedForReviewAt`
- `approvedAt`
- `approvedById`
- `rejectionReason`
- `suspensionReason`

`Product`
- `productStatus`
- `publishedAt`

## Business rules

- New sellers default to `draft`
- Draft, pending, under-review, rejected, and suspended sellers can:
  - access seller dashboard
  - complete onboarding
  - upload KYC
  - configure payout methods
  - configure pickup locations
  - create and edit products as drafts
- Only `approved` sellers can:
  - publish products
  - publish storefronts
  - receive public marketplace visibility
  - receive orders
  - submit flash sales
  - request courier bookings
  - withdraw payouts

## Centralized logic

- Shared status and requirement helpers live in `src/lib/sellerApproval.ts`
- Backend routes call the shared helpers instead of hardcoding component-level rules

## Migration strategy

1. Apply `20260525_seller_approval_workflow`
2. Existing seller rows with legacy `active` status are converted to `approved`
3. Existing seller-owned products are backfilled to `published`
4. New sellers start in `draft`
5. New seller-owned products start in `draft` until seller approval

## Recommended module layout

- `src/lib/sellerApproval.ts`
  - status enums
  - requirement helpers
  - capability guard messages
- `src/server/sellerApproval/`
  - route guard helpers
  - seller review services
  - admin approval actions
- `src/screens/seller/`
  - onboarding, dashboard, payouts, courier, flash-sale UI state
- `src/screens/admin/`
  - seller review desk
- `server.ts`
  - route orchestration only, progressively extract seller approval handlers into dedicated server modules
