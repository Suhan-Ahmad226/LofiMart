import React, { useEffect, useMemo, useState } from 'react';
import { Link } from '../../../lib/navigation';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Leaf,
  Search,
  ShieldCheck,
  Star,
  Store,
} from 'lucide-react';
import { ProductCard } from '../../../components/ProductCard';
import OptimizedImage from '../../../components/ui/OptimizedImage';
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
];

const categoryGradients = [
  'from-slate-800/55 via-slate-900/15 to-transparent',
  'from-amber-900/45 via-amber-900/10 to-transparent',
  'from-emerald-900/45 via-emerald-900/10 to-transparent',
  'from-rose-900/45 via-rose-900/10 to-transparent',
  'from-sky-900/45 via-sky-900/10 to-transparent',
  'from-lime-900/45 via-lime-900/10 to-transparent',
];

const sectionKickerClass = 'text-[11px] font-bold uppercase tracking-[0.34em] text-primary/80';
const fallbackBanner: HomeBanner = {
  id: 'fallback-home-banner',
  title: 'Welcome to LofiMart',
  subtitle: 'Explore fresh collections, trusted sellers, and fast-moving marketplace highlights.',
  image:
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1920&q=80',
  link: '/shop',
  buttonText: 'Browse shop',
  button_text: 'Browse shop',
};

function getProductList(payload: unknown): Product[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const record = payload as Record<string, any>;
  if (Array.isArray(record.products)) return record.products;
  if (Array.isArray(record.items)) return record.items;
  if (Array.isArray(record.data)) return record.data;
  if (Array.isArray(record.data?.products)) return record.data.products;
  if (Array.isArray(record.data?.items)) return record.data.items;

  return [];
}

function getCategoryList(payload: unknown): Category[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const record = payload as Record<string, any>;
  if (Array.isArray(record.categories)) return record.categories;
  if (Array.isArray(record.data)) return record.data;
  if (Array.isArray(record.data?.categories)) return record.data.categories;

  return [];
}

function getBannerList(payload: unknown): HomeBanner[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const record = payload as Record<string, any>;
  if (Array.isArray(record.banners)) return record.banners;
  if (Array.isArray(record.data)) return record.data;
  if (Array.isArray(record.data?.banners)) return record.data.banners;

  return [];
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

  return Array.from(grouped.values()).slice(0, 6);
}

function CompactProductCard({ product }: { product: Product }) {
  const { addToCart } = useCart();

  return (
    <article className="group flex min-h-[17.25rem] flex-col rounded-lg border border-slate-200 bg-white p-2 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link to={`/product/${product.slug}`} className="block overflow-hidden rounded-md bg-slate-100">
        <div className="aspect-square">
          <OptimizedImage
            src={product.image}
            alt={product.name}
            widthHint={320}
            heightHint={320}
            fit="fill"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        </div>
      </Link>

      <div className="flex flex-1 flex-col px-1 pb-1 pt-2">
        <Link to={`/product/${product.slug}`} className="block">
          <h3 className="line-clamp-2 min-h-[2.3rem] text-[13px] font-bold leading-[1.15] text-slate-950 transition hover:text-primary">
            {product.name}
          </h3>
        </Link>

        <div className="mt-1 flex items-center gap-1 overflow-hidden text-[12px] font-bold text-slate-950">
          <span>{formatPrice(product.price)}</span>
          {product.old_price > product.price ? (
            <span className="truncate text-[11px] font-semibold text-slate-400 line-through">{formatPrice(product.old_price)}</span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => addToCart(product)}
          className="mt-auto inline-flex h-9 w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-950 transition hover:border-primary/30 hover:bg-primary hover:text-white"
        >
          Add to Cart
        </button>
      </div>
    </article>
  );
}

export const HomePage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>(fallbackCategories);
  const [banners, setBanners] = useState<HomeBanner[]>([]);
  const [activeBannerIndex, setActiveBannerIndex] = useState(0);
  const [isBannerPaused, setIsBannerPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError('');

    const loadBanners = async () => {
      try {
        const response = await fetch('/api/v2/banners', {
          signal: controller.signal,
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to load banners right now.');
        }

        const nextBanners = getBannerList(payload);
        if (!controller.signal.aborted) {
          setBanners(nextBanners.filter((banner: HomeBanner) => banner?.image && banner?.title));
          setActiveBannerIndex(0);
        }
      } catch (bannerError) {
        if ((bannerError as Error).name !== 'AbortError') {
          setBanners([]);
        }
      }
    };

    void loadBanners();

    Promise.all([
      getCachedClientValue('home-products:v3', 5 * 60 * 1000, async () => {
        const response = await fetch('/api/products?limit=30', {
          signal: controller.signal,
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to load products right now.');
        }
        return payload;
      }),
      getCachedClientValue('home-categories:v2', 15 * 60 * 1000, async () => {
        const response = await fetch('/api/v2/categories', {
          signal: controller.signal,
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to load categories right now.');
        }
        return payload;
      }),
    ])
      .then(([productPayload, categoryPayload]) => {
        if (controller.signal.aborted) return;

        const nextProducts = getProductList(productPayload);
        const nextCategories = getCategoryList(categoryPayload);
        setProducts(nextProducts);
        setCategories(nextCategories.length > 0 ? nextCategories : fallbackCategories);
      })
      .catch((fetchError) => {
        if ((fetchError as Error).name === 'AbortError') return;
        setProducts([]);
        setCategories(fallbackCategories);
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to load the storefront.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  const safeProducts = getProductList(products);
  const safeCategories = getCategoryList(categories);
  const safeBanners = getBannerList(banners);

  useEffect(() => {
    if (activeBannerIndex < safeBanners.length) return;
    setActiveBannerIndex(0);
  }, [activeBannerIndex, safeBanners.length]);

  useEffect(() => {
    if (isBannerPaused || safeBanners.length < 2) return undefined;

    const intervalId = window.setInterval(() => {
      setActiveBannerIndex((current) => (current + 1) % safeBanners.length);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [isBannerPaused, safeBanners.length]);

  const activeBanner = safeBanners[activeBannerIndex] || null;
  const heroBanners = safeBanners.length > 0 ? safeBanners : [fallbackBanner];
  const sellerShowcases = useMemo(() => getSellerShowcases(safeProducts), [safeProducts]);
  const categoryShowcases = safeCategories.slice(0, 4).map((category) => ({
    ...category,
    image:
      safeProducts.find((product) => product.category?.toLowerCase() === category.name.toLowerCase())?.image ||
      safeProducts[0]?.image,
  }));
  const topSellingProducts = safeProducts.slice(0, 6);
  const featuredGridProducts = safeProducts.slice(0, 18);
  const newArrivalProducts = safeProducts.slice(18, 24).length > 0 ? safeProducts.slice(18, 24) : safeProducts.slice(6, 12);

  return (
    <div className="bg-[#f7fbf8] pb-8">
      {activeBanner || safeBanners.length === 0 ? (
        <section className="page-shell pt-5">
          <div
            className="responsive-hero relative overflow-hidden rounded-2xl bg-emerald-50 shadow-sm"
            onMouseEnter={() => setIsBannerPaused(true)}
            onMouseLeave={() => setIsBannerPaused(false)}
            onFocusCapture={() => setIsBannerPaused(true)}
            onBlurCapture={() => setIsBannerPaused(false)}
          >
            <div className="absolute inset-0 bg-emerald-50">
              {heroBanners.map((banner, index) => (
                <div
                  key={banner.id}
                  className={`absolute inset-0 transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none ${
                    index === activeBannerIndex ? 'scale-100 opacity-100' : 'scale-[1.025] opacity-0'
                  }`}
                  aria-hidden={index !== activeBannerIndex}
                >
                  <div className="absolute inset-0 z-10">
                    <OptimizedImage
                      src={banner.image}
                      alt={banner.title}
                      widthHint={1920}
                      heightHint={760}
                      quality="auto:best"
                      fit="fill"
                      eager={index === 0 || index === activeBannerIndex}
                      showPlaceholder={false}
                      className="h-full w-full object-contain object-center"
                    />
                  </div>
                </div>
              ))}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/72 via-slate-950/18 to-white/6 md:bg-gradient-to-r md:from-slate-950/74 md:via-slate-950/34 md:to-white/8" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_22%,rgba(16,185,129,0.12),transparent_32%)]" />
            </div>

            {heroBanners.map((banner, index) => {
              const buttonText = banner.button_text || banner.buttonText || 'Shop now';
              const link = banner.link || '/shop';
              const isActive = index === activeBannerIndex;

              return (
                <div
                  key={`${banner.id}-content`}
                  className={`absolute inset-y-0 left-0 z-10 hidden w-[56%] flex-col justify-center px-[clamp(1.5rem,5vw,3.5rem)] py-8 transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none md:flex ${
                    isActive ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
                  }`}
                  aria-hidden={!isActive}
                >
                  <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.28em] text-emerald-300 sm:text-[11px] sm:tracking-[0.34em]">
                    Promotional
                  </p>
                  <h1 className="responsive-hero-title max-w-xl font-bold text-white">{banner.title}</h1>
                  {banner.subtitle ? (
                    <p className="mt-4 max-w-md text-sm leading-6 text-white/72">{banner.subtitle}</p>
                  ) : null}
                  <Link
                    to={link}
                    className="mt-7 inline-flex w-fit items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-950/25 transition hover:bg-primary-dark"
                    tabIndex={isActive ? 0 : -1}
                  >
                    {buttonText}
                    <ArrowRight size={16} />
                  </Link>
                </div>
              );
            })}

          <button
            type="button"
            aria-label="Previous promotion"
            onClick={() =>
              setActiveBannerIndex((current) =>
                heroBanners.length > 0 ? (current - 1 + heroBanners.length) % heroBanners.length : 0,
              )
            }
            disabled={heroBanners.length < 2}
            className="absolute left-4 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur transition hover:bg-white/20 md:flex"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="Next promotion"
            onClick={() =>
              setActiveBannerIndex((current) => (heroBanners.length > 0 ? (current + 1) % heroBanners.length : 0))
            }
            disabled={heroBanners.length < 2}
            className="absolute right-4 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-emerald-950/10 bg-white/35 text-emerald-950 backdrop-blur transition hover:bg-white/60 md:flex"
          >
            <ChevronRight size={18} />
          </button>

          <div className="absolute bottom-5 left-1/2 z-20 hidden -translate-x-1/2 items-center gap-2 md:flex">
            {heroBanners.map((_, dot) => (
              <button
                key={dot}
                type="button"
                aria-label={`Show promotion ${dot + 1}`}
                onClick={() => setActiveBannerIndex(dot)}
                className={dot === activeBannerIndex ? 'h-1.5 w-8 rounded-full bg-primary' : 'h-1.5 w-1.5 rounded-full bg-white/65'}
              />
            ))}
          </div>
          </div>
        </section>
      ) : null}

      <section className="page-shell py-8">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className={sectionKickerClass}>Top marketplace sellers</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-950">Top Marketplace Sellers</h2>
          </div>
          <Link to="/shop" className="hidden text-sm font-bold text-primary hover:text-primary-dark sm:block">
            Browse all stores
          </Link>
        </div>

        <div className="dashboard-chip-scroll -mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-40 min-w-[min(22rem,82vw)] animate-pulse rounded-2xl border border-slate-200 bg-white" />
            ))
          ) : sellerShowcases.length > 0 ? (
            sellerShowcases.map((seller, sellerIndex) => (
              <Link
                key={seller.id}
                to="/shop"
                className="min-w-[min(21rem,82vw)] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg sm:min-w-[24rem]"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary">
                      {seller.products[0]?.image ? (
                        <OptimizedImage
                          src={seller.products[0].image}
                          alt={seller.name}
                          widthHint={96}
                          heightHint={96}
                          fit="fill"
                          className="h-full w-full object-cover"
                        />
                      ) : sellerIndex === 0 ? (
                        <Leaf size={24} />
                      ) : (
                        <Store size={22} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-bold text-slate-950">{seller.name}</h3>
                      <p className="text-xs text-slate-500">Featured stores</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-bold text-slate-800">
                    <Star size={14} fill="currentColor" className="text-amber-400" />
                    {seller.rating.toFixed(1)}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {seller.products.slice(0, 4).map((product) => (
                    <div key={product.id} className="aspect-square overflow-hidden rounded-xl bg-slate-100">
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
              </Link>
            ))
          ) : (
            <div className="w-full rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="font-bold text-slate-900">Seller showcases will appear after products are published.</p>
              <p className="mt-2 text-sm text-slate-500">The home page is connected to the existing product API.</p>
            </div>
          )}
        </div>
      </section>

      <section className="page-shell pb-8">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className={sectionKickerClass}>Shop by category</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-950">Category Picks</h2>
          </div>
          <Link to="/shop" className="hidden text-sm font-bold text-primary hover:text-primary-dark sm:block">
            Open full shop
          </Link>
        </div>

        <div className="responsive-grid">
          {categoryShowcases.map((category, index) => (
            <Link
              key={category.id}
              to={`/shop?category=${encodeURIComponent(category.name)}`}
              className="group relative aspect-[1.72] overflow-hidden rounded-2xl bg-slate-200 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
            >
              {category.image ? (
                <OptimizedImage
                  src={category.image}
                  alt={category.name}
                  widthHint={560}
                  heightHint={320}
                  fit="fill"
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-emerald-100 to-slate-200" />
              )}
              <div className={`absolute inset-0 bg-gradient-to-r ${categoryGradients[index % categoryGradients.length]}`} />
              <h3 className="absolute left-4 top-4 text-xl font-bold text-white drop-shadow-sm">{category.name}</h3>
            </Link>
          ))}
        </div>
      </section>

      <section className="page-shell pb-9">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className={sectionKickerClass}>Top selling products</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-950">Top Selling Products</h2>
          </div>
          <Link to="/shop" className="hidden text-sm font-bold text-primary hover:text-primary-dark sm:block">
            Shop bestsellers
          </Link>
        </div>

        {loading ? (
          <div className="responsive-grid-tight">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-3">
                <div className="aspect-square rounded-xl bg-slate-100" />
                <div className="mt-3 h-3 w-4/5 rounded bg-slate-100" />
                <div className="mt-2 h-3 w-3/5 rounded bg-slate-100" />
                <div className="mt-3 h-9 rounded-xl bg-slate-100" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
            <p className="font-bold text-rose-900">Storefront data is unavailable</p>
            <p className="mt-2 text-sm text-rose-700">{error}</p>
          </div>
        ) : topSellingProducts.length > 0 ? (
          <div className="responsive-grid-tight">
            {topSellingProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="font-bold text-slate-900">No published products yet</p>
            <p className="mt-2 text-sm text-slate-500">Add products from the seller or admin panel to fill this section.</p>
          </div>
        )}
      </section>

      <section className="page-shell pb-4">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-3xl font-bold text-slate-950">New Arrivals</h2>
          <Link to="/shop" className="hidden text-sm font-bold text-primary hover:text-primary-dark sm:block">
            View all
          </Link>
        </div>

        {loading ? (
          <div className="responsive-grid-tight mb-9">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="min-h-[17.25rem] animate-pulse rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
                <div className="aspect-square rounded-md bg-slate-100" />
                <div className="mt-3 h-3 w-5/6 rounded bg-slate-100" />
                <div className="mt-2 h-3 w-2/3 rounded bg-slate-100" />
                <div className="mt-4 h-9 rounded-lg bg-slate-100" />
              </div>
            ))}
          </div>
        ) : newArrivalProducts.length > 0 ? (
          <div className="responsive-grid-tight mb-9">
            {newArrivalProducts.map((product) => (
              <CompactProductCard key={`new-${product.id}`} product={product} />
            ))}
          </div>
        ) : (
          <div className="mb-9 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="font-bold text-slate-900">New arrivals will appear here.</p>
            <p className="mt-1 text-sm text-slate-500">Publish more products to fill this row.</p>
          </div>
        )}

        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-3xl font-bold text-slate-950">Featured Products</h2>
          <Link to="/shop" className="hidden text-sm font-bold text-primary hover:text-primary-dark sm:block">
            See all
          </Link>
        </div>

        {loading ? (
          <div className="responsive-grid-tight">
            {Array.from({ length: 18 }).map((_, index) => (
              <div key={index} className="min-h-[17.25rem] animate-pulse rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
                <div className="aspect-square rounded-md bg-slate-100" />
                <div className="mt-3 h-3 w-5/6 rounded bg-slate-100" />
                <div className="mt-2 h-3 w-2/3 rounded bg-slate-100" />
                <div className="mt-4 h-9 rounded-lg bg-slate-100" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-8 text-center">
            <p className="font-bold text-rose-900">Storefront data is unavailable</p>
            <p className="mt-2 text-sm text-rose-700">{error}</p>
          </div>
        ) : featuredGridProducts.length > 0 ? (
          <>
            <div className="responsive-grid-tight">
              {featuredGridProducts.map((product) => (
                <CompactProductCard key={product.id} product={product} />
              ))}
            </div>
          </>
        ) : (
          <div className="flex min-h-44 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
            <div>
              <Search className="mx-auto text-primary" size={26} />
              <p className="mt-3 font-bold text-slate-900">Featured products will appear here.</p>
              <p className="mt-1 text-sm text-slate-500">Add published products to fill this compact grid.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
