# LofiMart Feature Structure

This folder is the ownership map for production features. It keeps the app easy
to update without forcing a risky one-shot move of every route and component.

## Feature Areas

- `public`: public content pages such as about, contact, blog, help, policies, returns, and tracking.
- `shop`: storefront, homepage, product details, cart, checkout, wishlist, category, search, flash sale, and public seller/reseller storefronts.
- `auth`: login, register, forgot password, reset password, callback, and role routing.
- `customer`: customer account dashboard, orders, wallet, wishlist, settings, notifications, invoices, and profile data.
- `seller`: seller dashboard, products, orders, manual orders, inventory, courier, pickup locations, earnings, payouts, marketing, flash sale, support, and onboarding.
- `reseller`: reseller dashboard, catalog, shop, network, promotions, earnings, manual orders, settings, and onboarding.
- `bazaar`: affiliate catalog, AI gift finder entry point, loyalty rewards, live concierge, and reseller discovery.
- `admin`: admin dashboard, products, categories, banners, users, sellers, orders, inventory, POS, accounting, payments, logistics, settings, content, coupons, reviews, returns, support, and reports.
- `courier`: courier and delivery workflows shared by seller/admin logistics.
- `pos`: point-of-sale workflows and admin POS screens.
- `inventory`: stock, warehouses, suppliers, purchase orders, low-stock alerts, and inventory analytics.
- `ai`: AI recommendations, gift finder, AI feature pages, and AI-assisted commerce tools.
- `shared`: cross-feature UI, layout, data access, hooks, providers, utilities, and server helpers.

## Current Source Of Truth

- Routes live in `src/app`.
- Feature screens live in `src/features/<area>/screens`.
- Feature-owned UI lives in `src/features/<area>/components`.
- Feature-owned state and hooks live in `src/features/<area>/state` and `src/features/<area>/hooks`.
- Feature-owned services live in `src/features/<area>/services`.
- Cross-feature UI, providers, layout, media, analytics, PWA, profile, and infra services live in `src/features/shared`.
- Compatibility wrappers remain in legacy folders like `src/screens`, `src/components`, `src/context`, `src/hooks`, and `src/services` so older imports and mirrored runtime paths keep working.

## Maintenance Rules

- Add new feature code under the matching `src/features/<area>` folder first.
- Keep `src/app` route files thin and let them import feature screens.
- Use `src/features/shared` only for code that is genuinely reused by multiple areas.
- Keep compatibility wrappers small: export from the feature folder, do not add new logic there.
- Update `src/features/manifest.ts` whenever ownership changes.
