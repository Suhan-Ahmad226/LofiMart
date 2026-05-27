import React from 'react';
import { Link } from '@/src/lib/navigation';
import { Heart, Scale, ShoppingCart, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCart } from '../context/CartContext';
import { useCompare } from '../context/CompareContext';
import { useWishlist } from '../context/WishlistContext';
import { Product } from '../types';
import { formatPrice } from '../lib/utils';
import OptimizedImage from './ui/OptimizedImage';

const ProductCardComponent: React.FC<{ product: Product }> = ({ product }) => {
  const { items, addToCart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { toggleCompare, isInCompare } = useCompare();

  const discount =
    product.old_price > product.price && product.old_price > 0
      ? Math.round(((product.old_price - product.price) / product.old_price) * 100)
      : 0;
  const isWishlisted = isInWishlist(product.id);
  const compared = isInCompare(product.id);
  const isAlreadyInCart = items.some(
    (item) => item.id === product.id && (item.selected_variant_key || '') === (product.selected_variant_key || ''),
  );

  const handleCompareToggle = () => {
    const result = toggleCompare(product);
    if (result.reason) {
      toast.error(result.reason);
      return;
    }

    toast.success(result.added ? 'Added to compare list' : 'Removed from compare list');
  };

  const handleAddToCart = () => {
    if (isAlreadyInCart) {
      toast('This item is already in your cart.', { icon: '🛒' });
      return;
    }

    addToCart(product);
  };

  return (
    <article className="product-card group">
      <div className="product-card__media">
        <Link to={`/product/${product.slug}`} className="block h-full w-full">
          <OptimizedImage
            src={product.image}
            alt={product.name}
            widthHint={640}
            heightHint={640}
            fit="limit"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </Link>

        {discount > 0 ? (
          <div className="absolute left-3 top-3 rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
            -{discount}%
          </div>
        ) : null}

        <div className="absolute right-3 top-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => toggleWishlist(product)}
            className={`rounded-full bg-white/92 p-2.5 text-slate-500 shadow-sm backdrop-blur-sm transition-colors ${
              isWishlisted ? 'text-accent' : 'hover:text-accent'
            }`}
            aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          >
            <Heart size={18} fill={isWishlisted ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            onClick={handleCompareToggle}
            className={`rounded-full bg-white/92 p-2.5 text-slate-500 shadow-sm backdrop-blur-sm transition-colors ${
              compared ? 'text-primary' : 'hover:text-primary'
            }`}
            aria-label={compared ? 'Remove from compare' : 'Add to compare'}
          >
            <Scale size={18} />
          </button>
        </div>
      </div>

      <div className="product-card__body">
        <Link to={`/product/${product.slug}`}>
          <h3 className="product-card__title">{product.name}</h3>
        </Link>

        <div className="product-card__meta">
          <div className="flex items-center text-yellow-400">
            <Star size={14} fill="currentColor" />
            <span className="ml-1 text-xs font-semibold text-slate-600">{product.rating}</span>
          </div>
          <span className="text-[10px] text-slate-400">({product.reviews_count})</span>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="product-card__price">{formatPrice(product.price)}</div>
            {product.old_price > product.price ? (
              <div className="text-xs text-slate-400 line-through">{formatPrice(product.old_price)}</div>
            ) : null}
          </div>

          <button type="button" onClick={handleAddToCart} className="product-card__cta shrink-0">
            <ShoppingCart size={16} />
            <span>{isAlreadyInCart ? 'Added' : 'Add'}</span>
          </button>
        </div>
      </div>
    </article>
  );
};

export const ProductCard = React.memo(ProductCardComponent);
