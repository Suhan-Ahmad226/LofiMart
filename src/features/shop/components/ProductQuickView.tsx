'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ShoppingCart,
  Heart,
  Star,
  Minus,
  Plus,
  Eye,
} from 'lucide-react';
import { Link } from '../../../lib/navigation';
import OptimizedImage from '@/features/shared/ui/OptimizedImage';
import { Product } from '../../../types';
import { formatPrice } from '../../../lib/utils';
import { useCart } from '../../../features/shop/state/CartContext';
import { useWishlist } from '../../../features/shop/state/WishlistContext';

interface ProductQuickViewProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
}

export const ProductQuickView: React.FC<ProductQuickViewProps> = ({
  product,
  isOpen,
  onClose,
}) => {
  const { addToCart, items } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const [quantity, setQuantity] = useState(1);
  const isWishlisted = isInWishlist(product.id);
  const isAlreadyInCart = items.some(
    (item) =>
      item.id === product.id &&
      (item.selected_variant_key || '') === (product.selected_variant_key || ''),
  );
  const discount =
    product.old_price > product.price
      ? Math.round(
          ((product.old_price - product.price) / product.old_price) * 100,
        )
      : 0;

  const handleAddToCart = useCallback(() => {
    addToCart(product, quantity);
  }, [addToCart, product, quantity]);

  const handleWishlist = useCallback(() => {
    toggleWishlist(product);
  }, [toggleWishlist, product]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setQuantity(1);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const discountLabel = discount > 0 ? `-${discount}%` : null;
  const hasVariants =
    Array.isArray(product.variant_options) && product.variant_options.length > 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm sm:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative flex w-full max-w-4xl flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-2xl max-h-[90vh] sm:flex-row"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-slate-600 shadow-sm backdrop-blur transition hover:bg-white hover:text-slate-900"
              aria-label="Close quick view"
            >
              <X size={18} />
            </button>

            {/* Image section */}
            <div className="relative flex aspect-square w-full flex-shrink-0 items-center justify-center bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] sm:w-[45%]">
              {product.image ? (
                <OptimizedImage
                  src={product.image}
                  alt={product.name}
                  widthHint={800}
                  heightHint={800}
                  fit="limit"
                  quality="auto:best"
                  eager
                  showPlaceholder={false}
                  className="h-full w-full object-contain p-6 sm:p-8"
                />
              ) : (
                <div className="grid h-full w-full place-items-center p-8 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
                    <Eye className="h-7 w-7" />
                  </div>
                </div>
              )}
              {discountLabel && (
                <div className="absolute left-4 top-4 rounded-xl bg-red-500 px-3 py-1 text-xs font-bold text-white shadow-lg">
                  {discountLabel}
                </div>
              )}
              <Link
                to={`/product/${product.slug}`}
                className="absolute bottom-3 left-3 rounded-xl bg-white/85 px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:bg-white"
              >
                View full details
              </Link>
            </div>

            {/* Content section */}
            <div className="flex flex-1 flex-col overflow-y-auto">
              <div className="flex flex-col gap-4 p-5 sm:p-6">
                {/* Name */}
                <div>
                  <Link
                    to={`/product/${product.slug}`}
                    className="text-lg font-bold leading-snug text-slate-900 transition hover:text-primary sm:text-xl"
                  >
                    {product.name}
                  </Link>
                  {product.category && (
                    <p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-400">
                      {product.category}
                    </p>
                  )}
                </div>

                {/* Rating */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Star
                      size={15}
                      className="text-yellow-400"
                      fill="currentColor"
                    />
                    <span className="text-sm font-bold text-slate-700">
                      {product.rating}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">
                    ({product.reviews_count} reviews)
                  </span>
                </div>

                {/* Price */}
                <div className="flex items-baseline gap-3">
                  <span className="text-2xl font-bold text-primary">
                    {formatPrice(product.price)}
                  </span>
                  {product.old_price > product.price && (
                    <span className="text-sm text-slate-400 line-through">
                      {formatPrice(product.old_price)}
                    </span>
                  )}
                </div>

                {/* Description */}
                {product.description && (
                  <div className="border-t border-slate-100 pt-3">
                    <p className="text-sm leading-relaxed text-slate-600 line-clamp-4">
                      {product.description}
                    </p>
                  </div>
                )}

                {/* Variants */}
                {hasVariants && (
                  <div className="border-t border-slate-100 pt-3">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Options
                    </p>
                    <p className="text-sm text-slate-600">
                      View the full product page to select variants.
                    </p>
                  </div>
                )}

                {/* Stock status */}
                <div className="border-t border-slate-100 pt-3">
                  <p
                    className={`text-sm font-semibold ${
                      product.stock > 0
                        ? 'text-emerald-600'
                        : 'text-red-500'
                    }`}
                  >
                    {product.stock > 0
                      ? `${product.stock} in stock`
                      : 'Out of stock'}
                  </p>
                </div>

                {/* Quantity + Actions */}
                <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                  {/* Quantity */}
                  <div className="flex items-center rounded-xl border border-slate-200 bg-white">
                    <button
                      type="button"
                      onClick={() =>
                        setQuantity((q) => Math.max(1, q - 1))
                      }
                      disabled={product.stock <= 0}
                      className="flex h-10 w-10 items-center justify-center text-slate-600 transition hover:text-slate-900 disabled:opacity-30"
                      aria-label="Decrease quantity"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="flex h-10 w-10 items-center justify-center text-sm font-bold text-slate-900">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setQuantity((q) =>
                          Math.min(product.stock, q + 1),
                        )
                      }
                      disabled={quantity >= product.stock}
                      className="flex h-10 w-10 items-center justify-center text-slate-600 transition hover:text-slate-900 disabled:opacity-30"
                      aria-label="Increase quantity"
                    >
                      <Plus size={16} />
                    </button>
                  </div>

                  {/* Add to cart */}
                  <button
                    type="button"
                    onClick={handleAddToCart}
                    disabled={product.stock <= 0}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ShoppingCart size={18} />
                    <span>
                      {isAlreadyInCart
                        ? 'Already in Cart'
                        : 'Add to Cart'}
                    </span>
                  </button>

                  {/* Wishlist */}
                  <button
                    type="button"
                    onClick={handleWishlist}
                    className={`flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                      isWishlisted
                        ? 'border-red-200 bg-red-50 text-red-500'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                    }`}
                    aria-label={
                      isWishlisted
                        ? 'Remove from wishlist'
                        : 'Add to wishlist'
                    }
                  >
                    <Heart
                      size={18}
                      fill={isWishlisted ? 'currentColor' : 'none'}
                    />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ProductQuickView;
