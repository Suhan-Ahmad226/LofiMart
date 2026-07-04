'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from '@/src/lib/navigation';
import { Copy, Loader2, ShoppingCart, Store } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCart } from '@/src/context/CartContext';
import { formatPrice } from '@/src/lib/utils';
import type { Product } from '@/src/types';
import OptimizedImage from '@/src/components/ui/OptimizedImage';
import { copyText } from '@/src/lib/browser-actions';

type StorefrontResponse = {
  storefront: {
    code: string;
    reseller_id: string;
    reseller_name: string;
    store_name: string | null;
    banner_url?: string | null;
    headline?: string | null;
    accent_color?: string | null;
    custom_domain?: string | null;
    is_published?: boolean;
    avatar_url: string | null;
    bio: string | null;
  };
  categories?: string[];
  products: Product[];
};

export const PublicResellerStorefront = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<StorefrontResponse | null>(null);

  useEffect(() => {
    if (!code) return;
    let ignore = false;

    const loadStorefront = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await fetch(`/api/reseller/storefront/${encodeURIComponent(String(code))}`);
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load reseller storefront');
        }
        if (ignore) return;
        setData(payload);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('ref_code', String(code));
        }
      } catch (requestError) {
        if (!ignore) {
          setData(null);
          setError(requestError instanceof Error ? requestError.message : 'Failed to load reseller storefront');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    void loadStorefront();
    return () => {
      ignore = true;
    };
  }, [code]);

  const filteredProducts = useMemo(() => {
    const allProducts = data?.products || [];
    const needle = search.trim().toLowerCase();
    if (!needle) return allProducts;
    return allProducts.filter((product) =>
      [product.name, product.category, product.description].some((value) =>
        String(value || '').toLowerCase().includes(needle),
      ),
    );
  }, [data?.products, search]);

  const addProductToCart = (product: Product) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('ref_code', String(code));
    }
    addToCart({
      ...product,
      reseller_ref_code: String(code),
      reseller_sale_price: Number(product.price),
    });
    toast.success('Added to cart from reseller storefront.');
    navigate('/cart');
  };

  const copyStorefrontLink = async () => {
    if (typeof window === 'undefined' || !data?.storefront.code) return;
    const url = `${window.location.origin}/r/${data.storefront.code}`;
    const copied = await copyText(url);
    if (copied) {
      toast.success('Storefront link copied.');
    } else {
      toast.error('Could not copy the storefront link on this device.');
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-950">Reseller storefront unavailable</h1>
        <p className="mt-3 text-sm text-slate-600">{error || 'This reseller page could not be loaded right now.'}</p>
        <Link to="/shop" className="mt-6 inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
          Continue shopping
        </Link>
      </div>
    );
  }

  const accent = data.storefront.accent_color || '#0F766E';

  return (
    <div className="pb-16">
      <section
        className="overflow-hidden"
        style={{
          background:
            data.storefront.banner_url
              ? `linear-gradient(135deg, rgba(2, 6, 23, 0.72), rgba(2, 6, 23, 0.28)), url(${data.storefront.banner_url}) center/cover`
              : `linear-gradient(135deg, ${accent}22, rgba(15, 23, 42, 0.92))`,
        }}
      >
        <div className="mx-auto max-w-7xl px-4 py-14 text-white md:px-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                {data.storefront.avatar_url ? (
                  <OptimizedImage
                    src={data.storefront.avatar_url}
                    alt={data.storefront.reseller_name}
                    widthHint={128}
                    heightHint={128}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  <Store size={26} />
                )}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-primary/70">Reseller storefront</p>
                <h1 className="mt-1 text-3xl font-bold text-white">
                  {data.storefront.store_name || data.storefront.reseller_name}
                </h1>
                <p className="mt-2 text-sm text-white/80">
                  {data.storefront.headline || data.storefront.bio || `Curated products shared by ${data.storefront.reseller_name}.`}
                </p>
                {data.storefront.custom_domain ? (
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
                    Custom domain saved: {data.storefront.custom_domain}
                  </p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void copyStorefrontLink()}
              className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              <span className="inline-flex items-center gap-2">
                <Copy size={16} />
                Copy storefront link
              </span>
            </button>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 md:px-6">
        <div className="space-y-8">
          {Array.isArray(data.categories) && data.categories.length > 0 ? (
            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                {data.categories.map((category) => (
                  <span
                    key={category}
                    className="rounded-full px-3 py-2 text-xs font-semibold"
                    style={{ backgroundColor: `${accent}18`, color: accent }}
                  >
                    {category}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Products from this reseller</h2>
              <p className="text-sm text-slate-500">Prices shown here are reseller-set selling prices.</p>
            </div>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search this storefront"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-primary md:w-80"
            />
          </div>

          {filteredProducts.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
              No reseller products matched your search.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
              {filteredProducts.map((product) => (
                <div key={product.id} className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
                  <div className="aspect-square overflow-hidden bg-slate-100">
                    <OptimizedImage
                      src={product.image}
                      alt={product.name}
                      widthHint={640}
                      heightHint={640}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="space-y-4 p-5">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{product.category}</p>
                      <h3 className="mt-1 line-clamp-2 text-base font-bold text-slate-950">{product.name}</h3>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-slate-500">Reseller price</p>
                      <p className="text-xl font-bold" style={{ color: accent }}>{formatPrice(product.price)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => addProductToCart(product)}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white transition"
                        style={{ backgroundColor: accent }}
                      >
                        <ShoppingCart size={16} />
                        Add to cart
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(product.slug ? `/product/${product.slug}?ref=${encodeURIComponent(String(code))}` : `/shop?ref=${encodeURIComponent(String(code))}`)}
                        className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        View
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PublicResellerStorefront;
