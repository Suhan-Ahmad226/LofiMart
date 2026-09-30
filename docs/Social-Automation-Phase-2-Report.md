# Social Automation — Phase 2 Report

Phase 2 makes Facebook OAuth + AI captions + **real one-time Facebook publishing** work end to end, directly from the app. There is no n8n and no recurring worker in this phase.

n8n was intentionally NOT implemented in Phase 2 and will be handled in the next phase.

## Goal achieved

- Secure OAuth login with Facebook, showing a page-selection UI and persisting a real, validated page token.
- Real one-time publishing to the selected Facebook Page through the Graph API (upload a photo + caption for products with an image, message + link otherwise).
- AI captions via Google Gemini (`gemini-2.0-flash`).

## Files created

| File | Purpose |
| --- | --- |
| `src/features/social-automation/services/publishing.service.ts` | Real `publishOneTimePost`: stock gate, idempotency, `PUBLISHING → PUBLISHED/FAILED` transitions, token validation. |
| `src/app/api/social-automation/accounts/[id]/validate/route.ts` | POST endpoint that validates an existing account connection against Facebook. |
| `src/features/social-automation/services/facebook.service.test.ts` | Unit tests: config alias detection, OAuth URL, image URL sanitizing, error classification, token exchange. |
| `src/features/social-automation/services/publishing.service.test.ts` | Unit tests: stock gate, idempotency (repeat + race), success transition, token-expired failure, config-missing failure. |
| `src/features/social-automation/services/oauth.service.test.ts` | Unit tests: state create/expiry/single-use/cancel-by-state, pending pages round-trip, page confirmation. |
| `docs/Social-Automation-Phase-2-Report.md` | This report. |

## Files modified

| File | Change |
| --- | --- |
| `src/lib/env.ts` | Added `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_REDIRECT_URI` to the server schema. Production validation now accepts either the `FACEBOOK_APP_*` or the legacy `FACEBOOK_CLIENT_*` pair, and fails if only one of the pair is set. |
| `.env.example` | Documented the Meta/Facebook section with canonical env names and the required Graph permissions. |
| `src/features/social-automation/services/facebook.service.ts` | Added `FacebookApiException` (with `kind`/`code`/`subcode`), `classifyFacebookCode`, `describeFacebookError`, `getFacebookErrorMessage`, `readGraphResponse`, and `getPublicProductImageUrl` (Cloudinary-safe, https-only). |
| `src/features/social-automation/services/oauth.service.ts` | Fixed `cancelPendingOAuthState` to match `where.state` (previously matched `where.id`); `storePendingOAuthPages` stores the user-token expiry; `confirmFacebookPageConnection` persists `tokenExpiresAt`. |
| `src/features/social-automation/services/social-automation.service.ts` | Added `idempotencyKey` to the create-post schema; `createPostOrAutomation` routes one-time "now" posts through `publishOneTimePost`; dashboards/`getDashboardPayload` now report real configured flags and account status; caption input is mapped to `SocialCaptionProduct` (availability + store name derived from DB). |
| `src/app/api/social-automation/accounts/oauth/callback/route.ts` | Passes the computed long-lived token expiry into `storePendingOAuthPages`; redirects to `select_page` when pages exist. |
| `src/app/api/social-automation/posts/route.ts` | Duplicate → 200, `FAILED` → 502, and maps `SocialAutomationPublishError` to 404/409/502. |
| `src/app/api/social-automation/accounts/oauth/route.ts` | Fixed the `_compat/shared` import depth so the type check passes. |
| `src/features/social-automation/components/SocialAutomationDashboard.tsx` | Added the Facebook page-selection modal (shown on `oauth=select_page`), account status badges (`CONNECTED`/`EXPIRED`/`ERROR`), friendly OAuth error mapping, reconnect/disconnect actions, and a "publishing not configured" notice. |
| `src/features/social-automation/components/SocialAutomationProducts.tsx` | POST modal: client-generated `idempotencyKey` for "post now", live Facebook-style preview panel, out-of-stock + not-connected guards (block publishing), FAILED/duplicate response handling. |
| `src/features/social-automation/services/caption.service.test.ts` | Aligned expectations with the current Gemini provider result codes (`AI_NOT_CONFIGURED`, `AI_EMPTY_RESPONSE`, `AI_PROVIDER_ERROR`). |
| `src/features/social-automation/services/social-automation.service.test.ts` | Imported `afterEach` (was missing). |

## OAuth flow and routes

1. `GET /api/social-automation/accounts/oauth` — builds the Facebook dialog URL statefully (10-minute expiry, single-use).
2. User authorizes on Facebook → `GET /api/social-automation/accounts/oauth/callback` — exchanges the code for a short-lived token, then for a long-lived token (`fb_exchange_token`), fetches the pages, and redirects to:
   - `oauth=select_page&state=…` when pages exist,
   - `oauth=error&message=<code>` otherwise.
3. `GET /api/social-automation/accounts/oauth/pages?state=…` — lists pending pages for the seller's session.
4. `POST /api/social-automation/accounts` with `{ state, pageId }` — validates the chosen page token and upserts `SocialAccount` as `CONNECTED`.
5. `POST /api/social-automation/accounts/oauth/cancel` — marks a pending state used.
6. `POST /api/social-automation/accounts/[id]/validate` — re-validates an existing connection.

Every endpoint is guarded by `requireApiUser` + `requireSellerRole`, and the seller identity always comes from the server session (never from the request body/query).

## Permissions / scopes

`pages_manage_posts, pages_read_engagement, pages_show_list` — used for reading the page list, validating the page access token, and publishing to the page as an app with `appsecret_proof`.

## Environment variables

- `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` (canonical) — the legacy `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` pair is still accepted.
- `FACEBOOK_REDIRECT_URI` (optional) — defaults to `${FRONTEND_URL}/api/social-automation/accounts/oauth/callback`.
- `GEMINI_API_KEY` — Google Gemini provider key for AI captions.

## Database changes

No schema changes; the existing Prisma models are used: `SocialAccount`, `OAuthState`, `SocialPost`, `SocialPostTarget`, `SocialPostAutomation`, `SocialAutomationSetting`.

- `SocialPost.idempotencyKey` is the idempotency key (duplicates return the existing row).
- `SocialPost` status transitions: `PUBLISHING → PUBLISHED` only after Facebook confirms a post id; `PUBLISHING → FAILED` on any failure (account set to `EXPIRED` for token problems, `ERROR` otherwise).
- `SocialAccount.status`: `CONNECTED` / `EXPIRED` / `ERROR`.

## AI provider

Google Gemini, model `gemini-2.0-flash`, via the `generateContent` REST API. Result codes surfaced to the UI: `AI_NOT_CONFIGURED`, `AI_EMPTY_RESPONSE`, `AI_PROVIDER_ERROR`. The dashboard shows a notice until `GEMINI_API_KEY` is configured.

## Publishing for real

One-time "post now" goes through `publishOneTimePost`:

- Never publishes when `skip_out_of_stock` and stock ≤ 0 (clear `409` error).
- Requires a connected `CONNECTED` account; validates the page token against Graph before publishing.
- Publishes to `/{version}/{pageId}/photos` (photo + caption) or `/feed` (message + link) with the public product image (https-only, Cloudinary-transformed) and product URL.
- `externalPostId` and `publishedAt` come only from the successful Graph API response — never fabricated.

## Tests and build

- `npm test` → **159 passed** (12 files).
- `npm run lint:types` → clean.
- ESLint on the changed files → 0 errors.
- `npm run build` → Next.js production build compiled successfully (including the `social-automation` routes/pages) and the TypeScript emit check passed.

## Known limitations / Phase 3 leftovers

- Meta App Review is required before multiple real sellers can use Facebook publishing.
- The long-lived/user token expiration edge cases beyond the initial validation are surfaced as `EXPIRED` on the next publish attempt.
- Scheduled and recurring automations are stored but their runtime execution (a worker/queue) is **not** part of Phase 2.
- n8n was intentionally NOT implemented in Phase 2 and will be handled in the next phase.