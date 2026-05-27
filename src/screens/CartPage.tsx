import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from '@/src/lib/navigation';
import {
  ArrowRight,
  BadgePercent,
  CheckCircle2,
  ChevronRight,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { formatPrice, cn } from '../lib/utils';
import { Skeleton } from '../components/ui/Skeleton';
import { getOptimizedCloudinaryImage } from '../lib/cloudinary';
import { FormNotice } from '../components/ui/FeedbackState';

const trustPoints = [
  {
    icon: <Truck size={18} />,
    title: 'Fast delivery updates',
    description: 'Live status and smoother order tracking after checkout.',
  },
  {
    icon: <ShieldCheck size={18} />,
    title: 'Protected checkout',
    description: 'Coupon, wallet, and payment flow stay secure through the next step.',
  },
  {
    icon: <Sparkles size={18} />,
    title: 'Smart cart recovery',
    description: 'Your cart stays saved so you can continue later without losing progress.',
  },
];

function CartSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-12">
      <div className="space-y-8">
        <div className="space-y-3">
          <Skeleton className="h-4 w-24 rounded-full" />
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-5 w-full max-w-2xl" />
        </div>
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-sm">
                <div className="flex gap-4">
                  <Skeleton className="h-28 w-28 rounded-[1.25rem]" />
                  <div className="min-w-0 flex-1 space-y-3">
                    <Skeleton className="h-6 w-2/3" />
                    <Skeleton className="h-4 w-40" />
                    <div className="flex gap-3">
                      <Skeleton className="h-11 w-32 rounded-xl" />
                      <Skeleton className="h-11 w-11 rounded-xl" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-24 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-5">
            <Skeleton className="h-[420px] w-full rounded-[1.75rem]" />
            <Skeleton className="h-44 w-full rounded-[1.75rem]" />
          </div>
        </div>
      </div>
    </div>
  );
}

export const CartPage = () => {
  const {
    items,
    removeFromCart,
    updateQuantity,
    subtotal,
    totalPrice,
    totalItems,
    applyCoupon,
    removeCoupon,
    appliedCoupon,
    discountAmount,
    isReady,
  } = useCart();

  const [couponCode, setCouponCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(2500);
  const [searchParams] = useSearchParams();
  const couponAttemptedRef = useRef('');

  useEffect(() => {
    fetch('/api/public/commerce-config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.free_shipping_threshold) {
          setFreeShippingThreshold(Number(data.free_shipping_threshold));
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const incomingCoupon = searchParams.get('coupon');
    if (incomingCoupon) {
      setCouponCode(incomingCoupon.toUpperCase());
    }
  }, [searchParams]);

  const shippingRemaining = Math.max(0, freeShippingThreshold - subtotal);
  const shippingProgress = Math.min((subtotal / Math.max(freeShippingThreshold, 1)) * 100, 100);
  const averageItemPrice = totalItems > 0 ? subtotal / totalItems : 0;
  const sellerIds = useMemo(() => [...new Set(items.map((item) => String(item.seller_id || '')).filter(Boolean))], [items]);
  const scopedSellerId = sellerIds.length === 1 ? sellerIds[0] : null;

  const summaryLabel = useMemo(() => {
    if (shippingRemaining > 0) {
      return `Spend ${formatPrice(shippingRemaining)} more to unlock free delivery`;
    }

    return 'Free delivery unlocked for this cart';
  }, [shippingRemaining]);

  const handleApplyCoupon = async (forcedCode?: string) => {
    const nextCode = String(forcedCode || couponCode).trim();
    if (!nextCode) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: nextCode,
          orderValue: subtotal,
          sellerId: scopedSellerId,
          productIds: items.map((item) => String(item.id)),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to validate coupon');
      }

      applyCoupon(data);
      setSuccess(`Coupon "${data.code}" applied successfully.`);
      setCouponCode('');
    } catch (err: any) {
      setError(err.message || 'Failed to apply coupon.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!appliedCoupon || items.length === 0) {
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/coupons/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: appliedCoupon.code,
            orderValue: subtotal,
            sellerId: scopedSellerId,
            productIds: items.map((item) => String(item.id)),
          }),
        });
        const data = await response.json().catch(() => null);

        if (!active) return;

        if (!response.ok) {
          removeCoupon();
          setSuccess(null);
          setError(data?.error || 'Your cart changed, so the coupon was removed.');
          return;
        }

        applyCoupon(data);
      } catch {
        if (!active) return;
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [appliedCoupon?.code, items, scopedSellerId, subtotal]);

  useEffect(() => {
    const incomingCoupon = searchParams.get('coupon');
    if (
      !incomingCoupon ||
      items.length === 0 ||
      loading ||
      appliedCoupon ||
      couponAttemptedRef.current === incomingCoupon
    ) {
      return;
    }

    couponAttemptedRef.current = incomingCoupon;
    setCouponCode(incomingCoupon.toUpperCase());
    void handleApplyCoupon(incomingCoupon);
  }, [appliedCoupon, items.length, loading, searchParams]);

  if (!isReady) {
    return <CartSkeleton />;
  }

  if (items.length === 0) {
    return (
      <div className="bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_42%,#f8fafc_100%)]">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center md:px-6 md:py-24">
            <div className="space-y-8 rounded-[2rem] border border-slate-200/80 bg-white px-6 py-10 shadow-xl shadow-slate-200/50 sm:px-10">
              <div className="mx-auto inline-flex h-24 w-24 items-center justify-center rounded-[2rem] bg-slate-50 text-slate-400">
                <ShoppingBag size={44} />
            </div>
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Your cart is ready when you are</p>
              <h1 className="text-3xl font-bold text-slate-950 sm:text-4xl font-display">Your cart is currently empty</h1>
              <p className="mx-auto max-w-2xl text-sm leading-7 text-slate-500 sm:text-base">
                Start with a few products you love and we will keep them saved here for a smoother checkout, better offers, and faster re-ordering later.
              </p>
            </div>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                to="/shop"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Start shopping
                <ArrowRight size={18} />
              </Link>
              <Link
                to="/categories"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-6 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Explore categories
                <ChevronRight size={18} />
              </Link>
            </div>
            <div className="grid gap-4 pt-2 md:grid-cols-3">
              {trustPoints.map((point) => (
                <div key={point.title} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 text-left">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    {point.icon}
                  </span>
                  <h2 className="mt-4 text-base font-bold text-slate-950">{point.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{point.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_42%,#f8fafc_100%)]">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-12">
        <div className="space-y-8">
          <section className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-xl shadow-slate-200/45">
            <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                  <ShoppingBag size={14} />
                  Smart cart
                </div>
                <div className="space-y-3">
                  <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl font-display">
                    Review your cart before checkout
                  </h1>
                  <p className="max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                    Update quantities, apply savings, and make sure everything looks right. Your cart is already optimized for a faster and more confident checkout flow.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white text-[11px]">
                      {totalItems}
                    </span>
                    {totalItems} item{totalItems > 1 ? 's' : ''} in cart
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
                    <BadgePercent size={16} className="text-primary" />
                    {appliedCoupon ? `${appliedCoupon.code} active` : 'Coupon ready'}
                  </span>
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{summaryLabel}</p>
                    <p className="mt-1 text-xs text-slate-500">Free delivery threshold: {formatPrice(freeShippingThreshold)}</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary shadow-sm">
                    Progress
                  </span>
                </div>
                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#0f766e_0%,#22c55e_100%)] transition-all duration-500"
                    style={{ width: `${shippingProgress}%` }}
                  />
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Subtotal</p>
                    <p className="mt-2 text-xl font-bold text-slate-950">{formatPrice(subtotal)}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Average item</p>
                    <p className="mt-2 text-xl font-bold text-slate-950">{formatPrice(averageItemPrice)}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Current total</p>
                    <p className="mt-2 text-xl font-bold text-primary">{formatPrice(totalPrice)}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section className="space-y-5">
              {items.map((item, index) => (
                <article
                  key={`${item.id}-${item.selected_variant_key || 'base'}`}
                  className="overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-sm transition hover:shadow-lg hover:shadow-slate-200/50"
                >
                  <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center">
                    <div className="flex flex-1 gap-4 sm:gap-5">
                      <Link to={`/product/${item.slug}`} className="block shrink-0">
                        <img
                          src={getOptimizedCloudinaryImage(item.image, { width: 320, height: 320, fit: 'limit' })}
                          alt={item.name}
                          className="h-24 w-24 rounded-[1.25rem] bg-slate-100 object-cover sm:h-28 sm:w-28"
                          referrerPolicy="no-referrer"
                        />
                      </Link>

                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                            <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">{item.category}</span>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">Item #{String(item.id).slice(-6)}</span>
                          </div>
                          <Link
                            to={`/product/${item.slug}`}
                            className="line-clamp-2 text-lg font-bold leading-snug text-slate-950 transition hover:text-primary sm:text-xl"
                          >
                            {item.name}
                          </Link>
                          {item.selected_variant_summary ? (
                            <p className="text-xs font-medium text-primary">{item.selected_variant_summary}</p>
                          ) : null}
                          {item.selected_variant_sku ? (
                            <p className="text-[11px] font-semibold text-slate-500">SKU: {item.selected_variant_sku}</p>
                          ) : null}
                          <p className="text-sm text-slate-500">
                            {formatPrice(item.price)} each
                            {item.stock > 0 && (
                              <span className="ml-2 text-slate-400">• {item.stock} in stock</span>
                            )}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <div className="inline-flex items-center rounded-2xl border border-slate-200 bg-slate-50 p-1">
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity - 1, item.selected_variant_key)}
                              disabled={item.quantity <= 1}
                              className={cn(
                                'inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition',
                                item.quantity <= 1 ? 'cursor-not-allowed opacity-40' : 'hover:bg-white hover:text-slate-950',
                              )}
                            >
                              <Minus size={16} />
                            </button>
                            <span className="min-w-[3rem] px-2 text-center text-sm font-bold text-slate-950">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity + 1, item.selected_variant_key)}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-white hover:text-slate-950"
                            >
                              <Plus size={16} />
                            </button>
                          </div>

                          <button
                            onClick={() => removeFromCart(item.id, item.selected_variant_key)}
                            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 size={16} />
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-end justify-between gap-4 border-t border-slate-100 pt-4 lg:min-w-[160px] lg:flex-col lg:items-end lg:justify-center lg:border-t-0 lg:pt-0">
                      <div className="text-left lg:text-right">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Line total</p>
                        <p className="mt-1 text-2xl font-bold text-primary">{formatPrice(item.price * item.quantity)}</p>
                      </div>
                      <Link to={`/product/${item.slug}`} className="text-sm font-semibold text-primary transition hover:text-primary/80">
                        Edit item
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </section>

            <aside className="space-y-5">
              <div className="rounded-[1.75rem] border border-slate-200/80 bg-white p-6 shadow-sm sm:p-7 xl:sticky xl:top-24">
                <h2 className="border-b border-slate-100 pb-4 text-xl font-bold text-slate-950">Order summary</h2>

                <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{summaryLabel}</p>
                      <p className="mt-1 text-xs text-slate-500">Threshold: {formatPrice(freeShippingThreshold)}</p>
                    </div>
                    <CheckCircle2 size={18} className={shippingRemaining > 0 ? 'text-slate-300' : 'text-primary'} />
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#0f766e_0%,#22c55e_100%)] transition-all duration-500"
                      style={{ width: `${shippingProgress}%` }}
                    />
                  </div>
                </div>

                <div className="mt-5 rounded-[1.5rem] border border-dashed border-slate-300 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <BadgePercent size={18} className="text-primary" />
                    <h3 className="text-base font-bold text-slate-950">Have a coupon?</h3>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Apply a valid offer code before checkout to reduce your total instantly.
                  </p>
                  {sellerIds.length > 1 ? (
                    <FormNotice tone="info" className="mt-3 text-xs">
                      Seller-specific coupons only work when your cart contains products from one seller storefront.
                    </FormNotice>
                  ) : null}

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      placeholder="Enter coupon code"
                      disabled={loading || !!appliedCoupon}
                      className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <button
                      onClick={() => void handleApplyCoupon()}
                      disabled={loading || !couponCode.trim() || !!appliedCoupon}
                      className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loading ? 'Applying...' : 'Apply'}
                    </button>
                  </div>

                  {error ? <FormNotice tone="error" className="mt-3 text-xs">{error}</FormNotice> : null}
                  {success ? <FormNotice tone="success" className="mt-3 text-xs">{success}</FormNotice> : null}
                  {appliedCoupon && !success ? (
                    <FormNotice tone="info" className="mt-3 text-xs">
                      Coupon "{appliedCoupon.code}" is active and already reflected in your order summary.
                    </FormNotice>
                  ) : null}
                </div>

                <div className="mt-6 space-y-4">
                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <span>Subtotal</span>
                    <span className="font-medium text-slate-900">{formatPrice(subtotal)}</span>
                  </div>

                  {appliedCoupon && (
                    <div className="flex items-start justify-between gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 font-semibold text-emerald-700">
                          <BadgePercent size={15} />
                          <span>{appliedCoupon.code} applied</span>
                          <button onClick={removeCoupon} className="text-rose-500 transition hover:text-rose-700">
                            <X size={14} />
                          </button>
                        </div>
                        <p className="mt-1 text-xs text-emerald-700/80">Your current savings are already reflected below.</p>
                      </div>
                      <span className="font-semibold text-emerald-700">-{formatPrice(discountAmount)}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <span>Delivery charge</span>
                    <span className="font-medium text-primary">Free</span>
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <p className="text-sm text-slate-500">Pay now</p>
                        <p className="text-2xl font-bold text-slate-950">{formatPrice(totalPrice)}</p>
                      </div>
                      <p className="text-right text-xs leading-5 text-slate-500">
                        Taxes and delivery are already simplified for this checkout preview.
                      </p>
                    </div>
                  </div>
                </div>

                <Link
                  to="/checkout"
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Proceed to checkout
                  <ArrowRight size={18} />
                </Link>

                <Link
                  to="/shop"
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Continue shopping
                  <ChevronRight size={17} />
                </Link>
              </div>

              <div className="rounded-[1.75rem] border border-slate-200/80 bg-slate-950 p-6 text-white shadow-lg">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">Why checkout here</p>
                <div className="mt-4 space-y-4">
                  {trustPoints.map((point) => (
                    <div key={point.title} className="flex items-start gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white">
                        {point.icon}
                      </span>
                      <div>
                        <h4 className="text-sm font-semibold text-white">{point.title}</h4>
                        <p className="mt-1 text-sm leading-6 text-slate-300">{point.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
      <div className="fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 md:hidden">
        <div className="rounded-[1.5rem] border border-slate-200/80 bg-white/96 p-3 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Cart total</p>
              <p className="text-lg font-bold text-slate-950">{formatPrice(totalPrice)}</p>
            </div>
            <Link
              to="/checkout"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Checkout
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
