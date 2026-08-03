import React, { useEffect, useState } from 'react';
import { Link } from '../../../lib/navigation';
import { motion } from 'motion/react';
import { Star, ShoppingCart, Sparkles } from 'lucide-react';
import { Product } from '../../../types';
import { useCart } from '../../../features/shop/state/CartContext';
import { formatPrice } from '../../../lib/utils';
import { AnimatedIcon } from '../../../components/ui/AnimatedIcon';
import { getCachedClientValue } from '../../../lib/client-cache';
import OptimizedImage from '../../../components/ui/OptimizedImage';

interface AIRecommendationProps {
  productId?: number;
  title?: string;
  limit?: number;
}

export const AIRecommendation: React.FC<AIRecommendationProps> = ({
  productId,
  title = 'Recommended For You',
  limit = 4,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { addToCart } = useCart();

  useEffect(() => {
    let active = true;

    const fetchRecommendations = async () => {
      try {
        setLoading(true);
        setError('');
        const url = `/api/ai/recommendations?limit=${limit}${productId ? `&productId=${productId}` : ''}`;
        const cacheKey = `ai-recommendations:${productId || 'global'}:${limit}`;
        const data = await getCachedClientValue(cacheKey, 5 * 60 * 1000, async () => {
          const response = await fetch(url, { cache: 'no-store' });
          const payload = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(payload?.error || 'Unable to load recommendations');
          }
          return payload;
        });
        if (!active) return;
        setProducts(Array.isArray(data) ? data : []);
      } catch (error) {
        if (!active) return;
        setProducts([]);
        setError(error instanceof Error ? error.message : 'Unable to load recommendations');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void fetchRecommendations();

    return () => {
      active = false;
    };
  }, [productId, limit]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        {[...Array(limit)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="mb-4 aspect-square rounded-2xl bg-zinc-200" />
            <div className="mb-2 h-4 w-3/4 rounded bg-zinc-200" />
            <div className="h-4 w-1/2 rounded bg-zinc-200" />
          </div>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return error ? (
      <section className="py-8">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {error}
        </div>
      </section>
    ) : null;
  }

  return (
    <section className="py-12">
      <div className="mb-8 flex items-center gap-2">
        <AnimatedIcon loop="pulse" className="text-emerald-500">
          <Sparkles className="h-5 w-5 text-emerald-500" />
        </AnimatedIcon>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      </div>

      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        {products.map((product, index) => (
          <motion.div
            key={product.id}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            viewport={{ once: true }}
            className="group relative overflow-hidden rounded-3xl border border-zinc-100 bg-white transition-all duration-500 hover:shadow-xl"
          >
            <Link to={`/product/${product.slug}`} className="block aspect-square overflow-hidden">
              <OptimizedImage
                src={product.image}
                alt={product.name}
                widthHint={640}
                heightHint={640}
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
              />
            </Link>

            <div className="p-5">
              <div className="mb-2 flex items-center gap-1">
                <AnimatedIcon loop="none" className="text-yellow-400">
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                </AnimatedIcon>
                <span className="text-xs font-medium text-zinc-500">{product.rating}</span>
              </div>

              <Link to={`/product/${product.slug}`}>
                <h3 className="mb-1 line-clamp-1 font-semibold text-zinc-900 transition-colors group-hover:text-emerald-600">
                  {product.name}
                </h3>
              </Link>

              <p className="mb-3 line-clamp-1 text-xs text-zinc-500">{product.category}</p>

              <div className="flex items-center justify-between">
                <span className="font-bold text-zinc-900">{formatPrice(product.price)}</span>
                <button
                  type="button"
                  onClick={() => addToCart(product)}
                  className="rounded-xl bg-zinc-900 p-2 text-white transition-colors hover:bg-emerald-600"
                  aria-label={`Add ${product.name} to cart`}
                >
                  <AnimatedIcon loop="none">
                    <ShoppingCart className="h-4 w-4" />
                  </AnimatedIcon>
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};
