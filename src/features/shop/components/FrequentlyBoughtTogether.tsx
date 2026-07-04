import React, { useEffect, useState } from 'react';
import { Link } from '@/src/lib/navigation';
import { Loader2, Plus } from 'lucide-react';
import { Product } from '@/src/types';
import { formatPrice } from '@/src/lib/utils';
import { useCart } from '@/src/context/CartContext';
import OptimizedImage from '@/src/components/ui/OptimizedImage';
import { getCachedClientValue } from '@/src/lib/client-cache';

interface FrequentlyBoughtTogetherProps {
  productId: number;
}

export const FrequentlyBoughtTogether: React.FC<FrequentlyBoughtTogetherProps> = ({ productId }) => {
  const { addToCart } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    getCachedClientValue(`frequently-bought:${productId}`, 5 * 60 * 1000, async () => {
      const res = await fetch(`/api/ai/recommendations/collaborative?productId=${productId}&limit=3`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error('Failed to load related products');
      }
      return res.json();
    })
      .then((data) => {
        if (!active) return;
        setProducts(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!active) return;
        setProducts([]);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [productId]);

  if (loading) {
    return (
      <div className="flex min-h-[180px] items-center justify-center rounded-[2rem] border border-black/5 bg-white/90 shadow-sm">
        <Loader2 className="animate-spin text-primary" size={24} />
      </div>
    );
  }

  if (products.length === 0) {
    return null;
  }

  return (
    <div className="rounded-[2rem] border border-black/5 bg-white/90 p-8 shadow-sm">
      <p className="mb-3 text-sm font-bold uppercase tracking-[0.24em] text-primary/70">Frequently bought together</p>
      <h2 className="text-3xl font-bold text-gray-900">Popular pairings that reduce decision fatigue</h2>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {products.map((product) => (
          <div key={product.id} className="rounded-3xl border border-gray-100 bg-secondary/60 p-4">
            <Link to={`/product/${product.slug}`} className="block overflow-hidden rounded-2xl bg-white">
              <OptimizedImage src={product.image} alt={product.name} widthHint={720} heightHint={360} className="h-44 w-full object-cover" />
            </Link>
            <div className="mt-4">
              <Link to={`/product/${product.slug}`} className="line-clamp-2 font-semibold text-gray-900 hover:text-primary">
                {product.name}
              </Link>
              <p className="mt-1 text-sm text-gray-500">{product.category}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-bold text-primary">{formatPrice(product.price)}</span>
                <button
                  onClick={() => addToCart(product, 1)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 transition hover:border-primary hover:text-primary"
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
