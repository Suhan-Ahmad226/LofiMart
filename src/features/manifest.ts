export type FeatureArea =
  | 'public'
  | 'shop'
  | 'auth'
  | 'customer'
  | 'seller'
  | 'reseller'
  | 'bazaar'
  | 'admin'
  | 'courier'
  | 'pos'
  | 'inventory'
  | 'ai'
  | 'shared';

export type FeatureManifestEntry = {
  area: FeatureArea;
  routeRoots: string[];
  screenRoots: string[];
  componentRoots: string[];
  apiRoots: string[];
  notes: string;
};

export const featureManifest: FeatureManifestEntry[] = [
  {
    area: 'public',
    routeRoots: ['src/app/(content)'],
    screenRoots: ['src/features/public/screens'],
    componentRoots: ['src/features/shared/layout', 'src/features/shared/components/SocialShare.tsx'],
    apiRoots: ['src/app/api/public'],
    notes: 'Marketing, informational, policy, blog, community, PWA, help, returns, and tracking pages.',
  },
  {
    area: 'shop',
    routeRoots: ['src/app/(shop)', 'src/app/page.tsx'],
    screenRoots: ['src/features/shop/screens'],
    componentRoots: [
      'src/features/shop/components',
      'src/features/shop/components/conversion',
      'src/features/shop/state',
      'src/features/shared/media',
    ],
    apiRoots: ['src/app/api/home', 'src/app/api/shop-page', 'src/app/api/products', 'src/app/api/cart'],
    notes: 'Homepage, catalog, product, cart, checkout, wishlist, category, search, and public storefront flows.',
  },
  {
    area: 'auth',
    routeRoots: ['src/app/(auth)', 'src/app/auth'],
    screenRoots: ['src/features/auth/screens'],
    componentRoots: ['src/features/auth/components'],
    apiRoots: ['src/app/api/auth'],
    notes: 'Email/OAuth auth UI, callbacks, session refresh, and role-aware redirects.',
  },
  {
    area: 'customer',
    routeRoots: ['src/app/(user)'],
    screenRoots: ['src/features/customer/screens'],
    componentRoots: ['src/features/shared/profile', 'src/features/shared/state'],
    apiRoots: ['src/app/api/users', 'src/app/api/user', 'src/app/api/orders/my-orders'],
    notes: 'Customer dashboard, orders, invoices, wallet, wishlist, notifications, settings, and profile.',
  },
  {
    area: 'seller',
    routeRoots: ['src/app/(seller)'],
    screenRoots: ['src/features/seller/screens'],
    componentRoots: ['src/features/seller/components', 'src/features/shared/profile', 'src/features/shared/state'],
    apiRoots: ['src/app/api/seller'],
    notes: 'Seller dashboard, product management, orders, manual orders, inventory, courier, marketing, support, and payout flows.',
  },
  {
    area: 'reseller',
    routeRoots: ['src/app/(reseller)'],
    screenRoots: ['src/features/reseller/screens'],
    componentRoots: ['src/features/reseller/components', 'src/features/shared/profile', 'src/features/shared/state'],
    apiRoots: ['src/app/api/reseller'],
    notes: 'Reseller dashboard, catalog, promotions, earnings, network, shop, onboarding, and settings.',
  },
  {
    area: 'bazaar',
    routeRoots: ['src/app/(bazaar)'],
    screenRoots: ['src/features/bazaar/screens'],
    componentRoots: ['src/features/ai/components', 'src/features/reseller/components'],
    apiRoots: ['src/app/api/bazaar', 'src/app/api/ai'],
    notes: 'Bazaar discovery, affiliate catalog, AI gift finder entry point, loyalty rewards, live concierge, and reseller discovery.',
  },
  {
    area: 'admin',
    routeRoots: ['src/app/(admin)'],
    screenRoots: ['src/features/admin/screens'],
    componentRoots: [
      'src/features/admin/screens',
      'src/features/admin/services/accounting',
      'src/features/admin/services/engagement',
      'src/features/shared/analytics',
      'src/features/shared/layout',
    ],
    apiRoots: ['src/app/api/admin'],
    notes: 'Admin control center for live data, operations, products, banners, inventory, POS, accounting, users, and sellers.',
  },
  {
    area: 'courier',
    routeRoots: ['src/app/(seller)/seller/courier', 'src/app/(admin)/admin/logistics'],
    screenRoots: ['src/features/seller/screens/CourierManagement.tsx', 'src/features/admin/screens/Logistics.tsx'],
    componentRoots: ['src/features/seller/components', 'src/features/courier/services'],
    apiRoots: ['src/app/api/seller/courier', 'src/app/api/admin/logistics'],
    notes: 'Delivery partner, pickup, shipment, and logistics workflows.',
  },
  {
    area: 'pos',
    routeRoots: ['src/app/(admin)/admin/pos'],
    screenRoots: ['src/features/admin/screens/POS.tsx'],
    componentRoots: ['src/features/admin/screens/POS.tsx', 'src/features/pos/services/payments'],
    apiRoots: ['src/app/api/admin/pos'],
    notes: 'Admin point-of-sale workflow and checkout-adjacent payment surfaces.',
  },
  {
    area: 'inventory',
    routeRoots: ['src/app/(admin)/admin/inventory', 'src/app/(seller)/seller/inventory'],
    screenRoots: ['src/features/admin/screens/InventoryPage.tsx', 'src/features/seller/screens/Inventory.tsx'],
    componentRoots: [
      'src/features/inventory/components',
      'src/features/inventory/state',
      'src/features/inventory/hooks',
      'src/features/inventory/services',
    ],
    apiRoots: ['src/app/api/inventory', 'src/app/api/admin/inventory', 'src/app/api/seller/inventory-alerts'],
    notes: 'Stock, warehouses, suppliers, purchase orders, and low-stock alerting.',
  },
  {
    area: 'ai',
    routeRoots: ['src/app/(content)/ai-features', 'src/app/(bazaar)/bazaar/aigiftfinder'],
    screenRoots: ['src/features/ai/screens', 'src/features/bazaar/screens/AIGiftFinder.tsx'],
    componentRoots: ['src/features/ai/components', 'src/features/ai/hooks'],
    apiRoots: ['src/app/api/ai'],
    notes: 'AI recommendations, AI gift finder, and AI-assisted shopping features.',
  },
  {
    area: 'shared',
    routeRoots: ['src/app/layout.tsx'],
    screenRoots: ['src/features/shared/immersive', 'src/features/shared/orders'],
    componentRoots: [
      'src/features/shared/ui',
      'src/features/shared/app',
      'src/features/shared/layout',
      'src/features/shared/animations',
      'src/features/shared/analytics',
      'src/features/shared/immersive/components',
      'src/features/shared/immersive/hooks',
      'src/features/shared/media',
      'src/features/shared/services/cache',
      'src/features/shared/services/database',
      'src/features/shared/services/media',
      'src/features/shared/services/messaging',
      'src/features/shared/services/monitoring',
      'src/features/shared/services/platform',
      'src/features/shared/services/security',
      'src/features/shared/pwa',
      'src/features/shared/pwa/hooks',
      'src/features/shared/profile',
      'src/features/shared/state',
    ],
    apiRoots: ['src/app/api/health', 'src/app/api/media', 'src/app/api/analytics'],
    notes: 'Shared UI, providers, layout, analytics, uploads, helpers, hooks, services, data, workers, types, and utils.',
  },
];

export const featureAreas = featureManifest.map((feature) => feature.area);
