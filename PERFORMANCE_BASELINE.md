# Performance Baseline Report

> **Superseded snapshot:** The sections below were generated on 2026-09-08. Several findings no longer match the current `development` branch. Use the verified status here before taking action; do not apply the old schema findings as migrations without checking the target database.

## Verified Status (2026-10-02)

### Confirmed and addressed

- The root layout no longer exports `dynamic = 'force-dynamic'`; route-level request data can determine whether an individual route is dynamic.
- `/api/products` already applies a default limit of 48, caps requests at 100, and emits public cache headers.
- `productSellerInclude` selects seller profile fields and verification status only; it does not load every seller product.
- Dashboard login/session synchronization, skeletons, staged core/optional data loading, and redundant middleware bearer-claim verification have been improved.
- The linked Supabase database matches the local `.env` database host. Read-only checks confirmed the audit-named tables (`Product`, `Category`, `Banner`, `FlashSaleCampaign`, `CourierStoreMapping`), columns (`Product.weightKg`, `TenantSetting.defaultProductWeightKg`, `OrderShipment.merchantReference`), and enum values (`shipped`, `unpaid`) are present there.
- The checked-in Supabase baseline is recorded as applied to that linked database. Do not replay it or run a destructive reset against this database.
- The resolved local Next.js version is 15.5.27; `next.config.ts` has `ignoreBuildErrors: false` and `ignoreDuringBuilds: false`.

### Still open or not independently verified

1. **Verify Vercel production database target.** This workspace has no linked Vercel project configuration, so the supplied Vercel runtime errors were not independently checked. Confirm Vercel's `DATABASE_URL` and `DIRECT_URL` point to the intended Supabase project before creating any migration. The linked database checked above is healthy for the named schema items; this does not prove Vercel uses it.
2. **Move public landing data server-side.** `src/app/page.tsx` still re-exports the client-side `HomePage`; public catalog data therefore still begins in client effects. Convert incrementally, preserving existing interactive cart/wishlist components.
3. **Measure before more query tuning.** Capture request duration and database query plans for homepage, search, product detail, checkout, and dashboard endpoints. The older claims about unbounded products and `productSellerInclude` are superseded; avoid optimizing those based on the stale report.
4. **Reduce root provider scope.** Cart, wishlist, compare, inventory, commerce config, and auth providers are still nested globally. Split providers only after measuring client bundle and re-render impact.
5. **Track remaining lint debt.** Current role dashboard files still have pre-existing unused-code and explicit-`any` warnings; resolve these incrementally without suppressing lint globally.

### Validation

- Latest verified checks: TypeScript passes and 397 Vitest tests pass.
- The complete production build has not been rerun after the newest dashboard changes because a Next.js development server was active and shares the `.next` output directory.
- No Vercel production environment values or runtime logs were read during this review.

The earlier 2026-09-08 report below is retained as historical context only; its priority labels and unverified findings must not be treated as current facts.

Generated: 2026-09-08
Project: LofiMart Next.js Commerce Platform

---

## Current Architecture

- **Framework**: Next.js 15.5 + React 19 + TypeScript 5.8
- **Database**: PostgreSQL via Prisma 6
- **Styling**: Tailwind CSS 4 + custom CSS (~1600 lines)
- **State**: React Context (Cart, Wishlist, Compare, User, CommerceConfig)
- **Images**: Custom `OptimizedImage` component with Cloudinary transformations
- **Fonts**: Inter, Poppins, Noto Sans Bengali (via `next/font/google`)
- **Analytics**: Google Analytics + Meta Pixel (`afterInteractive`)
- **PWA**: Service worker + offline storage
- **Deployment**: Vercel (implied by `lofimart.vercel.app`)

---

## Critical Bottlenecks (P0)

### 1. Root Layout Forces Dynamic Rendering on Every Request
**File**: `src/app/layout.tsx:46`
```tsx
export const dynamic = 'force-dynamic';
```
**Impact**: DISABLES ALL CACHING for every page. Every page render hits the server. TTFB is maximized. Static pages, public pages, and even error pages are dynamically rendered. This is the single most damaging performance issue.

### 2. All Public Pages Are Client Components
**Files**: `page.tsx`, `(shop)/shop/page.tsx`, `(shop)/product/[slug]/page.tsx`, `(shop)/search/page.tsx`, `(shop)/categories/page.tsx`, and ~100+ other files
**Impact**: No SSR, no streaming, no server-side data fetching. Every page starts with an empty HTML shell, then waterfalls client-side API calls. LCP and INP are severely impacted.

### 3. ProductDetailsPage Request Waterfall
**File**: `src/features/shop/screens/ProductDetailsPage.tsx`
**Impact**: After loading the main product, it sequentially triggers:
1. Reviews fetch (after product loads + deferred sections intersect)
2. Related products fetch (after reviews complete + deferred sections)
3. Seller products fetch (after product loads + deferred sections)
This creates a 3-request waterfall that blocks interactive content.

### 4. Heavy `productSellerInclude` in Prisma Queries
**File**: `src/app/api/products/shared.ts:111-132`
```tsx
export const productSellerInclude = {
  seller: {
    select: {
      id: true,
      name: true,
      storeName: true,
      sellerStatus: true,
      storefrontPublished: true,
      responseTimeHours: true,
      products: { select: { rating: true } }, // LOADS ALL SELLER PRODUCTS!
      verificationSubmission: { select: { status: true } },
    },
  },
};
```
**Impact**: Every product query loads ALL of the seller's products just to compute a rating average. For sellers with hundreds of products, this is extremely expensive. Used in `/api/shop-page`, `/api/products`, `/api/search/products`, `/api/products/[id]`, `/api/flash-sale/active`.

### 5. `/api/products` Has No Default Pagination Limit
**File**: `src/app/api/products/route.ts:42`
**Impact**: Without `limit`, this endpoint returns ALL published products. On a large catalog, this creates massive JSON payloads and slow response times.

---

## High-Impact Problems (P1)

### 6. No Caching on Public API Routes
**Files**: Multiple API routes
**Impact**: Public data (categories, banners, products, blog posts) is served with `dynamic = 'force-dynamic'` and no cache headers. Every request hits the database.

### 7. Client-Side Data Fetching for All Pages
**Files**: HomePage, ShopPage, ProductDetailsPage, SearchPage, CategoriesPage
**Impact**: Pages render empty shells, then fetch data. This increases LCP, FCP, and CLS. Users see loading skeletons instead of content.

### 8. Duplicate Code for Payload Parsing
**Files**: `HomePage.tsx:153-192` and `ShopPage.tsx:62-130`
**Impact**: `getProductList`, `getCategoryList`, `getBannerList` are duplicated. Maintenance burden and inconsistent behavior.

### 9. Client-Side `fetchJsonWithTimeout` in HomePage
**File**: `src/features/shop/screens/HomePage.tsx:256-278`
**Impact**: Uses `AbortSignal` and `window.setTimeout` for timeout. This is a workaround for slow API responses. The real fix is server-side data fetching.

### 10. `CommerceConfigContext` Fetches on Client
**File**: `src/features/shared/state/CommerceConfigContext.tsx`
**Impact**: Fetches `/api/public/commerce-config` on client mount. This is public static-ish data that could be server-fetched.

---

## Medium-Impact Problems (P2)

### 11. Lucide-React Icon Overhead
**Files**: Multiple pages import 10-25 icons each
**Impact**: Large icon bundles. `optimizePackageImports` is configured but importing many icons per file still adds up.

### 12. Custom `OptimizedImage` vs `next/image`
**File**: `src/features/shared/ui/OptimizedImage.tsx`
**Impact**: Custom component does Cloudinary URL building and IntersectionObserver. While functional, it misses Next.js Image's built-in optimization, placeholder generation, and device-size-aware srcsets.

### 13. Framer Motion on Low-End Devices
**Files**: CategoriesPage, AnimatedIcon, PageTransition, etc.
**Impact**: Framer Motion animations can cause jank on low-end Android devices. Many animations are decorative and could be reduced.

### 14. Large CSS File
**File**: `src/index.css` (~1600 lines)
**Impact**: Large CSS with many component classes. Tailwind purging should help, but the custom CSS is substantial.

### 15. Client Cache Implementation
**File**: `src/lib/client-cache.ts`
**Impact**: In-memory Map cache with 120 entry limit. No persistence across page navigations. Server data would be better cached at the edge/CDN level.

---

## Low-Impact Problems (P3)

### 16. Font Loading
**Files**: `src/app/layout.tsx:12-36`
**Impact**: 3 fonts loaded. Poppins and Noto Sans Bengali have `preload: false`. Could optimize by preloading the most critical font.

### 17. Service Worker Registration Timing
**File**: `src/features/shared/app/AppChrome.tsx:123-153`
**Impact**: SW registration happens in `useEffect` after idle. Fine, but could be slightly earlier for PWA benefit.

### 18. Image Placeholder Generation
**File**: `src/lib/cloudinary.ts` (referenced)
**Impact**: Placeholder images are fetched from Cloudinary. Could use inline SVG placeholders for better LCP.

### 19. Breadcrumbs on Product Page
**File**: `ProductDetailsPage.tsx`
**Impact**: Breadcrumbs are rendered but could be simpler.

### 20. No `loading.tsx` for Key Routes
**Impact**: Many routes lack loading skeletons, causing blank screens during navigation.

---

## Database Query Issues

### N+1 / Heavy Includes
- `productSellerInclude` loads `seller.products` for every product
- `serializeProduct` accesses `product.seller?.products` to compute average rating

### Missing Indexes (Candidate)
- `Product.slug` - used for product lookup, has `@@unique` (good)
- `Product.productStatus` - filtered frequently, has `@@index([productStatus, publishedAt])` (good)
- `Product.category` - has `@@index` (good)
- `User.email` - has `@@unique` (good)
- `Order.userId` - has `@@index` (good)

### Sequential Queries
- `/api/shop-page` uses `Promise.all` for products, categories, banners (GOOD)
- ProductDetailsPage uses sequential fetches (BAD)

---

## Recommended Optimization Order

1. **Remove `dynamic = 'force-dynamic'` from root layout** - Immediate 90% improvement potential
2. **Convert HomePage to Server Component** - Fetch data server-side, eliminate client waterfall
3. **Fix `productSellerInclude`** - Remove `seller.products` include; precompute seller ratings
4. **Add pagination to `/api/products`** - Prevent unbounded result sets
5. **Add caching headers to public API routes** - Revalidate stale data
6. **Convert ShopPage to Server Component** - Server-side data fetching
7. **Fix ProductDetailsPage waterfalls** - Parallelize deferred fetches
8. **Convert SearchPage to Server Component** - Server-side search
9. **Convert CategoriesPage to Server Component** - Already parallel, but client-side
10. **Optimize images** - Use `next/image` or improve Cloudinary params
11. **Bundle optimization** - Tree-shake icons, dynamic imports
12. **CSS optimization** - Remove unused styles

---

## Target Metrics

- LCP: < 2.5s
- INP: < 200ms
- CLS: < 0.1
- Initial JS: < 200KB
- Network requests: < 15 on homepage
- Images: Optimized + responsive

---

## Build Status

Historical note from 2026-09-08: this section reported a passing build with `ignoreBuildErrors: true`.
Current configuration has `ignoreBuildErrors: false` and `ignoreDuringBuilds: false`; check the latest CI/deployment result rather than relying on this historical status.
