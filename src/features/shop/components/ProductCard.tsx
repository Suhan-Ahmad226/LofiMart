import React from 'react';
import { Link } from '../../../lib/navigation';
import { Star, ShoppingCart, Heart, Scale, Eye } from 'lucide-react';
import { Product } from '../../../types';
import { formatPrice } from '../../../lib/utils';
import { useCart } from '../../../features/shop/state/CartContext';
import { useWishlist } from '../../../features/shop/state/WishlistContext';
import { useCompare } from '../../../features/shop/state/CompareContext';
import toast from 'react-hot-toast';
import OptimizedImage from '../../../components/ui/OptimizedImage';

export const ProductCard: React.FC<{ product: Product; onQuickView?: (product: Product) => void }> = ({ product, onQuickView }) => {
  const { items, addToCart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { toggleCompare, isInCompare } = useCompare();
  const discount = Math.round(((product.old_price - product.price) / product.old_price) * 100);
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

  return (
    <div className="product-card group">
      <div className="relative aspect-square overflow-hidden bg-secondary">
        <Link to={`/product/${product.slug}`}>
          <OptimizedImage
            src={product.image}
            alt={product.name}
            widthHint={640}
            heightHint={640}
            fit="limit"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        </Link>
        {discount > 0 && (
          <div className="absolute top-3 left-3 bg-accent text-white text-xs font-bold px-2 py-1 rounded">
            -{discount}%
          </div>
        )}
        {onQuickView && (
          <button
            type="button"
            onClick={() => onQuickView(product)}
            className="absolute left-3 top-3 inline-flex items-center justify-center rounded-full bg-white/85 p-2 text-sm shadow-sm backdrop-blur-sm transition-colors text-muted-foreground hover:text-primary"
            aria-label="Quick view"
            title="Quick view"
          >
            <Eye size={18} />
          </button>
        )}
        <button 
          onClick={() => toggleWishlist(product)}
          className={`touch-target absolute top-3 right-3 inline-flex items-center justify-center rounded-full bg-white/85 p-2 text-sm shadow-sm backdrop-blur-sm transition-colors ${isWishlisted ? 'text-accent' : 'text-muted-foreground hover:text-accent'}`}
          aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          <Heart size={18} fill={isWishlisted ? "currentColor" : "none"} />
        </button>
        <button
          onClick={handleCompareToggle}
          className={`touch-target absolute right-3 top-[4.25rem] inline-flex items-center justify-center rounded-full bg-white/85 p-2 text-sm shadow-sm backdrop-blur-sm transition-colors ${compared ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}
          title={compared ? 'Remove from compare' : 'Add to compare'}
          aria-label={compared ? 'Remove from compare' : 'Add to compare'}
        >
          <Scale size={18} />
        </button>
        
        {/* Quick Add Button */}
        <button
          onClick={() => {
            if (isAlreadyInCart) {
              toast('This item is already in your cart.', { icon: 'ðŸ›’' });
              return;
            }
            addToCart(product);
          }}
          className="absolute inset-x-0 bottom-0 flex translate-y-0 items-center justify-center gap-2 bg-primary px-3 py-3 text-sm font-semibold text-white transition-transform duration-300 sm:translate-y-full sm:group-hover:translate-y-0"
        >
          <ShoppingCart size={18} />
          <span>{isAlreadyInCart ? 'Already in Cart' : 'Add to Cart'}</span>
        </button>
      </div>
      
      <div className="product-card__body p-4">
        <Link to={`/product/${product.slug}`}>
          <h3 className="product-card__title mb-1 line-clamp-2 h-10 text-sm font-medium text-foreground transition-colors hover:text-primary">
            {product.name}
          </h3>
        </Link>
        
        <div className="flex items-center space-x-1 mb-2">
          <div className="flex items-center text-yellow-400">
            <Star size={14} fill="currentColor" />
            <span className="text-xs font-semibold ml-1 text-muted-foreground">{product.rating}</span>
          </div>
          <span className="text-[10px] text-muted-foreground/70">({product.reviews_count})</span>
        </div>
        
        <div className="flex items-center space-x-2">
          <span className="product-card__price text-lg font-bold text-primary">{formatPrice(product.price)}</span>
          {product.old_price > product.price && (
            <span className="text-sm text-muted-foreground/70 line-through">{formatPrice(product.old_price)}</span>
          )}
        </div>
      </div>
    </div>
  );
};
