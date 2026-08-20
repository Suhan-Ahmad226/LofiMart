import React, { Suspense, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '../../../lib/navigation';
import {
  ArrowRight,
  Award,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  Gift,
  Headphones,
  Mail,
  PackageCheck,
  Percent,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Truck,
  Zap,
} from 'lucide-react';
import { ProductCard } from '@/features/shop/components/ProductCard';
import OptimizedImage from '@/features/shared/ui/OptimizedImage';
import { useCart } from '../../../features/shop/state/CartContext';
import { getCachedClientValue } from '../../../lib/client-cache';
import { formatPrice } from '../../../lib/utils';
import type { Product } from '../../../types';

type Category = {
  id: string | number;
  name: string;
  icon?: string | null;
};

type SellerShowcase = {
  id: string | number;
  name: string;
  rating: number;
  products: Product[];
};

type HomepageProductGroups = {
  flashSale: Product[];
  featured: Product[];
  bestSelling: Product[];
  newArrivals: Product[];
  trending: Product[];
};

type HomeBanner = {
  id: string | number;
  title: string;
  subtitle?: string | null;
  image: string;
  link?: string | null;
  buttonText?: string | null;
  button_text?: string | null;
};

const fallbackCategories: Category[] = [
  { id: 'electronics', name: 'Electronics' },
  { id: 'fashion', name: 'Fashion' },
  { id: 'home', name: 'Home & Living' },
  { id: 'beauty', name: 'Beauty' },
  { id: 'grocery', name: 'Groceries' },
  { id: 'sports', name: 'Sports' },
  { id: 'kids', name: 'Kids' },
  { id: 'automotive', name: 'Automotive' },
];

const fallbackBanner: HomeBanner = {
  id: 'fallback-home-banner',
  title: 'Premium deals from trusted marketplace sellers',
  subtitle: 'Discover fashion, electronics, beauty, home essentials, and daily offers from verified LofiMart stores.',
  image:
    'https://images.unsplash.com/photo-1607082349566-187342175e2f?auto=format&fit=crop&w=1920&q=80',
  link: '/shop',
  buttonText: 'Shop the marketplace',
  button_text: 'Shop the marketplace',
};

const categoryImages = [
  'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=720&q=80',
  'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=720&q=80',
  'https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?auto=format&fit=crop&w=720&q=80',
  'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=720&q=80',
  'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=720&q=80',
  'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=720&q=80',
  'https://images.unsplash.com/photo-1503919545889-aef636e10ad4?auto=format&fit=crop&w=720&q=80',
  'https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=720&q=80',
];

const brandNames = ['Northline', 'Aura Beauty', 'VoltEdge', 'Maison Home', 'Urban Thread', 'DailyFresh', 'KidzNest', 'FitCore'];

const reviews = [
  {
    name: 'Nadia Rahman',
    title: 'Verified fashion buyer',
    quote: 'The store badges, delivery updates, and easy checkout made the whole order feel very polished.',
  },
  {
    name: 'Arif Hossain',
    title: 'Electronics shopper',
    quote: 'I compared prices, checked seller ratings, and received the item the next day in Dhaka.',
  },
  {
    name: 'Samira Chowdhury',
    title: 'Home essentials buyer',
    quote: 'The product pages were clear, and the return policy was easy to understand before purchase.',
  },
];

const serviceHighlights = [
  { title: 'Verified sellers', detail: 'Curated stores with approval checks', icon: ShieldCheck },
  { title: 'Fast delivery', detail: 'City and nationwide courier options', icon: Truck },
  { title: 'Secure payments', detail: 'Cards, wallets, COD, and gateways', icon: CreditCard },
  { title: 'Easy returns', detail: 'Clear support for refund requests', icon: RefreshCcw },
  { title: 'Live support', detail: 'Help before and after checkout', icon: Headphones },
  { title: 'Quality picks', detail: 'Featured items from trusted catalogs', icon: PackageCheck },
];

const sectionKickerClass = 'section-kicker text-primary/80';

const emptyProductGroups: HomepageProductGroups = {
  flashSale: [],
  featured: [],
  bestSelling: [],
  newArrivals: [],
  trending: [],
};

function takeItems<T>(items: T[], start: number, count: number): T[] {
  const result: T[] = [];
  const end = Math.min(items.length, start + count);

  for (let index = start; index < end; index += 1) {
    result.push(items[index]);
  }

  return result;
}

function takeFirst<T>(items: T[], count: number): T[] {
  return takeItems(items, 0, count);
}

function getProductList(payload: unknown): Product[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.products)) return record.products;
  if (Array.isArray(record.items)) return record.items;
  if (Array.isArray(record.data)) return record.data;
  const data = record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : null;
  if (Array.isArray(data?.products)) return data.products;
  if (Array.isArray(data?.items)) return data.items;

  return [];
}

function getCategoryList(payload: unknown): Category[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.categories)) return record.categories;
  if (Array.isArray(record.data)) return record.data;
  const data = record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : null;
  if (Array.isArray(data?.categories)) return data.categories;

  return [];
}

function getBannerList(payload: unknown): HomeBanner[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.banners)) return record.banners;
  if (Array.isArray(record.data)) return record.data;
  const data = record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : null;
  if (Array.isArray(data?.banners)) return data.banners;

  return [];
}

function getHomepageProductGroups(payload: unknown, fallbackProducts: Product[]): HomepageProductGroups {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const homepage = record.homepage && typeof record.homepage === 'object' ? (record.homepage as Record<string, unknown>) : {};
  const homepageProducts =
    homepage.products && typeof homepage.products === 'object' ? (homepage.products as Record<string, unknown>) : null;
  const groups = record.groups && typeof record.groups === 'object' ? (record.groups as Record<string, unknown>) : null;
  const source = homepageProducts || groups;

  if (source) {
    return {
      flashSale: getProductList(source.flashSale),
      featured: getProductList(source.featured),
      bestSelling: getProductList(source.bestSelling),
      newArrivals: getProductList(source.newArrivals),
      trending: getProductList(source.trending),
    };
  }

  return {
    flashSale: takeItems(fallbackProducts, 0, 4),
    featured: takeItems(fallbackProducts, 4, 8),
    bestSelling: takeItems(fallbackProducts, 12, 6),
    newArrivals: takeItems(fallbackProducts, 18, 6),
    trending: takeItems(fallbackProducts, 24, 6),
  };
}

function getSellerShowcases(products: Product[] = []): SellerShowcase[] {
  const grouped = new Map<string, SellerShowcase>();
  const productList = Array.isArray(products) ? products : [];

  productList.forEach((product) => {
    const id = String(product.seller_id || product.store_name || product.seller_name || product.category || 'featured');
    const existing = grouped.get(id);

    if (existing) {
      existing.products.push(product);
      existing.rating = Math.max(existing.rating, Number(product.seller_rating || product.rating || 4.8));
      return;
    }

    grouped.set(id, {
      id,
      name: product.store_name || product.seller_name || `${product.category || 'Featured'} Store`,
      rating: Number(product.seller_rating || product.rating || 4.8),
      products: [product],
    });
  });

  return takeFirst(Array.from(grouped.values()), 6);
}

function getCountdown(target: number) {
  const distance = Math.max(0, target - Date.now());
  const hours = Math.floor(distance / (1000 * 60 * 60));
  const minutes = Math.floor((distance / (1000 * 60)) % 60);
  const seconds = Math.floor((distance / 1000) % 60);

  return { hours, minutes, seconds };
}

async function fetchJsonWithTimeout(url: string, signal: AbortSignal, timeoutMs = 6500) {
  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => timeoutController.abort(), timeoutMs);

  const abortForwarder = () => timeoutController.abort();
  signal.addEventListener('abort', abortForwarder, { once: true });

  try {
    const response = await fetch(url, {
      signal: timeoutController.signal,
      cache: 'force-cache',
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(payload?.error || 'Unable to load the storefront right now.');
    }

    return payload;
  } finally {
    window.clearTimeout(timeoutId);
    signal.removeEventListener('abort', abortForwarder);
  }
}

async function fetchHomepageData(signal: AbortSignal) {
  try {
    return await getCachedClientValue('home-page:v4', 5 * 60 * 1000, () => fetchJsonWithTimeout('/api/home', signal));
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    return fetchJsonWithTimeout('/api/home', signal, 9000);
  }
}

const ProductRail = memo(function ProductRail({
  products,
  loading,
  emptyTitle,
  compact = false,
}: {
  products: Product[];
  loading: boolean;
  emptyTitle: string;
  compact?: boolean;
}) {
  if (loading) {
    return (
      <div className="dashboard-chip-scroll -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:px-0 lg:grid-cols-6">
        {Array.from({ length: compact ? 6 : 8 }).map((_, index) => (
          <div key={index} className="h-72 min-w-[10.75rem] animate-pulse rounded-xl border border-slate-200 bg-white p-2 md:min-w-0">
            <div className="aspect-square rounded-lg bg-slate-100" />
            <div className="mt-3 h-3 w-5/6 rounded bg-slate-100" />
            <div className="mt-2 h-3 w-2/3 rounded bg-slate-100" />
            <div className="mt-5 h-9 rounded-lg bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="font-bold text-slate-900">{emptyTitle}</p>
        <p className="mt-2 text-sm text-slate-500">Publish more products to fill this marketplace row.</p>
      </div>
    );
  }

  return (
    <div className="dashboard-chip-scroll -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:px-0 lg:grid-cols-6">
      {products.map((product) => (
        <div key={product.id} className="min-w-[10.75rem] md:min-w-0">
          <ProductCard product={product} />
        </div>
      ))}
    </div>
  );
});

const FlashSaleCard = memo(function FlashSaleCard({ product }: { product: Product }) {
  const { addToCart } = useCart();
  const discount = useMemo(
    () => (product.old_price > product.price ? Math.max(1, Math.round(((product.old_price - product.price) / product.old_price) * 100)) : 12),
    [product.old_price, product.price],
  );
  const handleAddToCart = useCallback(() => addToCart(product), [addToCart, product]);

  return (
    <article className="group min-w-[11rem] overflow-hidden rounded-xl border border-rose-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg md:min-w-0">
      <Link to={`/product/${product.slug}`} className="relative block aspect-square bg-slate-100">
        <OptimizedImage
          src={product.image}
          alt={product.name}
          widthHint={420}
          heightHint={420}
          fit="fill"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <span className="absolute left-3 top-3 rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-white">
          -{discount}%
        </span>
      </Link>
      <div className="p-3">
        <Link to={`/product/${product.slug}`}>
          <h3 className="line-clamp-2 min-h-[2.25rem] text-sm font-bold leading-tight text-slate-950 hover:text-primary">
            {product.name}
          </h3>
        </Link>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-base font-bold text-accent">{formatPrice(product.price)}</span>
          {product.old_price > product.price ? (
            <span className="text-xs text-slate-400 line-through">{formatPrice(product.old_price)}</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleAddToCart}
          className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg bg-slate-950 text-xs font-bold text-white hover:bg-primary"
        >
          Grab deal
        </button>
      </div>
    </article>
  );
});

const SectionHeader = memo(function SectionHeader({
  kicker,
  title,
  action,
}: {
  kicker: string;
  title: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <p className={sectionKickerClass}>{kicker}</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950 md:text-3xl">{title}</h2>
      </div>
      {action ? (
        <Link to={action.href} className="hidden items-center gap-1 text-sm font-bold text-primary hover:text-primary-dark sm:inline-flex">
          {action.label}
          <ArrowRight size={16} />
        </Link>
      ) : null}
    </div>
  );
});

const CategoryCard = memo(function CategoryCard({ category, image }: { category: Category; image: string }) {
  return (
    <Link
      to={`/shop?category=${encodeURIComponent(category.name)}`}
      className="group min-w-[9.25rem] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm hover:-translate-y-1 hover:shadow-lg md:min-w-0"
    >
      <div className="aspect-[1.3] bg-slate-100">
        <OptimizedImage
          src={image}
          alt={category.name}
          widthHint={360}
          heightHint={280}
          fit="fill"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
      </div>
      <div className="p-3">
        <h3 className="truncate text-sm font-bold text-slate-950">{category.name}</h3>
        <p className="mt-1 text-xs text-slate-500">Curated picks</p>
      </div>
    </Link>
  );
});

const CountdownTimer = memo(function CountdownTimer({ initialTarget }: { initialTarget: number }) {
  const [target, setTarget] = useState(initialTarget);
  const [countdown, setCountdown] = useState(() => getCountdown(initialTarget));

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCountdown((current) => {
        const next = getCountdown(target);
        if (next.hours === 0 && next.minutes === 0 && next.seconds === 0) {
          const refreshedTarget = Date.now() + 8 * 60 * 60 * 1000;
          setTarget(refreshedTarget);
          return getCountdown(refreshedTarget);
        }
        return current.hours === next.hours && current.minutes === next.minutes && current.seconds === next.seconds ? current : next;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [target]);

  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <Clock3 size={18} className="text-accent" />
      {[countdown.hours, countdown.minutes, countdown.seconds].map((value, index) => (
        <span key={index} className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-bold tabular-nums text-white">
          {String(value).padStart(2, '0')}
        </span>
      ))}
    </div>
  );
});

class HomePageSectionBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="page-shell pb-9">
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="font-bold text-slate-900">This section is temporarily unavailable.</p>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}

const SectionSkeleton = memo(function SectionSkeleton({ heightClass = 'h-80' }: { heightClass?: string }) {
  return (
    <section className="page-shell pb-9" aria-hidden="true">
      <div className={`${heightClass} animate-pulse rounded-xl border border-slate-200 bg-white`} />
    </section>
  );
});

function DeferredSection({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shouldMount, setShouldMount] = useState(false);

  useEffect(() => {
    if (shouldMount) return undefined;

    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setShouldMount(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldMount(true);
          observer.disconnect();
        }
      },
      { rootMargin: '650px 0px' },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [shouldMount]);

  return (
    <div ref={ref}>
      <HomePageSectionBoundary>
        <Suspense fallback={fallback}>{shouldMount ? children : fallback}</Suspense>
      </HomePageSectionBoundary>
    </div>
  );
}

const FeaturedProductsSection = memo(function FeaturedProductsSection({
  products,
  loading,
}: {
  products: Product[];
  loading: boolean;
}) {
  return (
    <section className="page-shell pb-9" data-reveal>
      <SectionHeader kicker="Featured products" title="Editor's picks from live catalogs" action={{ label: 'See all', href: '/shop' }} />
      <ProductRail products={products} loading={loading} emptyTitle="Featured products will appear here." />
    </section>
  );
});

const FeaturedSellerCard = memo(function FeaturedSellerCard({ seller }: { seller: SellerShowcase }) {
  return (
    <Link
      to="/shop"
      className="min-w-[min(22rem,84vw)] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:-translate-y-1 hover:shadow-lg lg:min-w-0"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-950 text-white">
            {seller.products[0]?.image ? (
              <OptimizedImage
                src={seller.products[0].image}
                alt={seller.name}
                widthHint={120}
                heightHint={120}
                fit="fill"
                className="h-full w-full object-cover"
              />
            ) : (
              <Store size={24} />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold text-slate-950">{seller.name}</h3>
            <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-primary">
              <BadgeCheck size={14} />
              Verified marketplace store
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
          <Star size={14} fill="currentColor" />
          {seller.rating.toFixed(1)}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-4 gap-2">
        {takeFirst(seller.products, 4).map((product) => (
          <div key={product.id} className="aspect-square overflow-hidden rounded-lg bg-slate-100">
            <OptimizedImage
              src={product.image}
              alt={product.name}
              widthHint={160}
              heightHint={160}
              fit="fill"
              className="h-full w-full object-cover"
            />
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500">
        <span>{seller.products.length} listed items</span>
        <span className="font-bold text-slate-950">Visit store</span>
      </div>
    </Link>
  );
});

const FeaturedSellersSection = memo(function FeaturedSellersSection({
  sellers,
  loading,
}: {
  sellers: SellerShowcase[];
  loading: boolean;
}) {
  return (
    <section className="page-shell pb-9" data-reveal>
      <SectionHeader kicker="Featured sellers" title="Stores worth following" action={{ label: 'Browse stores', href: '/shop' }} />
      <div className="dashboard-chip-scroll -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-3 lg:px-0">
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-48 min-w-[min(22rem,82vw)] animate-pulse rounded-2xl border border-slate-200 bg-white lg:min-w-0" />
          ))
        ) : sellers.length > 0 ? (
          sellers.map((seller) => <FeaturedSellerCard key={seller.id} seller={seller} />)
        ) : (
          <div className="w-full rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="font-bold text-slate-900">Seller showcases will appear after products are published.</p>
            <p className="mt-2 text-sm text-slate-500">The home page is connected to the existing product API.</p>
          </div>
        )}
      </div>
    </section>
  );
});

const ProductRailSection = memo(function ProductRailSection({
  kicker,
  title,
  action,
  products,
  loading,
  emptyTitle,
}: {
  kicker: string;
  title: string;
  action: { label: string; href: string };
  products: Product[];
  loading: boolean;
  emptyTitle: string;
}) {
  return (
    <section className="page-shell pb-9" data-reveal>
      <SectionHeader kicker={kicker} title={title} action={action} />
      <ProductRail products={products} loading={loading} emptyTitle={emptyTitle} compact />
    </section>
  );
});

const BrandCard = memo(function BrandCard({ brand, index }: { brand: string; index: number }) {
  return (
    <Link
      to={`/shop?q=${encodeURIComponent(brand)}`}
      className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm hover:-translate-y-1 hover:shadow-lg"
    >
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-950 text-white">
        {index % 3 === 0 ? <Award size={22} /> : index % 3 === 1 ? <Sparkles size={22} /> : <Store size={22} />}
      </span>
      <span className="mt-3 block text-sm font-bold text-slate-950">{brand}</span>
      <span className="mt-1 block text-xs text-slate-500">Official store</span>
    </Link>
  );
});

const BrandsSection = memo(function BrandsSection() {
  return (
    <section className="page-shell pb-9" data-reveal>
      <SectionHeader kicker="Official brands" title="Brand storefronts and flagship picks" action={{ label: 'Shop brands', href: '/shop' }} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        {brandNames.map((brand, index) => (
          <BrandCard key={brand} brand={brand} index={index} />
        ))}
      </div>
    </section>
  );
});

const ReviewCard = memo(function ReviewCard({ review }: { review: (typeof reviews)[number] }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex gap-1 text-amber-400">
        {Array.from({ length: 5 }).map((_, index) => (
          <Star key={index} size={16} fill="currentColor" />
        ))}
      </div>
      <p className="text-sm leading-6 text-slate-700">"{review.quote}"</p>
      <div className="mt-5 border-t border-slate-100 pt-4">
        <h3 className="text-sm font-bold text-slate-950">{review.name}</h3>
        <p className="mt-1 text-xs text-slate-500">{review.title}</p>
      </div>
    </article>
  );
});

const ReviewsSection = memo(function ReviewsSection() {
  return (
    <section className="page-shell pb-9" data-reveal>
      <SectionHeader kicker="Customer reviews" title="Trusted by everyday shoppers" />
      <div className="grid gap-4 md:grid-cols-3">
        {reviews.map((review) => (
          <ReviewCard key={review.name} review={review} />
        ))}
      </div>
    </section>
  );
});

const NewsletterSection = memo(function NewsletterSection({
  email,
  message,
  submitting,
  onEmailChange,
  onSubmit,
}: {
  email: string;
  message: string;
  submitting: boolean;
  onEmailChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="page-shell pb-10" data-reveal>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm md:p-8">
        <div className="grid gap-6 md:grid-cols-[1fr_0.9fr] md:items-center">
          <div>
            <p className="section-kicker text-emerald-300">Newsletter</p>
            <h2 className="mt-3 text-2xl font-bold md:text-3xl">Get private drops, seller launches, and flash sale alerts.</h2>
            <div className="mt-5 flex flex-wrap gap-2 text-xs text-white/70">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5">
                <Gift size={14} />
                Weekly vouchers
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5">
                <Percent size={14} />
                Early sale access
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5">
                <Zap size={14} />
                New store alerts
              </span>
            </div>
          </div>
          <form onSubmit={onSubmit} className="rounded-xl bg-white p-3 shadow-lg">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => onEmailChange(event.target.value)}
                  placeholder="Enter your email"
                  autoComplete="email"
                  aria-label="Email address"
                  className="h-12 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-950 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-bold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? 'Joining...' : 'Subscribe'}
              </button>
            </div>
            {message ? (
              <p className="mt-2 px-1 text-xs font-semibold text-slate-600" aria-live="polite">
                {message}
              </p>
            ) : null}
          </form>
        </div>
      </div>
    </section>
  );
});

const LazyFeaturedProductsSection = React.lazy(() => Promise.resolve({ default: FeaturedProductsSection }));
const LazyFeaturedSellersSection = React.lazy(() => Promise.resolve({ default: FeaturedSellersSection }));
const LazyProductRailSection = React.lazy(() => Promise.resolve({ default: ProductRailSection }));
const LazyBrandsSection = React.lazy(() => Promise.resolve({ default: BrandsSection }));
const LazyReviewsSection = React.lazy(() => Promise.resolve({ default: ReviewsSection }));
const LazyNewsletterSection = React.lazy(() => Promise.resolve({ default: NewsletterSection }));

export const HomePage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [productGroups, setProductGroups] = useState<HomepageProductGroups>(emptyProductGroups);
  const [categories, setCategories] = useState<Category[]>(fallbackCategories);
  const [banners, setBanners] = useState<HomeBanner[]>([]);
  const [activeBannerIndex, setActiveBannerIndex] = useState(0);
  const [isBannerPaused, setIsBannerPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [countdownTarget] = useState(() => Date.now() + 7 * 60 * 60 * 1000 + 45 * 60 * 1000);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterMessage, setNewsletterMessage] = useState('');
  const [newsletterSubmitting, setNewsletterSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetchHomepageData(controller.signal)
      .then((payload) => {
        if (controller.signal.aborted) return;

        const nextProducts = getProductList(payload);
        const nextCategories = getCategoryList(payload);
        const nextBanners = getBannerList(payload);
        setProducts(nextProducts);
        setProductGroups(getHomepageProductGroups(payload, nextProducts));
        setCategories(nextCategories.length > 0 ? nextCategories : fallbackCategories);
        setBanners(nextBanners.filter((banner: HomeBanner) => banner?.image && banner?.title));
        setActiveBannerIndex(0);
      })
      .catch((fetchError) => {
        if ((fetchError as Error).name === 'AbortError') return;
        setProducts([]);
        setProductGroups(emptyProductGroups);
        setCategories(fallbackCategories);
        setBanners([]);
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to load the storefront.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  const safeProducts = useMemo(() => getProductList(products), [products]);
  const safeCategories = useMemo(() => getCategoryList(categories), [categories]);
  const safeBanners = useMemo(() => getBannerList(banners), [banners]);

  useEffect(() => {
    if (isBannerPaused || safeBanners.length < 2) return undefined;

    const intervalId = window.setInterval(() => {
      setActiveBannerIndex((current) => (current + 1) % safeBanners.length);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [isBannerPaused, safeBanners.length]);

  const heroBanners = safeBanners.length > 0 ? safeBanners : [fallbackBanner];
  const activeHeroIndex = activeBannerIndex < heroBanners.length ? activeBannerIndex : 0;
  const sellerShowcases = useMemo(() => getSellerShowcases(safeProducts), [safeProducts]);
  const visibleCategories = useMemo(
    () => takeFirst(safeCategories.length > 0 ? safeCategories : fallbackCategories, 8),
    [safeCategories],
  );

  const submitNewsletter = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = newsletterEmail.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setNewsletterMessage('Please enter a valid email address.');
      return;
    }

    setNewsletterSubmitting(true);
    setNewsletterMessage('');

    try {
      const response = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'homepage' }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || 'Could not join the newsletter right now.');
      }

      setNewsletterEmail('');
      setNewsletterMessage(payload?.alreadySubscribed ? 'You are already on the list.' : 'You are on the early deals list.');
    } catch (newsletterError) {
      setNewsletterMessage(newsletterError instanceof Error ? newsletterError.message : 'Could not join the newsletter right now.');
    } finally {
      setNewsletterSubmitting(false);
    }
  }, [newsletterEmail]);

  const updateNewsletterEmail = useCallback((value: string) => {
    setNewsletterEmail(value);
  }, []);

  const pauseBanner = useCallback(() => setIsBannerPaused(true), []);
  const resumeBanner = useCallback(() => setIsBannerPaused(false), []);
  const goToPreviousBanner = useCallback(() => {
    setActiveBannerIndex((current) => (heroBanners.length > 0 ? (current - 1 + heroBanners.length) % heroBanners.length : 0));
  }, [heroBanners.length]);
  const goToNextBanner = useCallback(() => {
    setActiveBannerIndex((current) => (heroBanners.length > 0 ? (current + 1) % heroBanners.length : 0));
  }, [heroBanners.length]);

  return (
    <div className="bg-[#f7fbf8] pb-8">
      <section className="page-shell pt-5" data-reveal>
        <div
          className="responsive-hero relative overflow-hidden rounded-2xl bg-slate-950 shadow-sm"
          onMouseEnter={pauseBanner}
          onMouseLeave={resumeBanner}
          onFocusCapture={pauseBanner}
          onBlurCapture={resumeBanner}
        >
          <div className="absolute inset-0">
            {heroBanners.map((banner, index) => (
              <div
                key={banner.id}
                className={`absolute inset-0 transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none ${
                  index === activeHeroIndex ? 'scale-100 opacity-100' : 'scale-[1.025] opacity-0'
                }`}
                aria-hidden={index !== activeHeroIndex}
              >
                <OptimizedImage
                  src={banner.image}
                  alt={banner.title}
                  widthHint={1920}
                  heightHint={760}
                  quality="auto:best"
                  fit="fill"
                  eager={index === 0 || index === activeBannerIndex}
                  showPlaceholder={false}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/32 to-slate-950/10 md:bg-gradient-to-r md:from-slate-950/84 md:via-slate-950/38 md:to-transparent" />
          </div>

          {heroBanners.map((banner, index) => {
            const buttonText = banner.button_text || banner.buttonText || 'Shop now';
            const link = banner.link || '/shop';
            const isActive = index === activeHeroIndex;

            return (
              <div
                key={`${banner.id}-content`}
                className={`absolute inset-y-0 left-0 z-10 flex w-full flex-col justify-center px-5 py-7 transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none sm:px-8 md:w-[58%] md:px-12 ${
                  isActive ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
                }`}
                aria-hidden={!isActive}
              >
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.28em] text-emerald-300 sm:text-[11px]">
                  Multi-vendor marketplace
                </p>
                <h1 className="responsive-hero-title max-w-2xl font-bold text-white">{banner.title}</h1>
                {banner.subtitle ? <p className="mt-4 max-w-md text-sm leading-6 text-white/76">{banner.subtitle}</p> : null}
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link
                    to={link}
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-950/25 hover:bg-primary-dark"
                    tabIndex={isActive ? 0 : -1}
                  >
                    {buttonText}
                    <ArrowRight size={16} />
                  </Link>
                  <Link
                    to="/flash-sale"
                    className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/12 px-5 py-3 text-sm font-bold text-white backdrop-blur hover:bg-white/18"
                    tabIndex={isActive ? 0 : -1}
                  >
                    Today's deals
                  </Link>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            aria-label="Previous promotion"
            onClick={goToPreviousBanner}
            disabled={heroBanners.length < 2}
            className="absolute left-4 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur hover:bg-white/20 md:flex"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="Next promotion"
            onClick={goToNextBanner}
            disabled={heroBanners.length < 2}
            className="absolute right-4 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-white/20 text-white backdrop-blur hover:bg-white/30 md:flex"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </section>

      <section className="page-shell py-8" data-reveal>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {serviceHighlights.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon size={20} />
                </span>
                <h3 className="text-sm font-bold text-slate-950">{item.title}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">{item.detail}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="page-shell pb-9" data-reveal>
        <SectionHeader kicker="Shop by categories" title="Explore popular departments" action={{ label: 'All categories', href: '/categories' }} />
        <div className="dashboard-chip-scroll -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:px-0 lg:grid-cols-8">
          {visibleCategories.map((category, index) => (
            <CategoryCard key={category.id} category={category} image={categoryImages[index % categoryImages.length]} />
          ))}
        </div>
      </section>

      <section className="page-shell pb-9" data-reveal>
        <div className="overflow-hidden rounded-2xl border border-rose-100 bg-[linear-gradient(135deg,#fff7f7,#ffffff_42%,#f7fbf8)] p-4 shadow-sm md:p-6">
          <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="section-kicker text-accent">Flash sale</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950 md:text-3xl">Limited-time marketplace deals</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <CountdownTimer initialTarget={countdownTarget} />
              <Link
                to="/flash-sale"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-bold text-white shadow-sm hover:bg-rose-600"
              >
                View all
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
              <p className="font-bold text-rose-900">Storefront data is unavailable</p>
              <p className="mt-2 text-sm text-rose-700">{error}</p>
            </div>
          ) : (
            <div className="dashboard-chip-scroll -mx-2 flex gap-3 overflow-x-auto px-2 pb-2 md:grid md:grid-cols-4 md:overflow-visible">
              {loading
                ? Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-72 min-w-[11rem] animate-pulse rounded-xl bg-white md:min-w-0" />
                  ))
                : productGroups.flashSale.map((product) => <FlashSaleCard key={product.id} product={product} />)}
            </div>
          )}
        </div>
      </section>

      <DeferredSection fallback={<SectionSkeleton />}>
        <LazyFeaturedProductsSection products={productGroups.featured} loading={loading} />
      </DeferredSection>

      <DeferredSection fallback={<SectionSkeleton heightClass="h-56" />}>
        <LazyFeaturedSellersSection sellers={sellerShowcases} loading={loading} />
      </DeferredSection>

      <DeferredSection fallback={<SectionSkeleton />}>
        <LazyProductRailSection
          kicker="Top selling products"
          title="Best movers this week"
          action={{ label: 'Shop bestsellers', href: '/shop?sort=popular' }}
          products={productGroups.bestSelling}
          loading={loading}
          emptyTitle="Top selling products will appear here."
        />
      </DeferredSection>

      <DeferredSection fallback={<SectionSkeleton />}>
        <LazyProductRailSection
          kicker="New arrivals"
          title="Fresh listings from sellers"
          action={{ label: 'View new', href: '/shop?sort=newest' }}
          products={productGroups.newArrivals}
          loading={loading}
          emptyTitle="New arrivals will appear here."
        />
      </DeferredSection>

      <DeferredSection fallback={<SectionSkeleton />}>
        <LazyProductRailSection
          kicker="Trending products"
          title="Popular searches and fast-rising picks"
          action={{ label: 'Explore trends', href: '/search' }}
          products={productGroups.trending}
          loading={loading}
          emptyTitle="Trending products will appear here."
        />
      </DeferredSection>

      <DeferredSection fallback={<SectionSkeleton heightClass="h-36" />}>
        <LazyBrandsSection />
      </DeferredSection>

      <DeferredSection fallback={<SectionSkeleton heightClass="h-52" />}>
        <LazyReviewsSection />
      </DeferredSection>

      <DeferredSection fallback={<SectionSkeleton heightClass="h-52" />}>
        <LazyNewsletterSection
          email={newsletterEmail}
          message={newsletterMessage}
          submitting={newsletterSubmitting}
          onEmailChange={updateNewsletterEmail}
          onSubmit={submitNewsletter}
        />
      </DeferredSection>

      {error && !loading ? (
        <section className="page-shell pb-8" data-reveal>
          <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <div>
              <Search className="mx-auto text-primary" size={26} />
              <p className="mt-3 font-bold text-slate-900">Storefront data is unavailable</p>
              <p className="mt-1 text-sm text-slate-500">{error}</p>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
};
