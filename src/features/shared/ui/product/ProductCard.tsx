'use client';

import React, { memo, useCallback, useMemo } from 'react';
import { Link } from '@/lib/navigation';
import { Eye, Heart, ShoppingCart, Star, Scale } from 'lucide-react';
import { Product } from '@/types';
import { formatPrice } from '@/lib/utils';
import { useCart } from '@/features/shop/state/CartContext';
import { useWishlist } from '@/features/shop/state/WishlistContext';
import { useCompare } from '@/features/shop/state/CompareContext';
import OptimizedImage from '@/features/shared/ui/OptimizedImage';
import toast from '@/lib/toast';

type ProductCardVariant = 'default' | 'compact' | 'horizontal';

type ProductCardProps = {
  product: Product;
  variant?: ProductCardVariant;
  onQuickView?: (product: Product) => void;
  showWishlist?: boolean;
  showCompare?: boolean;
  showAddToCart?: boolean;
  className?: string;
  eager?: boolean;
};

const ProductCardComponent = ({
  product,
  variant = 'default',
  onQuickView,
  showWishlist = true,
  showCompare = true,
  showAddToCart = true,
  className,
  eager = false,
}: ProductCardProps) => {
  const { addToCart, items } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { toggleCompare, isInCompare } = useCompare();
  const oldPrice = product.old_price ?? 0;

  const discount = useMemo(
    () =>
      oldPrice > product.price
        ? Math.round(((oldPrice - product.price) / oldPrice) * 100)
        : 0,
    [oldPrice, product.price],
  );

  const savings = useMemo(
    () => (oldPrice > product.price ? oldPrice - product.price : 0),
    [oldPrice, product.price],
  );

  const isWishlisted = isInWishlist(product.id);
  const isCompared = isInCompare(product.id);
  const isInCart = useMemo(
    () =>
      items.some(
        (item) =>
          item.id === product.id &&
          (item.selected_variant_key || '') === (product.selected_variant_key || ''),
      ),
    [items, product.id, product.selected_variant_key],
  );

  const handleWishlistToggle = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      toggleWishlist(product);
    },
    [product, toggleWishlist],
  );

  const handleCompareToggle = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const result = toggleCompare(product);
      if (result.added) {
        toast.success(`${product.name} added to compare`);
      } else if (result.reason) {
        toast.warning(result.reason);
      } else {
        toast.success(`${product.name} removed from compare`);
      }
    },
    [product, toggleCompare],
  );

  const handleAddToCart = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      addToCart(product);
    },
    [product, addToCart],
  );

  const handleQuickView = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onQuickView?.(product);
    },
    [product, onQuickView],
  );

  const sellerName = product.store_name || product.seller_name || 'Marketplace seller';
  const hasSeller = Boolean(product.store_name || product.seller_name);
  const hasReviews = typeof product.reviews_count === 'number' && product.reviews_count > 0;
  const fullStars = Math.floor(product.rating || 0);

  if (variant === 'compact') {
    return (
      <article
        className={`group relative flex h-full flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500/60 hover:shadow-md ${className ?? ''}`}
      >
        <Link to={`/product/${product.slug}`} className="relative block aspect-square overflow-hidden bg-slate-50">
          {discount > 0 && (
            <span className="absolute left-2 top-2 z-10 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
              -{discount}%
            </span>
          )}
          {showWishlist && (
            <button
              type="button"
              onClick={handleWishlistToggle}
              aria-label={isWishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
              className={`absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 shadow-xs transition-transform duration-200 hover:scale-110 active:scale-90 ${
                isWishlisted ? 'text-rose-500 bg-rose-50/90 border border-rose-200' : 'text-slate-600 hover:text-rose-500'
              }`}
            >
              <Heart size={15} fill={isWishlisted ? 'currentColor' : 'none'} />
            </button>
          )}
          <OptimizedImage
            src={product.image}
            alt={product.name}
            widthHint={320}
            heightHint={320}
            fit="limit"
            eager={eager}
            sizes="(max-width: 640px) 44vw, (max-width: 768px) 30vw, 18vw"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </Link>
        <div className="flex flex-1 flex-col p-2.5">
          <Link to={`/product/${product.slug}`} className="block">
            <span className="line-clamp-2 text-xs font-semibold leading-snug text-slate-900 transition-colors hover:text-emerald-700">
              {product.name}
            </span>
          </Link>
          <div className="mt-auto flex items-end justify-between gap-1.5 pt-2">
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-bold text-slate-900 tabular-nums">{formatPrice(product.price)}</p>
              {discount > 0 && (
                <p className="text-[11px] text-slate-400 line-through tabular-nums">{formatPrice(oldPrice)}</p>
              )}
            </div>
            {showAddToCart && product.stock > 0 && (
              <button
                type="button"
                onClick={handleAddToCart}
                aria-label={`Add ${product.name} to cart`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs transition-all duration-200 hover:bg-emerald-700 active:scale-90"
              >
                <ShoppingCart size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </article>
    );
  }

  if (variant === 'horizontal') {
    return (
      <article className={`product-card-horizontal group flex gap-4 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs transition-all duration-200 hover:border-emerald-500/60 hover:shadow-md ${className ?? ''}`}>
        <Link to={`/product/${product.slug}`} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-50 sm:h-28 sm:w-28">
          <OptimizedImage
            src={product.image}
            alt={product.name}
            widthHint={160}
            heightHint={160}
            fit="limit"
            eager={eager}
            sizes="112px"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {discount > 0 && (
            <span className="absolute left-1.5 top-1.5 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-xs">
              -{discount}%
            </span>
          )}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div>
            <Link to={`/product/${product.slug}`}>
              <h3 className="line-clamp-2 text-sm font-bold text-slate-900 transition-colors hover:text-emerald-700">
                {product.name}
              </h3>
            </Link>
            {hasSeller && (
              <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <span className="truncate">{sellerName}</span>
                {product.verification_badge && <Scale size={14} className="shrink-0 text-emerald-600" />}
              </p>
            )}
          </div>
          <div className="mt-2 flex items-end justify-between gap-2">
            <div>
              <p className="text-base sm:text-lg font-bold text-slate-900 tabular-nums">{formatPrice(product.price)}</p>
              {discount > 0 && (
                <p className="text-xs text-slate-400 line-through tabular-nums">{formatPrice(oldPrice)}</p>
              )}
            </div>
            {showAddToCart && (
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={product.stock <= 0}
                className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-all duration-200 hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isInCart ? 'In Cart' : product.stock <= 0 ? 'Out of Stock' : 'Add'}
              </button>
            )}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className={`product-card group relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-3 shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-emerald-500/60 hover:shadow-[0_14px_30px_-6px_rgba(15,23,42,0.12)] ${className ?? ''}`}
    >
      <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-slate-50/80 p-2">
        {discount > 0 && (
          <div className="absolute left-2 top-2 z-10 flex flex-col items-start gap-1">
            <span className="inline-flex items-center rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-xs">
              -{discount}%
            </span>
            {savings > 0 && (
              <span className="hidden sm:inline-flex items-center rounded-full bg-emerald-600/90 px-2 py-0.5 text-[10px] font-medium text-white shadow-xs">
                Save {formatPrice(savings)}
              </span>
            )}
          </div>
        )}

        <div className="absolute right-2 top-2 z-10 flex flex-col gap-1.5 opacity-90 transition-opacity duration-200 group-hover:opacity-100">
          {showWishlist && (
            <button
              type="button"
              onClick={handleWishlistToggle}
              className={`flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/80 bg-white/95 shadow-sm transition-transform duration-200 hover:scale-110 active:scale-90 ${isWishlisted ? 'text-rose-500 border-rose-200 bg-rose-50/90' : 'text-slate-600 hover:text-rose-500'}`}
              aria-label={isWishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
            >
              <Heart size={16} fill={isWishlisted ? 'currentColor' : 'none'} className="transition-colors duration-200" />
            </button>
          )}
          {showCompare && (
            <button
              type="button"
              onClick={handleCompareToggle}
              className={`flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/80 bg-white/95 shadow-sm transition-transform duration-200 hover:scale-110 active:scale-90 ${isCompared ? 'text-emerald-600 border-emerald-200 bg-emerald-50/90' : 'text-slate-600 hover:text-emerald-600'}`}
              aria-label={isCompared ? `Remove ${product.name} from compare` : `Add ${product.name} to compare`}
            >
              <Scale size={15} />
            </button>
          )}
          {onQuickView && (
            <button
              type="button"
              onClick={handleQuickView}
              className="hidden sm:flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/80 bg-white/95 text-slate-600 shadow-sm transition-transform duration-200 hover:scale-110 hover:text-emerald-600 active:scale-90"
              aria-label={`Quick view ${product.name}`}
            >
              <Eye size={15} />
            </button>
          )}
        </div>

        <Link to={`/product/${product.slug}`} className="relative h-full w-full flex items-center justify-center">
          <OptimizedImage
            src={product.image}
            alt={product.name}
            widthHint={400}
            heightHint={500}
            fit="limit"
            eager={eager}
            sizes="(max-width: 640px) 44vw, (max-width: 768px) 30vw, (max-width: 1024px) 22vw, 18vw"
            className="h-full w-full object-contain object-center transition-transform duration-500 ease-out group-hover:scale-105"
          />
        </Link>
      </div>

      <div className="flex min-h-[148px] flex-1 flex-col pt-3">
        {(product.category || hasSeller) && (
          <div className="mb-1.5 flex items-center gap-1.5 text-xs text-slate-500">
            {product.category && <span className="font-medium text-slate-500">{product.category}</span>}
            {product.category && hasSeller && <span>·</span>}
            {hasSeller && (
              <span className="truncate text-slate-600">
                {sellerName}
              </span>
            )}
          </div>
        )}

        <Link to={`/product/${product.slug}`} className="group/title block">
          <h2 className="mb-1.5 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-slate-900 transition-colors duration-150 group-hover/title:text-emerald-700">
            {product.name}
          </h2>
        </Link>

        <div className="mb-2 flex items-center gap-1.5">
          <div className="flex items-center text-amber-400">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                size={12}
                className={i < fullStars ? 'fill-current text-amber-400' : 'text-slate-200 fill-current'}
              />
            ))}
          </div>
          {hasReviews ? (
            <span className="text-[11px] font-medium text-slate-500">({product.reviews_count})</span>
          ) : (
            <span className="text-[10px] text-slate-500">New</span>
          )}
        </div>

        <div className="mb-3 flex items-baseline gap-2 pt-0.5">
          <span className="text-base sm:text-lg font-bold text-slate-900 tabular-nums">
            {formatPrice(product.price)}
          </span>
          {discount > 0 && (
            <del className="text-xs font-normal text-slate-500 line-through tabular-nums">
              {formatPrice(oldPrice)}
            </del>
          )}
        </div>

        {showAddToCart && (
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={product.stock <= 0}
            className={`mt-auto inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold tracking-wide transition-all duration-200 active:scale-[0.98] ${
              isInCart
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
                : product.stock <= 0
                ? 'bg-slate-100 text-slate-500 cursor-not-allowed border border-slate-200'
                : 'bg-emerald-600 text-white shadow-xs hover:bg-emerald-700 hover:shadow-md'
            }`}
          >
            <ShoppingCart size={15} className="transition-transform group-hover:-translate-y-0.5" />
            <span>{isInCart ? 'In Cart' : product.stock <= 0 ? 'Out of Stock' : 'Add to Cart'}</span>
          </button>
        )}
      </div>
    </article>
  );
};

export const ProductCard = memo(ProductCardComponent);
