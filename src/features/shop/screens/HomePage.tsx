'use client';

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '../../../lib/navigation';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  Gift,
  Mail,
  Percent,
  RefreshCcw,
  ShieldCheck,
  Truck,
  Zap,
} from 'lucide-react';
import { ProductCard } from '@/features/shared/ui/product/ProductCard';
import OptimizedImage from '@/features/shared/ui/OptimizedImage';
import { getCachedClientValue } from '../../../lib/client-cache';
import type { Product } from '../../../types';
import type { HomepageInitialData } from './HomePage.data';

type Category = {
  id: string | number;
  name: string;
  icon?: string | null;
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

const categoryImagesByName: Record<string, string> = {
  electronics: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=720&q=80',
  fashion: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=720&q=80',
  'home & living': 'https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?auto=format&fit=crop&w=720&q=80',
  beauty: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=720&q=80',
  groceries: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=720&q=80',
  sports: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=720&q=80',
  kids: 'https://images.unsplash.com/photo-1503919545889-aef636e10ad4?auto=format&fit=crop&w=720&q=80',
  automotive: 'https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=720&q=80',
};

const serviceHighlights = [
  { title: 'Verified sellers', detail: 'Curated stores with approval checks', icon: ShieldCheck },
  { title: 'Fast delivery', detail: 'City and nationwide courier options', icon: Truck },
  { title: 'Secure payments', detail: 'Cards, wallets, COD, and gateways', icon: CreditCard },
  { title: 'Easy returns', detail: 'Clear support for refund requests', icon: RefreshCcw },
];

const sectionKickerClass = 'section-kicker text-primary/80';

const emptyProductGroups: HomepageProductGroups = {
  flashSale: [],
  featured: [],
  bestSelling: [],
  newArrivals: [],
  trending: [],
};

function takeFirst<T>(items: T[], count: number): T[] {
  return items.slice(0, count);
}

function filterRenderableBanners(banners: HomeBanner[]): HomeBanner[] {
  return banners.filter((banner) => Boolean(banner?.image) && Boolean(banner?.title));
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

function getCountdown(target: number) {
  const distance = Math.max(0, target - Date.now());
  const hours = Math.floor(distance / (1000 * 60 * 60));
  const minutes = Math.floor((distance / (1000 * 60)) % 60);
  const seconds = Math.floor((distance / 1000) % 60);

  return { hours, minutes, seconds };
}

async function fetchJsonWithTimeout(url: string, signal: AbortSignal, timeoutMs = 6500) {
  const timeoutController = new AbortController();
  let didTimeout = false;
  const timeoutId = window.setTimeout(() => {
    didTimeout = true;
    timeoutController.abort();
  }, timeoutMs);

  const abortForwarder = () => timeoutController.abort();
  signal.addEventListener('abort', abortForwarder, { once: true });

  try {
    const response = await fetch(url, {
      signal: timeoutController.signal,
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(payload?.error || 'Unable to load the storefront right now.');
    }

    return payload;
  } catch (error) {
    if (didTimeout) {
      throw new Error('The storefront took too long to respond. Please try again.');
    }
    if (signal.aborted) {
      const abortError = new Error('Request aborted.');
      abortError.name = 'AbortError';
      throw abortError;
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    signal.removeEventListener('abort', abortForwarder);
  }
}

const HOME_PRODUCTS_PAGE_SIZE = 12;
const FLASH_SALE_PAGE_SIZE = 4;

type ProductPagePayload = {
  products?: Product[];
  categories?: Category[];
  pagination?: {
    hasMore?: boolean;
  };
};

type BannerPayload = {
  data?: HomeBanner[];
};

type FlashSalePayload = {
  campaign?: {
    ends_at?: string | null;
  } | null;
  entries?: Array<{
    sale_price?: number;
    product?: Product | null;
  }>;
};

async function fetchProductPage(signal: AbortSignal, page: number) {
  const cacheKey = `home-products:v2:page:${page}`;
  return getCachedClientValue(
    cacheKey,
    60 * 1000,
    () =>
      fetchJsonWithTimeout(
        `/api/shop/products?limit=${HOME_PRODUCTS_PAGE_SIZE}&page=${page}`,
        signal,
        4000,
      ) as Promise<ProductPagePayload>,
  );
}

async function fetchBanners(signal: AbortSignal) {
  return getCachedClientValue(
    'home-banners:v2',
    5 * 60 * 1000,
    () =>
      fetchJsonWithTimeout('/api/v2/banners', signal, 2500) as Promise<BannerPayload>,
  );
}

async function fetchFlashSale(signal: AbortSignal) {
  return getCachedClientValue(
    'home-flash-sale:v2',
    60 * 1000,
    () =>
      fetchJsonWithTimeout(
        `/api/flash-sale/active?limit=${FLASH_SALE_PAGE_SIZE}&offset=0`,
        signal,
        2500,
      ) as Promise<FlashSalePayload>,
  );
}

async function fetchHomepageData(signal: AbortSignal) {
  const results = await Promise.allSettled([
    fetchProductPage(signal, 1),
    fetchBanners(signal),
    fetchFlashSale(signal),
  ]);

  const productPayload =
    results[0].status === 'fulfilled'
      ? results[0].value
      : { products: [], categories: [], pagination: { hasMore: false } };
  const bannerPayload =
    results[1].status === 'fulfilled' ? results[1].value : { data: [] };
  const flashPayload =
    results[2].status === 'fulfilled' ? results[2].value : { campaign: null, entries: [] };

  const flashSaleProducts = (flashPayload.entries ?? [])
    .map((entry) => {
      if (!entry.product) return null;
      const salePrice = Number(entry.sale_price);
      const currentPrice = Number(entry.product.price);
      if (!Number.isFinite(salePrice) || salePrice <= 0) return entry.product;

      return {
        ...entry.product,
        old_price: currentPrice,
        price: salePrice,
      };
    })
    .filter((product): product is Product => Boolean(product));

  return {
    products: productPayload.products ?? [],
    categories: productPayload.categories ?? [],
    hasMoreProducts: Boolean(productPayload.pagination?.hasMore),
    banners: bannerPayload.data ?? [],
    flashSaleEndsAt: flashPayload.campaign?.ends_at ?? null,
    flashSaleProducts,
  };
}

async function fetchMoreProducts(signal: AbortSignal, page: number) {
  const payload = await fetchProductPage(signal, page);
  return {
    products: payload.products ?? [],
    hasMore: Boolean(payload.pagination?.hasMore),
  };
}

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
      className="group min-w-[9.25rem] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_35px_-28px_rgba(15,23,42,0.45)] transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg md:min-w-0"
    >
      <div className="aspect-[1.3] bg-slate-100">
        <OptimizedImage
          src={image}
          alt={category.name}
          widthHint={360}
          heightHint={280}
          fit="fill"
          sizes="148px"
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

const CountdownTimer = memo(function CountdownTimer({ endsAt }: { endsAt?: string | null }) {
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const target = endsAt ? Date.parse(endsAt) : 0;
    if (!target || target <= Date.now()) {
      setCountdown({ hours: 0, minutes: 0, seconds: 0 });
      return undefined;
    }

    const update = () => setCountdown(getCountdown(target));
    update();
    const intervalId = window.setInterval(update, 1000);
    return () => window.clearInterval(intervalId);
  }, [endsAt]);

  const totalMinutes = countdown.hours * 60 + countdown.minutes;

  useEffect(() => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    setAnnouncement(
      hours > 0
        ? `${hours} hour${hours === 1 ? '' : 's'} and ${minutes} minute${minutes === 1 ? '' : 's'} remaining in the flash sale`
        : `${minutes} minute${minutes === 1 ? '' : 's'} and ${countdown.seconds} second${countdown.seconds === 1 ? '' : 's'} remaining in the flash sale`,
    );
  }, [totalMinutes, countdown.seconds]);

  const pad = (value: number) => String(value).padStart(2, '0');

  if (!endsAt) return null;

  return (
    <div role="timer" aria-label="Time remaining in the flash sale" className="flex items-center gap-1.5">
      <Clock3 size={18} className="text-accent" aria-hidden="true" />
      <span aria-hidden="true" className="rounded-lg bg-slate-950 px-2.5 py-2 text-sm font-bold tabular-nums text-white">
        {pad(countdown.hours)}
      </span>
      <span aria-hidden="true" className="font-bold text-slate-950">
        :
      </span>
      <span aria-hidden="true" className="rounded-lg bg-slate-950 px-2.5 py-2 text-sm font-bold tabular-nums text-white">
        {pad(countdown.minutes)}
      </span>
      <span aria-hidden="true" className="font-bold text-slate-950">
        :
      </span>
      <span aria-hidden="true" className="rounded-lg bg-slate-950 px-2.5 py-2 text-sm font-bold tabular-nums text-white">
        {pad(countdown.seconds)}
      </span>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
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
      <HomePageSectionBoundary>{shouldMount ? children : fallback}</HomePageSectionBoundary>
    </div>
  );
}

const DealsSection = memo(function DealsSection({
  products,
  loading,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  products: Product[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(12);

  useEffect(() => {
    setVisibleCount(12);
  }, [products]);

  const visibleProducts = useMemo(
    () => products.slice(0, visibleCount),
    [products, visibleCount],
  );

  const hasMoreProducts = visibleCount < products.length || hasMore;

  if (loading) {
    return (
      <section className="page-shell pb-9" data-reveal>
        <SectionHeader
          kicker="Recommended for you"
          title="Just For You"
          action={{
            label: 'View All Products',
            href: '/shop',
          }}
        />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, index) => (
            <div
              key={index}
              className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white"
            >
              <div className="aspect-square rounded-t-xl bg-slate-100" />

              <div className="p-3">
                <div className="h-3 w-5/6 rounded bg-slate-100" />
                <div className="mt-2 h-3 w-2/3 rounded bg-slate-100" />
                <div className="mt-4 h-4 w-1/2 rounded bg-slate-100" />
                <div className="mt-4 h-9 rounded-lg bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (products.length === 0) {
    return (
      <section className="page-shell pb-9" data-reveal>
        <SectionHeader
          kicker="Recommended for you"
          title="Just For You"
          action={{
            label: 'View All Products',
            href: '/shop',
          }}
        />

        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-bold text-slate-900">
            No products available right now.
          </p>

          <p className="mt-2 text-sm text-slate-500">
            New products will appear here as sellers publish their items.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="page-shell pb-9" data-reveal>
      <SectionHeader
        kicker="Recommended for you"
        title="Just For You"
        action={{
          label: 'View All Products',
          href: '/shop',
        }}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        {visibleProducts.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            variant="default"
          />
        ))}
      </div>

      {hasMoreProducts && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="inline-flex min-w-48 items-center justify-center rounded-full border-2 border-primary/20 bg-white px-8 py-3 text-sm font-bold text-primary transition-all duration-200 hover:border-primary hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMore ? 'Loading...' : 'Load More Products'}
          </button>
        </div>
      )}

      {!hasMore && products.length > 12 && (
        <div className="mt-8 text-center">
          <p className="text-sm font-medium text-slate-500">
            You&apos;ve reached the end of the products.
          </p>
        </div>
      )}
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
                  disabled={submitting}
                  className="h-12 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-950 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-70"
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

export const HomePage = ({ initialData }: { initialData?: HomepageInitialData }) => {
  const [products, setProducts] = useState<Product[]>(initialData?.products ?? []);
  const [productGroups, setProductGroups] = useState<HomepageProductGroups>({
    flashSale: initialData?.flashSaleProducts ?? [],
    featured: [],
    bestSelling: [],
    newArrivals: [],
    trending: [],
  });
  const [hasMoreProducts, setHasMoreProducts] = useState(Boolean(initialData?.hasMoreProducts));
  const [loadingMoreProducts, setLoadingMoreProducts] = useState(false);
  const [productPage, setProductPage] = useState(1);
  const [categories, setCategories] = useState<Category[]>(
    initialData?.categories && initialData.categories.length > 0
      ? initialData.categories
      : fallbackCategories,
  );
  const [banners, setBanners] = useState<HomeBanner[]>(
    initialData ? filterRenderableBanners(initialData.banners) : [],
  );
  const [flashSaleEndsAt, setFlashSaleEndsAt] = useState<string | null>(
    initialData?.flashSaleEndsAt ?? null,
  );
  const [activeBannerIndex, setActiveBannerIndex] = useState(0);
  const [isBannerPaused, setIsBannerPaused] = useState(false);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState('');
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterMessage, setNewsletterMessage] = useState('');
  const [newsletterSubmitting, setNewsletterSubmitting] = useState(false);

  const renderedFromServer = useRef(Boolean(initialData));

  useEffect(() => {
    if (renderedFromServer.current) {
      return;
    }

    const controller = new AbortController();

    fetchHomepageData(controller.signal)
      .then((payload) => {
        if (controller.signal.aborted) return;

        setProducts(payload.products);
        setHasMoreProducts(payload.hasMoreProducts);
        setProductPage(1);
        setCategories(payload.categories.length > 0 ? payload.categories : fallbackCategories);
        setBanners(filterRenderableBanners(payload.banners));
        setProductGroups({
          flashSale: payload.flashSaleProducts,
          featured: [],
          bestSelling: [],
          newArrivals: [],
          trending: [],
        });
        setFlashSaleEndsAt(payload.flashSaleEndsAt);
        setActiveBannerIndex(0);
        setError('');
      })
      .catch((fetchError) => {
        if ((fetchError as Error).name === 'AbortError') return;
        setProducts([]);
        setProductGroups(emptyProductGroups);
        setCategories(fallbackCategories);
        setBanners([]);
        setFlashSaleEndsAt(null);
        setHasMoreProducts(false);
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to load the storefront.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  const loadMoreProducts = useCallback(async () => {
    if (loadingMoreProducts || !hasMoreProducts) return;

    const controller = new AbortController();
    setLoadingMoreProducts(true);

    try {
      const nextPage = productPage + 1;
      const payload = await fetchMoreProducts(controller.signal, nextPage);
      setProducts((current) => {
        const existingIds = new Set(current.map((product) => product.id));
        return [...current, ...payload.products.filter((product) => !existingIds.has(product.id))];
      });
      setHasMoreProducts(payload.hasMore);
      setProductPage(nextPage);
    } catch (loadMoreError) {
      if ((loadMoreError as Error).name !== 'AbortError') {
        setError(loadMoreError instanceof Error ? loadMoreError.message : 'Could not load more products.');
      }
    } finally {
      setLoadingMoreProducts(false);
    }
  }, [hasMoreProducts, loadingMoreProducts, productPage]);

  useEffect(() => {
    if (isBannerPaused || banners.length < 2) return undefined;

    const intervalId = window.setInterval(() => {
      setActiveBannerIndex((current) => (current + 1) % banners.length);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [isBannerPaused, banners.length]);

  const heroBanners = banners.length > 0 ? banners : [fallbackBanner];
  const activeHeroIndex = activeBannerIndex < heroBanners.length ? activeBannerIndex : 0;
  const activeBanner = heroBanners[activeHeroIndex] ?? fallbackBanner;
  const visibleCategories = takeFirst(categories.length > 0 ? categories : fallbackCategories, 8);
  const getCategoryImage = useCallback((category: Category, index: number) => {
    const key = category.name.trim().toLowerCase();
    return categoryImagesByName[key] ?? Object.values(categoryImagesByName)[index % Object.keys(categoryImagesByName).length];
  }, []);

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
    setActiveBannerIndex((current) => (heroBanners.length > 1 ? (current - 1 + heroBanners.length) % heroBanners.length : 0));
  }, [heroBanners.length]);
  const goToNextBanner = useCallback(() => {
    setActiveBannerIndex((current) => (heroBanners.length > 1 ? (current + 1) % heroBanners.length : 0));
  }, [heroBanners.length]);
  const goToBanner = useCallback((index: number) => {
    setActiveBannerIndex(index);
  }, []);

  return (
    <div className="bg-[#f7fbf8] pb-8">
      <section className="page-shell pt-5" data-reveal>
        <div
          role="region"
          aria-roledescription="carousel"
          aria-label="Promotions"
          className="responsive-hero relative overflow-hidden rounded-[1.5rem] bg-slate-950 shadow-lg shadow-slate-900/10 md:rounded-[1.75rem]"
          onMouseEnter={pauseBanner}
          onMouseLeave={resumeBanner}
          onFocusCapture={pauseBanner}
          onBlurCapture={resumeBanner}
        >
          <div className="absolute inset-0" key={activeBanner.id}>
            <OptimizedImage
              src={activeBanner.image}
              alt={activeBanner.title}
              widthHint={1920}
              heightHint={760}
              quality="auto:best"
              fit="fill"
              eager
              showPlaceholder={false}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/32 to-slate-950/10 md:bg-gradient-to-r md:from-slate-950/84 md:via-slate-950/38 md:to-transparent" />
          </div>

          <div className="absolute inset-y-0 left-0 z-10 flex w-full flex-col justify-center px-5 py-8 sm:px-8 md:w-[58%] md:px-12">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.28em] text-emerald-300 sm:text-[11px]">
              Multi-vendor marketplace
            </p>
            <h1 className="responsive-hero-title max-w-2xl font-bold text-white">{activeBanner.title}</h1>
            {activeBanner.subtitle ? <p className="mt-4 max-w-md text-sm leading-6 text-white/76">{activeBanner.subtitle}</p> : null}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                to={activeBanner.link || '/shop'}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-950/25 hover:bg-primary-dark"
              >
                {activeBanner.button_text || activeBanner.buttonText || 'Shop now'}
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/flash-sale"
                className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/12 px-5 py-3 text-sm font-bold text-white backdrop-blur hover:bg-white/18"
              >
                Today&apos;s deals
              </Link>
            </div>
          </div>

          {heroBanners.length > 1 ? (
            <>
              <button
                type="button"
                aria-label="Previous promotion"
                onClick={goToPreviousBanner}
                className="absolute left-4 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur hover:bg-white/20 md:flex"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                aria-label="Next promotion"
                onClick={goToNextBanner}
                className="absolute right-4 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-white/20 text-white backdrop-blur hover:bg-white/30 md:flex"
              >
                <ChevronRight size={18} />
              </button>
              <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 md:bottom-4">
                {heroBanners.map((banner, index) => (
                  <button
                    key={banner.id}
                    type="button"
                    onClick={() => goToBanner(index)}
                    aria-label={`Go to promotion ${index + 1}: ${banner.title}`}
                    aria-current={index === activeHeroIndex ? 'true' : undefined}
                    className={`flex h-6 w-6 items-center justify-center rounded-full ${
                      index === activeHeroIndex ? 'text-white' : 'text-white/45 hover:text-white/80'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-current" />
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </section>

      <section className="page-shell py-8" data-reveal>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {serviceHighlights.map((item) => {
            const Icon = item.icon;

            return (
              <div
                key={item.title}
                className="flex min-h-[92px] items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_30px_-22px_rgba(15,23,42,0.35)] transition-transform duration-200 hover:-translate-y-0.5 hover:border-primary/15 md:p-5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon size={20} />
                </span>

                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-950">
                    {item.title}
                  </h3>

                  <p className="mt-0.5 text-xs leading-5 text-slate-500">
                    {item.detail}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="page-shell pb-9" data-reveal>
        <div className="overflow-hidden rounded-[1.5rem] border border-rose-100/80 bg-[linear-gradient(135deg,#fff7f7,#ffffff_42%,#f7fbf8)] p-4 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.4)] md:p-6">
          <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="section-kicker text-accent">Flash sale</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950 md:text-3xl">Limited-time marketplace deals</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <CountdownTimer endsAt={flashSaleEndsAt} />
              <Link
                to="/flash-sale"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-rose-500 px-4 text-sm font-bold text-white shadow-sm hover:bg-rose-600"
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
          ) : loading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-72 animate-pulse rounded-lg bg-white" />
              ))}
            </div>
          ) : productGroups.flashSale.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
              {productGroups.flashSale.map((product) => (
                <div key={product.id} className="min-w-0">
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-rose-200 bg-white/70 px-6 py-8 text-center">
              <p className="text-sm font-bold text-rose-900">Flash sale deals are being prepared.</p>
              <p className="mt-1 text-xs text-slate-500">New limited-time offers will appear here soon.</p>
            </div>
          )}
        </div>
      </section>

      <section className="page-shell pb-9" data-reveal>
        <SectionHeader kicker="Shop by categories" title="Explore popular departments" action={{ label: 'All categories', href: '/categories' }} />
        <div className="dashboard-chip-scroll -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:px-0 lg:grid-cols-8">
          {visibleCategories.map((category, index) => (
            <CategoryCard key={category.id} category={category} image={getCategoryImage(category, index)} />
          ))}
        </div>
      </section>

      <DeferredSection fallback={<SectionSkeleton heightClass="h-[38rem] md:h-80" />}>
        <DealsSection
          products={products}
          loading={loading}
          hasMore={hasMoreProducts}
          loadingMore={loadingMoreProducts}
          onLoadMore={loadMoreProducts}
        />
      </DeferredSection>

      <DeferredSection fallback={<SectionSkeleton heightClass="h-52" />}>
        <NewsletterSection
          email={newsletterEmail}
          message={newsletterMessage}
          submitting={newsletterSubmitting}
          onEmailChange={updateNewsletterEmail}
          onSubmit={submitNewsletter}
        />
      </DeferredSection>
    </div>
  );
};
