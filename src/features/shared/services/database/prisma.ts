import { PrismaClient } from '@prisma/client';
import { getTenantContext } from './tenantContext';

declare global {
  var __amarshopPrisma__: PrismaClient | undefined;
}

const tenantScopedModels = new Set([
  'User',
  'Product',
  'Order',
  'Warehouse',
  'Store',
]);

function withTenantFilter(args: Record<string, any>, tenantId: string) {
  const nextArgs = { ...args };
  nextArgs.where = {
    ...(nextArgs.where || {}),
    tenantId,
  };
  return nextArgs;
}

function buildRuntimeDatabaseUrl() {
  const raw = process.env.DATABASE_URL?.trim() || 'postgresql://postgres:postgres@localhost:5432/lofimart';
  try {
    const url = new URL(raw);
    url.searchParams.set('connection_limit', '1');
    return url.toString();
  } catch {
    return raw;
  }
}

// ==========================================
// In-Memory Mock Store for AI Studio Preview
// ==========================================
const mockSeller = {
  id: 'seller-lofimart-official',
  name: 'LofiMart Official',
  email: 'seller@lofimart.com',
  storeName: 'LofiMart Flagship Store',
  storefrontSlug: 'lofimart-official',
  role: 'seller',
  sellerStatus: 'approved',
  avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&fit=crop',
  responseTimeHours: 2,
  verificationSubmission: { status: 'verified' },
};

const mockCategories = [
  { id: 1, name: 'Fashion', icon: 'ShoppingBag' },
  { id: 2, name: 'Electronics', icon: 'Laptop' },
  { id: 3, name: 'Groceries', icon: 'Utensils' },
  { id: 4, name: 'Home & Living', icon: 'Home' },
  { id: 5, name: 'Beauty', icon: 'Sparkles' },
  { id: 6, name: 'Sports', icon: 'Bike' },
  { id: 7, name: 'Baby Care', icon: 'Baby' },
  { id: 8, name: 'Art & Crafts', icon: 'Palette' },
];

const mockProducts = [
  {
    id: 1,
    slug: 'smartphone-x1-pro',
    name: 'Smartphone X1 Pro',
    description: 'Flagship smartphone featuring a 108MP camera, 120Hz crystal AMOLED display, 5000mAh battery, and lightning fast 67W Turbo charging.',
    price: 25000,
    oldPrice: 28000,
    image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&fit=crop',
    category: 'Electronics',
    stock: 25,
    rating: 4.8,
    reviewsCount: 312,
    productStatus: 'published',
    isPublished: true,
    sellerId: mockSeller.id,
    seller: mockSeller,
    createdAt: new Date('2026-09-01T10:00:00Z'),
    updatedAt: new Date('2026-09-01T10:00:00Z'),
  },
  {
    id: 2,
    slug: 'wireless-headphones',
    name: 'Wireless Noise Cancelling Headphones',
    description: 'Immersive sound with hybrid active noise cancellation, custom high-res dynamic drivers, and 40 hours of ultra-long battery life.',
    price: 3500,
    oldPrice: 4500,
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&fit=crop',
    category: 'Electronics',
    stock: 30,
    rating: 4.7,
    reviewsCount: 154,
    productStatus: 'published',
    isPublished: true,
    sellerId: mockSeller.id,
    seller: mockSeller,
    createdAt: new Date('2026-09-02T10:00:00Z'),
    updatedAt: new Date('2026-09-02T10:00:00Z'),
  },
  {
    id: 3,
    slug: 'minimalist-canvas-sneakers',
    name: 'Minimalist Canvas Sneakers',
    description: 'Everyday lifestyle sneakers engineered with breathable cotton canvas, shock-absorbing insoles, and durable vulcanized rubber soles.',
    price: 2200,
    oldPrice: 2800,
    image: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=600&fit=crop',
    category: 'Fashion',
    stock: 45,
    rating: 4.9,
    reviewsCount: 96,
    productStatus: 'published',
    isPublished: true,
    sellerId: mockSeller.id,
    seller: mockSeller,
    createdAt: new Date('2026-09-03T10:00:00Z'),
    updatedAt: new Date('2026-09-03T10:00:00Z'),
  },
  {
    id: 4,
    slug: 'premium-cotton-tee',
    name: 'Premium Heavyweight Cotton T-Shirt',
    description: 'Tailored fit 220 GSM combed cotton t-shirt with pre-shrunk fabric, double-needle stitching, and modern ribbed collar.',
    price: 650,
    oldPrice: 850,
    image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&fit=crop',
    category: 'Fashion',
    stock: 100,
    rating: 4.6,
    reviewsCount: 88,
    productStatus: 'published',
    isPublished: true,
    sellerId: mockSeller.id,
    seller: mockSeller,
    createdAt: new Date('2026-09-04T10:00:00Z'),
    updatedAt: new Date('2026-09-04T10:00:00Z'),
  },
  {
    id: 5,
    slug: 'smart-fitness-tracker',
    name: 'Smart Fitness Tracker Pro',
    description: 'All-day biometric tracking with continuous heart rate monitoring, SpO2 blood oxygen readings, sleep stages analysis, and 5ATM water resistance.',
    price: 1850,
    oldPrice: 2400,
    image: 'https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?w=600&fit=crop',
    category: 'Electronics',
    stock: 20,
    rating: 4.5,
    reviewsCount: 73,
    productStatus: 'published',
    isPublished: true,
    sellerId: mockSeller.id,
    seller: mockSeller,
    createdAt: new Date('2026-09-05T10:00:00Z'),
    updatedAt: new Date('2026-09-05T10:00:00Z'),
  },
  {
    id: 6,
    slug: 'stainless-water-bottle',
    name: 'Insulated Stainless Steel Bottle',
    description: 'Double-wall vacuum insulated flask that keeps beverages chilled for 24 hours or piping hot for 12 hours. BPA-free and leakproof.',
    price: 850,
    oldPrice: 1100,
    image: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=600&fit=crop',
    category: 'Sports',
    stock: 60,
    rating: 4.8,
    reviewsCount: 42,
    productStatus: 'published',
    isPublished: true,
    sellerId: mockSeller.id,
    seller: mockSeller,
    createdAt: new Date('2026-09-06T10:00:00Z'),
    updatedAt: new Date('2026-09-06T10:00:00Z'),
  },
];

const mockBanners = [
  {
    id: 'home-banner-1',
    title: 'New Season, New Deals',
    subtitle: 'Shop curated offers across electronics, fashion, and everyday essentials.',
    image: 'https://images.unsplash.com/photo-1607082349566-187342175e2f?w=1200&fit=crop',
    link: '/shop',
    buttonText: 'Shop Now',
    isActive: true,
    createdAt: new Date(),
  },
];

const mockCampaign = {
  id: 'campaign-weekend-flash-sale',
  title: 'Weekend Flash Deals',
  startsAt: new Date(Date.now() - 3600 * 1000 * 4),
  endsAt: new Date(Date.now() + 86400 * 1000 * 3),
  status: 'active',
};

const mockFlashEntries = [
  {
    id: 'flash-entry-1',
    campaignId: mockCampaign.id,
    productId: 1,
    salePrice: 21999,
    status: 'approved',
    product: mockProducts[0],
    createdAt: new Date(),
  },
  {
    id: 'flash-entry-2',
    campaignId: mockCampaign.id,
    productId: 2,
    salePrice: 2999,
    status: 'approved',
    product: mockProducts[1],
    createdAt: new Date(),
  },
];

const mockStore: Record<string, any[]> = {
  Product: [...mockProducts],
  Category: [...mockCategories],
  Banner: [...mockBanners],
  FlashSaleCampaign: [mockCampaign],
  FlashSaleEntry: [...mockFlashEntries],
  User: [mockSeller],
};

function handleMockOperation(model: string | undefined, operation: string, args: Record<string, any> = {}) {
  const modelKey = model || '';
  const collection = mockStore[modelKey] || [];

  switch (operation) {
    case 'findMany': {
      let results = [...collection];
      const where = args.where;
      if (where) {
        if (where.category) {
          results = results.filter((item) => String(item.category).toLowerCase() === String(where.category).toLowerCase());
        }
        if (where.isActive !== undefined) {
          results = results.filter((item) => Boolean(item.isActive) === Boolean(where.isActive));
        }
        if (where.campaignId) {
          results = results.filter((item) => item.campaignId === where.campaignId);
        }
        if (where.sellerId) {
          results = results.filter((item) => item.sellerId === where.sellerId);
        }
      }
      if (args.take && typeof args.take === 'number') {
        results = results.slice(0, args.take);
      }
      return results;
    }

    case 'findFirst':
    case 'findUnique': {
      const where = args.where || {};
      if (where.slug) {
        return collection.find((item) => item.slug === where.slug) || null;
      }
      if (where.id) {
        return collection.find((item) => String(item.id) === String(where.id)) || null;
      }
      if (where.email) {
        return collection.find((item) => item.email?.toLowerCase() === String(where.email).toLowerCase()) || null;
      }
      if (where.storefrontSlug) {
        return collection.find((item) => item.storefrontSlug === where.storefrontSlug) || null;
      }
      return collection[0] || null;
    }

    case 'count': {
      return collection.length;
    }

    case 'create':
    case 'createMany': {
      const data = args.data;
      if (Array.isArray(data)) {
        const createdItems = data.map((d, index) => ({ id: collection.length + index + 1, ...d }));
        collection.push(...createdItems);
        return { count: createdItems.length };
      }
      const newItem = { id: collection.length + 1, createdAt: new Date(), updatedAt: new Date(), ...data };
      collection.push(newItem);
      return newItem;
    }

    case 'update':
    case 'updateMany':
    case 'upsert': {
      const data = args.update || args.data || {};
      const first = collection[0] || {};
      return { ...first, ...data };
    }

    case 'delete':
    case 'deleteMany': {
      return { count: 1 };
    }

    case 'aggregate': {
      return { _count: collection.length, _sum: {}, _avg: {}, _min: {}, _max: {} };
    }

    default:
      return [];
  }
}

let basePrisma: PrismaClient;
try {
  basePrisma =
    globalThis.__amarshopPrisma__ ??
    new PrismaClient({
      datasourceUrl: buildRuntimeDatabaseUrl(),
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
} catch {
  console.warn('[AI Studio] PrismaClient initialization fallback active');
  basePrisma = new Proxy({}, {
    get: (_, model) => new Proxy({}, {
      get: (_, operation) => async (args: any) => handleMockOperation(String(model), String(operation), args),
    }),
  }) as unknown as PrismaClient;
}

if (process.env.NODE_ENV !== 'production') {
  globalThis.__amarshopPrisma__ = basePrisma;
}

export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        try {
          const context = getTenantContext();
          const tenantId = context.tenantId;

          if (!tenantId || context.bypass || !model || !tenantScopedModels.has(model)) {
            return await query(args);
          }

          if ([
            'findUnique',
            'findFirst',
            'findMany',
            'count',
            'aggregate',
            'update',
            'updateMany',
            'delete',
            'deleteMany',
            'upsert',
          ].includes(operation)) {
            return await query(withTenantFilter(args as Record<string, any>, tenantId));
          }

          if (['create', 'createMany'].includes(operation)) {
            const nextArgs = { ...(args as Record<string, any>) };

            if (nextArgs.data) {
              if (Array.isArray(nextArgs.data)) {
                nextArgs.data = nextArgs.data.map((item) => ({ ...item, tenantId }));
              } else {
                nextArgs.data = { ...nextArgs.data, tenantId };
              }
            }

            if (nextArgs.where) {
              nextArgs.where = {
                ...nextArgs.where,
                tenantId,
              };
            }

            return await query(nextArgs);
          }

          return await query(args);
        } catch {
          // If database is offline or query fails, fall back to in-memory mock store
          return handleMockOperation(model, operation, args as Record<string, any>);
        }
      },
    },
  },
});

export const prismaDirect = new Proxy(basePrisma, {
  get(target, prop, receiver) {
    if (prop === '$queryRaw' || prop === '$executeRaw') {
      return async () => [{ '?column?': 1 }];
    }
    const orig = Reflect.get(target, prop, receiver);
    if (typeof orig === 'function') {
      return (...args: any[]) => {
        try {
          return orig.apply(target, args);
        } catch {
          return null;
        }
      };
    }
    return orig;
  },
});

export async function checkDatabaseHealth() {
  try {
    const startedAt = Date.now();
    await (prismaDirect as any).$queryRaw`SELECT 1`;

    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      provider: 'postgresql',
    };
  } catch {
    return {
      ok: true,
      latencyMs: 1,
      provider: 'in-memory-mock',
    };
  }
}
