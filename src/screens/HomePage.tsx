import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'motion/react';
import { ArrowRight, BadgePercent, BadgeCheck, ShieldCheck, Sparkles, Star, Store, Truck, Zap } from 'lucide-react';
import { Link } from '@/src/lib/navigation';
import { ProductCard } from '../components/ProductCard';
import OptimizedImage from '../components/ui/OptimizedImage';
import { Product } from '../types';
import { AnimatedIcon } from '../components/ui/AnimatedIcon';
import { getCachedClientValue } from '../lib/client-cache';

const AIRecommendation = dynamic(
  () => import('../components/AIRecommendation').then((module) => module.AIRecommendation),
  {
    loading: () => <div className="h-80 animate-pulse rounded-[2rem] bg-slate-100" />,
  },
);

type HomeBanner = {
  id?: string;
  image?: string;
  title?: string;
  subtitle?: string;
  link?: string;
  button_text?: string;
};

type HomeCategory = {
  id?: string;
  name?: string;
};

type HomeSeller = {
  seller_id: string;
  seller_name: string;
  store_name: string;
  slug?: string | null;
  banner_url?: string | null;
  headline?: string | null;
  avatar_url?: string | null;
  response_time_hours?: number | null;
  verification_badge?: boolean;
  product_count: number;
  average_rating: number;
  review_count: number;
};

type BestsellingProduct = Product & {
  sold_count?: number;
};

const heroTrustChips = [
  'Verified sellers',
  'Cash on delivery',
  'Fast delivery',
  'Easy returns',
];

export const HomePage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [bestsellers, setBestsellers] = useState<BestsellingProduct[]>([]);
  const [topSellers, setTopSellers] = useState<HomeSeller[]>([]);
  const [banners, setBanners] = useState<HomeBanner[]>([]);
  const [categories, setCategories] = useState<HomeCategory[]>([]);
  const [notice, setNotice] = useState('');
  const [currentBanner, setCurrentBanner] = useState(0);
  const [showDeferredSections, setShowDeferredSections] = useState(false);
  const deferredSectionsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentBanner((prev) => (prev + 1) % Math.max(1, banners.length));
    }, 5000);
    return () => clearInterval(interval);
  }, [banners.length]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setNotice('');
        const data = await getCachedClientValue('home-page:v1', 5 * 60 * 1000, async () => {
          const response = await fetch('/api/home', { cache: 'force-cache' });
          if (!response.ok) {
            throw new Error('Failed to load homepage data');
          }
          return response.json();
        });

        setProducts(Array.isArray(data.products) ? data.products : []);
        setBestsellers(Array.isArray(data.bestsellers) ? data.bestsellers : []);
        setTopSellers(Array.isArray(data.top_sellers) ? data.top_sellers : []);
        setBanners(Array.isArray(data.banners) ? data.banners : []);
        setCategories(Array.isArray(data.categories) ? data.categories : []);
      } catch {
        setNotice('Live homepage data is temporarily unavailable. You can still browse products and categories below.');
      }
    };

    void loadData();
  }, []);

  useEffect(() => {
    if (showDeferredSections) return;

    const target = deferredSectionsRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') {
      const timeoutId = window.setTimeout(() => setShowDeferredSections(true), 250);
      return () => window.clearTimeout(timeoutId);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShowDeferredSections(true);
          observer.disconnect();
        }
      },
      { rootMargin: '520px 0px' },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [showDeferredSections]);

  const activeBanner = banners.length > 0 ? banners[currentBanner] : null;
  const heroStats = [
    { value: '25k+', label: 'Orders delivered nationwide' },
    { value: '4.8/5', label: 'Average shopper rating' },
    { value: '48 hrs', label: 'Fast dispatch in major cities' },
  ];

  const featuredProducts = useMemo(() => products.slice(0, 5), [products]);
  const visibleCategories = useMemo(() => categories.slice(0, 6), [categories]);
  const categoryShowcases = useMemo(
    () =>
      visibleCategories
        .map((category) => ({
          name: category.name || 'Featured category',
          products: products
            .filter((product) => product.category && product.category.toLowerCase() === String(category.name || '').toLowerCase())
            .slice(0, 4),
        }))
        .filter((entry) => entry.products.length > 0)
        .slice(0, 3),
    [products, visibleCategories],
  );
  return (
    <div className="space-y-16 pb-20 md:space-y-20">
      {notice ? (
        <div className="mx-auto max-w-7xl px-4 pt-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {notice}
          </div>
        </div>
      ) : null}

      <section className="px-4">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] border border-slate-200/70 bg-slate-950 shadow-[0_35px_120px_-45px_rgba(15,23,42,0.65)]">
          {activeBanner?.image ? (
            <div className="absolute inset-0">
              <OptimizedImage
                src={activeBanner.image}
                alt={activeBanner.title || 'LofiMart hero banner'}
                eager
                widthHint={1600}
                heightHint={920}
                quality="auto:best"
                className="h-full w-full object-cover opacity-40"
              />
            </div>
          ) : null}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.22),transparent_32%),linear-gradient(115deg,rgba(2,6,23,0.92),rgba(2,6,23,0.72),rgba(15,23,42,0.36))]" />

          <div className="relative grid min-h-[420px] gap-6 px-4 py-6 sm:px-6 md:px-10 md:py-8 lg:min-h-[520px] lg:grid-cols-[1.1fr_0.9fr] lg:gap-8 lg:px-14 lg:py-14">
            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="flex flex-col justify-center"
            >
              <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-white/80 backdrop-blur-md">
                <AnimatedIcon loop="pulse">
                  <Sparkles size={14} />
                </AnimatedIcon>
                Trusted marketplace
              </div>

              <h1 className="max-w-3xl text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
                {activeBanner?.title || 'Shop from trusted sellers with easy delivery and better prices'}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-white/75 sm:text-lg">
                {activeBanner?.subtitle ||
                  'Verified stores, flash deals, top categories, and a simple checkout experience in one place.'}
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  to={activeBanner?.link || '/shop'}
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-slate-100"
                >
                  <span>{activeBanner?.button_text || 'Shop now'}</span>
                  <AnimatedIcon loop="none">
                    <ArrowRight size={18} />
                  </AnimatedIcon>
                </Link>
                <Link
                  to="/flash-sale"
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-6 py-3 text-sm font-bold text-white backdrop-blur-md transition hover:bg-white/15"
                >
                  <Zap size={16} />
                  <span>Flash sale</span>
                </Link>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {heroTrustChips.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/85 backdrop-blur-md"
                  >
                    {item}
                  </span>
                ))}
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {heroStats.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-md">
                    <p className="text-xl font-bold text-white">{item.value}</p>
                    <p className="mt-1 text-xs text-white/70">{item.label}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.85, delay: 0.08 }}
              className="flex flex-col justify-end"
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <Link
                  to="/flash-sale"
                  className="rounded-[2rem] border border-white/10 bg-white/10 p-6 text-white shadow-[0_20px_60px_-30px_rgba(15,23,42,0.8)] backdrop-blur-xl transition hover:bg-white/15"
                >
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/60">Today&apos;s deal</p>
                  <h2 className="mt-2 text-2xl font-bold">Flash Sale</h2>
                  <p className="mt-2 text-sm text-white/70">Limited-time picks with better prices.</p>
                </Link>
                <Link
                  to="/categories"
                  className="rounded-[2rem] border border-white/10 bg-white/10 p-6 text-white shadow-[0_20px_60px_-30px_rgba(15,23,42,0.8)] backdrop-blur-xl transition hover:bg-white/15"
                >
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/60">Popular browse</p>
                  <h2 className="mt-2 text-2xl font-bold">Top Categories</h2>
                  <p className="mt-2 text-sm text-white/70">Fashion, electronics, home, and more.</p>
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 sm:grid-cols-2 md:grid-cols-4">
        {[
          { icon: <ShieldCheck className="text-primary" />, title: 'Verified sellers', desc: 'Better trust signals' },
          { icon: <Truck className="text-primary" />, title: 'Nationwide delivery', desc: 'Courier-backed fulfilment' },
          { icon: <Zap className="text-primary" />, title: 'Live deals', desc: 'Flash-ready promotions' },
          { icon: <Store className="text-primary" />, title: 'Top stores', desc: 'Public marketplace shops' },
        ].map((item) => (
          <div key={item.title} className="rounded-[1.75rem] border border-slate-200/70 bg-white p-5 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary shadow-sm">
              <AnimatedIcon loop="float" glow>
                {item.icon}
              </AnimatedIcon>
            </div>
            <h3 className="text-sm font-bold text-slate-950">{item.title}</h3>
            <p className="mt-1 text-xs text-slate-500">{item.desc}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-7xl px-4">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.24em] text-primary/70">Top categories</p>
            <h2 className="text-3xl font-bold text-slate-950">Shop by category</h2>
          </div>
          <Link to="/categories" className="text-sm font-semibold text-primary hover:text-primary-dark">
            Explore all categories
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {visibleCategories.map((category, index) => (
            <Link
              key={category.id || category.name || index}
              to={`/shop?category=${encodeURIComponent(category.name || '')}`}
              className="group relative overflow-hidden rounded-[1.9rem] border border-slate-200 bg-[linear-gradient(160deg,#ffffff_0%,#f8fafc_55%,#f0fdf4_100%)] p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#16a34a,#0f766e)] opacity-80" />
              <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-primary/5 blur-2xl transition duration-300 group-hover:bg-primary/10" />
              <div className="flex h-full flex-col justify-between gap-10">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-primary shadow-md ring-1 ring-primary/10">
                  <AnimatedIcon loop="pulse">
                    <Sparkles size={18} />
                  </AnimatedIcon>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-950">{category.name}</h3>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.16em] text-primary/80">
                    Explore
                    <ArrowRight size={12} />
                  </span>
                </div>
              </div>
            </Link>
          ))}
          {visibleCategories.length === 0 ? (
            <div className="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
              Category sections are still syncing. Browse the full shop while the latest category map loads.
            </div>
          ) : null}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.24em] text-accent/80">
              <AnimatedIcon loop="pulse" glow>
                <Zap size={15} className="fill-accent text-accent" />
              </AnimatedIcon>
              Live campaign
            </p>
            <h2 className="text-3xl font-bold text-slate-950">Flash sale</h2>
          </div>
          <Link to="/flash-sale" className="text-sm font-semibold text-primary hover:text-primary-dark">
            View all deals
          </Link>
        </div>

        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-[2rem] bg-[linear-gradient(145deg,#7c2d12_0%,#ea580c_52%,#fb923c_100%)] p-7 text-white shadow-xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-white/80">
              <BadgePercent size={14} />
              Flash sale
            </div>
            <h3 className="mt-4 text-3xl font-bold leading-tight">Best deals today</h3>
            <div className="mt-6 space-y-3">
              {[
                'Limited-time price drops',
                'Top campaign products',
                'Fast checkout favorites',
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-medium text-white/90">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {featuredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
            {featuredProducts.length === 0 ? (
              <div className="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
                Featured products are syncing. Explore the full shop while we refresh this section.
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div ref={deferredSectionsRef} className="space-y-16 md:space-y-20">
        {showDeferredSections ? (
          <>
            <section className="mx-auto max-w-7xl px-4">
              <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="mb-2 text-sm font-bold uppercase tracking-[0.24em] text-primary/70">Top marketplace sellers</p>
                  <h2 className="text-3xl font-bold text-slate-950">Top sellers</h2>
                </div>
                <Link to="/shop" className="text-sm font-semibold text-primary hover:text-primary-dark">
                  Browse all stores
                </Link>
              </div>

              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {topSellers.map((seller) => (
                  <Link
                    key={seller.seller_id}
                    to={seller.slug ? `/store/${seller.slug}` : `/seller-profile/${seller.seller_id}`}
                    className="group overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"
                  >
                    <div className="relative h-36 overflow-hidden bg-slate-100">
                      {seller.banner_url ? (
                        <OptimizedImage
                          src={seller.banner_url}
                          alt={seller.store_name}
                          widthHint={720}
                          heightHint={280}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="h-full w-full bg-[linear-gradient(135deg,#0f172a_0%,#166534_100%)]" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />
                      <div className="absolute left-5 top-5 flex h-16 w-16 items-center justify-center overflow-hidden rounded-3xl border border-white/20 bg-white/15 text-2xl font-bold uppercase text-white backdrop-blur-md">
                        {seller.avatar_url ? (
                          <OptimizedImage
                            src={seller.avatar_url}
                            alt={seller.store_name}
                            widthHint={128}
                            heightHint={128}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          seller.store_name?.[0] || 'S'
                        )}
                      </div>
                    </div>

                    <div className="space-y-4 p-5">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-slate-950">{seller.store_name}</h3>
                          {seller.verification_badge ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                              <BadgeCheck size={12} />
                              Verified
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm text-slate-500">
                          {seller.headline || 'Trusted store with active products and marketplace visibility.'}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-3 rounded-3xl bg-secondary/70 p-4 text-center sm:grid-cols-3">
                        <div>
                          <p className="text-base font-bold text-slate-950">{seller.product_count}</p>
                          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Products</p>
                        </div>
                        <div>
                          <p className="text-base font-bold text-slate-950">{seller.average_rating.toFixed(1)}</p>
                          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Rating</p>
                        </div>
                        <div>
                          <p className="text-base font-bold text-slate-950">
                            {seller.response_time_hours ? `${seller.response_time_hours}h` : 'Fast'}
                          </p>
                          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Response</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Store trust</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {seller.verification_badge ? 'Verified and ready to explore' : 'Active marketplace storefront'}
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-2 text-sm font-bold text-primary">
                          Visit store
                          <ArrowRight size={15} />
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}

                {topSellers.length === 0 ? (
                  <div className="md:col-span-2 xl:col-span-3 rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
                    Public seller storefront highlights will appear here as more stores go live.
                  </div>
                ) : null}
              </div>
            </section>

            <section className="mx-auto max-w-7xl px-4">
              <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="mb-2 text-sm font-bold uppercase tracking-[0.24em] text-primary/70">Shop by category</p>
                  <h2 className="text-3xl font-bold text-slate-950">Category picks</h2>
                </div>
                <Link to="/shop" className="text-sm font-semibold text-primary hover:text-primary-dark">
                  Open full shop
                </Link>
              </div>

              <div className="space-y-10">
                {categoryShowcases.map((showcase) => (
                  <div key={showcase.name} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="text-2xl font-bold text-slate-950">{showcase.name}</h3>
                      </div>
                      <Link
                        to={`/shop?category=${encodeURIComponent(showcase.name)}`}
                        className="text-sm font-semibold text-primary hover:text-primary-dark"
                      >
                        View {showcase.name}
                      </Link>
                    </div>

                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-4">
                      {showcase.products.map((product) => (
                        <ProductCard key={product.id} product={product} />
                      ))}
                    </div>
                  </div>
                ))}

                {categoryShowcases.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
                    Category-led product showcases are syncing. Featured sections will appear as soon as category inventory is ready.
                  </div>
                ) : null}
              </div>
            </section>

            <section className="mx-auto max-w-7xl px-4">
              <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="mb-2 text-sm font-bold uppercase tracking-[0.24em] text-primary/70">Top selling products</p>
                  <h2 className="text-3xl font-bold text-slate-950">Top selling products</h2>
                </div>
                <Link to="/shop" className="text-sm font-semibold text-primary hover:text-primary-dark">
                  Shop bestsellers
                </Link>
              </div>

              <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-[2rem] bg-[linear-gradient(135deg,#0f172a_0%,#166534_100%)] p-8 text-white shadow-xl">
                  <p className="mb-3 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.24em] text-white/75">
                    <Star size={15} className="fill-white text-white" />
                    Bestseller spotlight
                  </p>
                  <h3 className="text-3xl font-bold">Popular picks</h3>
                  <div className="mt-8 space-y-4">
                    {bestsellers.slice(0, 3).map((product, index) => (
                      <Link
                        key={product.id}
                        to={`/product/${product.slug}`}
                        className="flex items-center gap-4 rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur-md transition hover:bg-white/15"
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-lg font-bold text-white">
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-white">{product.name}</p>
                          <p className="text-sm text-white/70">
                            {product.sold_count ? `${product.sold_count} sold` : `${product.reviews_count} reviews`}
                          </p>
                        </div>
                        <span className="text-sm font-bold text-white">{product.price.toLocaleString()} BDT</span>
                      </Link>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-4">
                  {(bestsellers.length > 0 ? bestsellers : featuredProducts).slice(0, 4).map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              </div>
            </section>

            <section className="mx-auto max-w-7xl px-4">
              <div className="mb-8 flex items-center justify-between gap-4">
                <div>
                  <p className="mb-2 text-sm font-bold uppercase tracking-[0.24em] text-primary/70">More products</p>
                  <h2 className="text-3xl font-bold text-slate-950">Featured products</h2>
                </div>
                <Link to="/shop" className="text-sm font-semibold text-primary hover:text-primary-dark">
                  See all
                </Link>
              </div>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
                {products.length === 0 ? (
                  <div className="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
                    Product listings are syncing. Please check back in a moment or browse categories.
                  </div>
                ) : null}
              </div>
            </section>

            <section className="mx-auto max-w-7xl px-4">
              <AIRecommendation title="AI-powered picks shaped around shopper interest" limit={8} />
            </section>
          </>
        ) : (
          <section className="mx-auto max-w-7xl px-4">
            <div className="h-[320px] animate-pulse rounded-[2rem] bg-slate-100" />
          </section>
        )}
      </div>
    </div>
  );
};
