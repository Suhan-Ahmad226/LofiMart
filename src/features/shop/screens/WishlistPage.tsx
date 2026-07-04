import React from 'react';
import { Link } from '@/src/lib/navigation';
import { Heart, ShoppingCart, Trash2, ArrowRight } from 'lucide-react';
import { useCart } from '@/src/context/CartContext';
import { useWishlist } from '@/src/context/WishlistContext';
import { formatPrice } from '@/src/lib/utils';
import { getOptimizedCloudinaryImage } from '@/src/lib/cloudinary';

export const WishlistPage = () => {
  const { addToCart } = useCart();
  const { items: wishlistItems, removeFromWishlist } = useWishlist();
  
  return (
    <div className="max-w-7xl mx-auto px-4 py-12 space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold font-display">My Wishlist</h1>
          <p className="text-gray-500 mt-2">You have {wishlistItems.length} items saved for later.</p>
        </div>
        <Link to="/shop" className="text-primary font-bold flex items-center space-x-2 hover:underline">
          <span>Continue Shopping</span>
          <ArrowRight size={18} />
        </Link>
      </div>

      {wishlistItems.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {wishlistItems.map((item) => (
            <div 
              key={item.id}
              className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden group"
            >
              <div className="relative aspect-square overflow-hidden">
                <img 
                  src={getOptimizedCloudinaryImage(item.image, { width: 720, height: 720, fit: 'limit' })} 
                  alt={item.name} 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  referrerPolicy="no-referrer"
                />
                <button 
                  onClick={() => removeFromWishlist(item.id)}
                  className="absolute top-4 right-4 p-2 bg-white/90 backdrop-blur-sm rounded-full text-accent hover:bg-accent hover:text-white transition-all shadow-sm"
                >
                  <Trash2 size={18} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-1">{item.category}</p>
                  <h3 className="font-bold text-lg leading-tight">{item.name}</h3>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xl font-bold text-primary">{formatPrice(item.price)}</p>
                  <button 
                    onClick={() => addToCart(item)}
                    className="flex items-center space-x-2 bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary transition-all"
                  >
                    <ShoppingCart size={16} />
                    <span>Add to Cart</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-24 space-y-6">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-50 rounded-full text-gray-300">
            <Heart size={40} />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Your wishlist is empty</h2>
            <p className="text-gray-500">Save items you love to find them easily later.</p>
          </div>
          <Link to="/shop" className="btn-primary inline-block px-8 py-3">
            Explore Products
          </Link>
        </div>
      )}
    </div>
  );
};
