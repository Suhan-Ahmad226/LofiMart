import React from 'react';
import { Heart, ShoppingCart, Trash2 } from 'lucide-react';
import { formatPrice } from '../../lib/utils';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import OptimizedImage from '../../components/ui/OptimizedImage';

export const CustomerWishlistPage = () => {
  const { addToCart } = useCart();
  const { items: wishlistItems, removeFromWishlist } = useWishlist();
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Wishlist</h1>
      {wishlistItems.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-black/5 shadow-sm text-center">
          <Heart className="mx-auto text-gray-300 mb-4" size={48} />
          <p className="text-gray-500">Your wishlist is empty.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {wishlistItems.map((item) => (
            <div key={item.id} className="bg-white p-4 rounded-2xl border border-black/5 shadow-sm flex space-x-4">
              <OptimizedImage src={item.image} alt={item.name} widthHint={192} heightHint={192} className="w-24 h-24 rounded-xl object-cover" />
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold truncate">{item.name}</h3>
                  <p className="text-primary font-bold">{formatPrice(item.price)}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={() => addToCart(item)}
                    className="flex-1 btn-primary py-2 text-xs flex items-center justify-center space-x-1"
                  >
                    <ShoppingCart size={14} />
                    <span>Add to Cart</span>
                  </button>
                  <button 
                    onClick={() => removeFromWishlist(item.id)}
                    className="p-2 text-gray-400 hover:text-accent transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
