"use client";

import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useParams } from '../../../lib/navigation';
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  Copy,
  ExternalLink,
  Loader2,
  Package,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  Truck,
  Zap,
} from 'lucide-react';
import { ProductCard } from '../../../components/ProductCard';
import OptimizedImage from '../../../components/ui/OptimizedImage';
import { Product } from '../../../types';
import { copyText } from '../../../lib/browser-actions';
import { formatPrice } from '../../../lib/utils';

type FlashSaleEntry = {
  id: string;
  sale_price: number;
  allocated_stock: number;
  campaign: {
    id: string;
    title: string;
    slug: string;
    banner_image?: string | null;
    ends_at: string;
  };
  product: Product;
};

type StorefrontPayload = {
  storefront: {
    seller_id: string;
    seller_name: string;
    store_name: string;
    slug: string;
    banner_url?: string | null;
    headline?: string | null;
    accent_color?: string | null;
    custom_domain?: string | null;
    avatar_url?: string | null;
    bio?: string | null;
    response_time_hours?: number | null;
    verification_badge?: boolean;
    seller_rating?: number;
  };
  categories: string[];
  coupons?: Array<{
    id: string;
    code: string;
    seller_id?: string | null;
    discount_type: string;
    discount_value: number;
    min_order_value: number;
    expiry_date: string;
  }>;
  products: Product[];
  flash_sale_entries: FlashSaleEntry[];
};

export function PublicSellerStorefront() {
  const { slug } = useParams();
  const [data, setData] = useState<StorefrontPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewState, setReviewState] = useState<{ status?: string; store_name?: string | null } | null>(null);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (!slug) return;

    let mounted = true;
    setLoading(true);
    setError('');
    setReviewState(null);

    fetch(`/api/storefronts/${encodeURIComponent(String(slug))}`)
      .then(async (res) => {
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          if (res.status === 423) {
            if (mounted) {
              setReviewState({
                status: payload?.seller_status || 'pending_review',
                store_name: payload?.storefront?.store_name || null,
              });
            }
            return;
          }
          throw new Error(payload?.error || 'Failed to load seller storefront');
        }
        if (mounted) {
          setData(payload);
        }
      })
      .catch((requestError: unknown) => {
        if (!mounted) return;
        setError(requestError instanceof Error ? requestError.message : 'Failed to load seller storefront');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [slug]);

  const filteredProducts = useMemo(() => {
    const items = Array.isArray(data?.products) ? data.products : [];
    const needle = deferredQuery.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((product) =>
      [product.name, product.category, product.sku, product.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [data?.products, deferredQuery]);

  const storefrontInsights = useMemo(() => {
    const products = Array.isArray(data?.products) ? data.products : [];
    const featuredProducts = [...products]
      .sort((left, right) => {
        const leftScore = Number(left.rating || 0) * 100 + Number(left.reviews_count || 0);
        const rightScore = Number(right.rating || 0) * 100 + Number(right.reviews_count || 0);
        return rightScore - leftScore;
      })
      .slice(0, 4);
    const latestProducts = products.slice(0, 8);
    const lowStockCount = products.filter((product) => Number(product.stock || 0) > 0 && Number(product.stock || 0) <= 5).length;
    const averageRating =
      products.length > 0
        ? products.reduce((sum, product) => sum + Number(product.rating || 0), 0) / products.length
        : Number(data?.storefront?.seller_rating || 0);
    const totalReviews = products.reduce((sum, product) => sum + Number(product.reviews_count || 0), 0);

    return {
      averageRating,
      featuredCategories: (data?.categories || []).slice(0, 6),
      featuredProducts,
      latestProducts,
      lowStockCount,
      totalReviews,
    };
  }, [data]);

  const copyLink = async () => {
    if (typeof window === 'undefined' || !data?.storefront.slug) return;
    const url = `${window.location.origin}/store/${data.storefront.slug}`;
    const copied = await copyText(url);
    if (copied) {
      toast.success('Storefront link copied.');
    } else {
      toast.error('Could not copy the storefront link on this device.');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (error || !data?.storefront) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-slate-950">{reviewState ? 'Store is under review' : 'Store unavailable'}</h1>
        <p className="mt-3 text-sm text-slate-500">
          {reviewState
            ? `${reviewState.store_name || 'This store'} is not live yet. The seller is still completing admin approval before public selling starts.`
            : error || 'This store is not published right now.'}
        </p>
      </div>
    );
  }

  const accent = data.storefront.accent_color || '#0F766E';
  const publishState = data.products.length > 0 ? 'Live catalog' : 'Setup mode';
  const previewDomain = data.storefront.custom_domain || `${data.storefront.slug}.lofimart.com`;
  const navSections = [
    { label: 'Home', href: '#brand-home' },
    { label: 'Collections', href: '#brand-collections' },
    { label: 'Offers', href: '#brand-offers' },
    { label: 'Shop', href: '#storefront-catalog' },
    { label: 'About', href: '#brand-story' },
  ];

  return (
    <div className="bg-slate-50 pb-20">
      <section
        id="brand-home"
        className="relative overflow-hidden"
        style={{
          background:
            data.storefront.banner_url
              ? `linear-gradient(135deg, rgba(2, 6, 23, 0.74), rgba(2, 6, 23, 0.28)), url(${data.storefront.banner_url}) center/cover`
              : `linear-gradient(135deg, ${accent}22, rgba(15, 23, 42, 0.94))`,
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_24rem)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-12 text-white md:py-16">
          <div className="mb-8 flex flex-col gap-4 rounded-[1.5rem] border border-white/10 bg-white/5 px-4 py-4 backdrop-blur md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white/10 text-lg font-bold uppercase">
                {data.storefront.avatar_url ? (
                  <OptimizedImage
                    src={data.storefront.avatar_url}
                    alt={data.storefront.store_name}
                    eager
                    widthHint={120}
                    heightHint={120}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  data.storefront.store_name?.[0] || 'S'
                )}
              </div>
              <div>
                <p className="text-sm font-semibold">{data.storefront.store_name}</p>
                <p className="text-xs text-white/65">{previewDomain}</p>
              </div>
            </div>
            <nav className="flex flex-wrap gap-2 text-sm text-white/82">
              {navSections.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="rounded-full px-3 py-2 font-medium transition hover:bg-white/10 hover:text-white"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>

          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em]">
                <Sparkles size={14} />
                Official brand site
              </div>
              <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-[1.75rem] border border-white/15 bg-white/10 text-3xl font-bold uppercase shadow-2xl shadow-black/15">
                  {data.storefront.avatar_url ? (
                    <OptimizedImage
                      src={data.storefront.avatar_url}
                      alt={data.storefront.store_name}
                      eager
                      widthHint={160}
                      heightHint={160}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    data.storefront.store_name?.[0] || 'S'
                  )}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-white/80">
                    <span className="font-semibold">{data.storefront.seller_name}</span>
                    {data.storefront.verification_badge ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-emerald-100">
                        <BadgeCheck size={15} />
                        Verified seller
                      </span>
                    ) : null}
                  </div>
                  <h1 className="mt-3 text-3xl font-bold tracking-tight lg:text-5xl">{data.storefront.store_name}</h1>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-white/80">
                    <span>{data.products.length} products</span>
                    <span>{data.categories.length} categories</span>
                    <span>{publishState}</span>
                    {storefrontInsights.averageRating > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <Star size={14} className="text-amber-300" fill="currentColor" />
                        {storefrontInsights.averageRating.toFixed(1)} average rating
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <p className="mt-6 max-w-3xl text-base leading-7 text-white/82">
                {data.storefront.headline ||
                  data.storefront.bio ||
                  `${data.storefront.store_name} presents its own curated website experience with direct merchandising, pricing, and customer support.`}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href="#storefront-catalog"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
                >
                  Shop catalog
                  <ArrowRight size={16} />
                </a>
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
                >
                  <Copy size={16} />
                  Copy website link
                </button>
              </div>
              <div className="mt-8 flex flex-wrap gap-2">
                {[
                  data.storefront.response_time_hours ? `Replies in about ${data.storefront.response_time_hours}h` : 'Seller-direct support',
                  data.flash_sale_entries.length > 0 ? `${data.flash_sale_entries.length} live sale picks` : 'Curated live catalog',
                  storefrontInsights.lowStockCount > 0 ? `${storefrontInsights.lowStockCount} low-stock items monitored` : 'Stock actively managed',
                ].map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-medium text-white/88"
                  >
                    <Sparkles size={13} />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/10 p-5 shadow-2xl shadow-black/10 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Brand snapshot</p>
                  <p className="mt-1 text-xs text-white/70">A quick read on how this website feels to shoppers</p>
                </div>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
                  {publishState}
                </span>
              </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/60">Website</p>
                  <p className="mt-2 truncate text-sm font-semibold">{previewDomain}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/60">Support cadence</p>
                  <p className="mt-2 text-sm font-semibold">
                    {data.storefront.response_time_hours ? `${data.storefront.response_time_hours}h reply window` : 'Seller-managed inbox'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/60">Reviews signal</p>
                  <p className="mt-2 text-sm font-semibold">
                    {storefrontInsights.totalReviews > 0 ? `${storefrontInsights.totalReviews} customer reviews` : 'Fresh catalog momentum'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/60">Merchandising</p>
                  <p className="mt-2 text-sm font-semibold">
                    {data.coupons?.length ? `${data.coupons.length} active offers` : 'Always-on catalog'}
                  </p>
                </div>
              </div>
              <div className="mt-5 space-y-2 text-sm text-white/78">
                {data.storefront.bio ? <p>{data.storefront.bio}</p> : null}
                {data.storefront.custom_domain ? (
                  <p className="inline-flex items-center gap-2">
                    <ExternalLink size={14} />
                    Custom domain connected: {data.storefront.custom_domain}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 md:space-y-10 md:py-10">
        <section className="grid gap-4 rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Brand story</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">Built to feel like {data.storefront.store_name}'s own website</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
              This storefront leads with the seller's identity first, then merchandise. Customers see a focused brand experience instead of a generic marketplace page.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Brand-led</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">Own logo, own story, own domain feel</p>
            </div>
            <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Focused shop</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">Only this seller's inventory and campaigns</p>
            </div>
            <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Trust-ready</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">Support, reviews, and fulfillment cues upfront</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-center gap-2 text-slate-500">
              <ShieldCheck size={16} />
              <span className="text-xs font-semibold uppercase tracking-[0.18em]">Trust layer</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-950">Seller-direct catalog</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">Every product, offer, and flash sale here belongs to this merchant only.</p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-center gap-2 text-slate-500">
              <Clock3 size={16} />
              <span className="text-xs font-semibold uppercase tracking-[0.18em]">Support</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-950">
              {data.storefront.response_time_hours ? `Around ${data.storefront.response_time_hours}h response time` : 'Seller-managed messaging cadence'}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">Clear reply expectations help customers buy with more confidence.</p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-center gap-2 text-slate-500">
              <Truck size={16} />
              <span className="text-xs font-semibold uppercase tracking-[0.18em]">Fulfillment</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-950">
              {storefrontInsights.lowStockCount > 0 ? `${storefrontInsights.lowStockCount} SKUs under stock pressure` : 'Stock levels look healthy'}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">Catalog stock is actively monitored before new campaigns are pushed harder.</p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-center gap-2 text-slate-500">
              <Zap size={16} />
              <span className="text-xs font-semibold uppercase tracking-[0.18em]">Offers</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-950">
              {data.coupons?.length || data.flash_sale_entries.length ? 'Campaign-ready storefront' : 'Evergreen storefront'}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">Promotions stay inside this website experience instead of feeling marketplace-wide.</p>
          </div>
        </section>

        <section id="brand-collections" className="grid gap-4 rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-950">Explore signature collections</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Browse a focused catalog, curated categories, and live campaign picks without mixing inventory from other stores.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {storefrontInsights.featuredCategories.map((category) => (
                <span
                  key={category}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  <Tag size={13} />
                  {category}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
            <label className="text-sm font-semibold text-slate-900">Search this website</label>
            <div className="relative mt-3">
              <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm outline-none transition focus:border-primary"
                placeholder="Search product, category, or SKU"
              />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Search stays scoped to this store only, so product discovery feels focused and fast.
            </p>
          </div>
        </section>

        {storefrontInsights.featuredProducts.length > 0 ? (
          <section className="space-y-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-950">Buyer favorites</h2>
                <p className="mt-1 text-sm text-slate-600">High-signal products based on customer ratings and review momentum.</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                <Star size={14} className="text-amber-500" fill="currentColor" />
                Curated from real storefront product signals
              </div>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {storefrontInsights.featuredProducts.map((product) => (
                <ProductCard key={`favorite-${product.id}`} product={product} />
              ))}
            </div>
          </section>
        ) : null}

        {Array.isArray(data.coupons) && data.coupons.length > 0 ? (
          <section id="brand-offers" className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-center gap-2">
              <Tag className="text-primary" size={18} />
              <h2 className="text-xl font-bold tracking-tight text-slate-950">Exclusive offers</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              These discount codes stay inside this storefront, so the buying experience feels like a direct brand promotion.
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.coupons.map((coupon) => (
                <div key={coupon.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/90 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-lg font-black tracking-[0.16em] text-slate-950">{coupon.code}</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const copied = await copyText(coupon.code);
                          if (copied) {
                            toast.success(`Coupon ${coupon.code} copied.`);
                            return;
                          }
                          toast.error('Could not copy this coupon on this device.');
                        }}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-white"
                      >
                        Copy
                      </button>
                      <Link
                        to={`/cart?coupon=${encodeURIComponent(coupon.code)}`}
                        className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-800"
                      >
                        Apply in cart
                      </Link>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    {coupon.discount_type === 'percentage' ? `${coupon.discount_value}% off` : `${coupon.discount_value} BDT off`}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Min order: {coupon.min_order_value} BDT</p>
                  <p className="mt-1 text-xs text-slate-500">Valid until {new Date(coupon.expiry_date).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {data.flash_sale_entries.length > 0 ? (
          <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-center gap-2">
              <Sparkles className="text-primary" size={18} />
              <h2 className="text-xl font-bold tracking-tight text-slate-950">Campaign spotlight</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">Time-sensitive products are surfaced like featured campaign blocks on a direct brand website.</p>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.flash_sale_entries.map((entry) => (
                <div key={entry.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/90 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">{entry.campaign.title}</p>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                      Flash price {formatPrice(entry.sale_price)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Ends {new Date(entry.campaign.ends_at).toLocaleDateString()} • {entry.allocated_stock} units reserved
                  </p>
                  <div className="mt-4">
                    <ProductCard product={entry.product} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {storefrontInsights.latestProducts.length > 0 ? (
          <section className="space-y-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-950">Fresh in this store</h2>
                <p className="mt-1 text-sm text-slate-600">Newer catalog entries surfaced before shoppers scroll through the full assortment.</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                <Sparkles size={14} />
                Seller-curated arrivals
              </div>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {storefrontInsights.latestProducts.map((product) => (
                <ProductCard key={`latest-${product.id}`} product={product} />
              ))}
            </div>
          </section>
        ) : null}

        <section id="brand-story" className="grid gap-4 rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">About this store</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{data.storefront.store_name}</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              {data.storefront.bio ||
                `${data.storefront.store_name} runs a focused direct-to-customer catalog with its own merchandising, pricing, and after-sales support.`}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Store owner</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{data.storefront.seller_name}</p>
            </div>
            <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Website status</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{publishState}</p>
            </div>
            <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Average rating</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">
                {storefrontInsights.averageRating > 0 ? storefrontInsights.averageRating.toFixed(1) : 'New storefront'}
              </p>
            </div>
            <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Customer reviews</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{storefrontInsights.totalReviews || 'Growing'}</p>
            </div>
          </div>
        </section>

        <section id="storefront-catalog">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-950">All products</h2>
              <p className="mt-1 text-sm text-slate-600">{filteredProducts.length} products visible from this store</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
              <Package size={14} />
              Direct store catalog
            </div>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              No products matched this store search right now.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </section>

        <footer className="rounded-[1.75rem] border border-slate-200 bg-slate-950 px-6 py-8 text-white">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/55">Official store</p>
              <h3 className="mt-3 text-2xl font-bold tracking-tight">{data.storefront.store_name}</h3>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-white/70">
                A seller-owned storefront experience with direct merchandising, focused collections, and cleaner customer trust signals.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {navSections.map((item) => (
                <a
                  key={`footer-${item.href}`}
                  href={item.href}
                  className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default PublicSellerStorefront;
