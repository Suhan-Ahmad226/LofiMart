import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, MessageSquareText, Star } from 'lucide-react';
import { Link } from '@/src/lib/navigation';
import { SellerEmptyState, SellerPageHeader, SellerStatCard } from '@/src/components/seller/SellerPageHeader';
import { useUser } from '@/src/context/UserContext';
import { Product } from '@/src/types';

type ProductReview = {
  id: string;
  rating: number;
  comment: string;
  created_at?: string;
  user_name?: string;
};

type ReviewEntry = ProductReview & {
  productName: string;
  productSlug: string;
};

export const SellerReviewsPage = () => {
  const { token } = useUser();
  const [products, setProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<ReviewEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    setError('');

    fetch('/api/seller/products', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || 'Failed to load seller products');
        const nextProducts = Array.isArray(payload) ? payload : [];
        if (!mounted) return;
        setProducts(nextProducts);

        const reviewedProducts = nextProducts.filter((product: Product) => Number(product.reviews_count || 0) > 0);
        const reviewPayloads = await Promise.all(
          reviewedProducts.map(async (product: Product) => {
            const reviewResponse = await fetch(`/api/products/${product.id}/reviews`);
            const reviewData = await reviewResponse.json().catch(() => []);
            return {
              product,
              reviews: Array.isArray(reviewData) ? reviewData : [],
            };
          }),
        );

        if (!mounted) return;
        setReviews(
          reviewPayloads.flatMap(({ product, reviews: productReviews }) =>
            productReviews.map((review: ProductReview) => ({
              ...review,
              productName: product.name,
              productSlug: product.slug,
            })),
          ),
        );
      })
      .catch((requestError: unknown) => {
        if (!mounted) return;
        setProducts([]);
        setReviews([]);
        setError(requestError instanceof Error ? requestError.message : 'Failed to load reviews.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  const reviewedProducts = useMemo(() => products.filter((product) => Number(product.reviews_count || 0) > 0), [products]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <SellerPageHeader
        eyebrow="Customer feedback"
        title="Reviews"
        description="See live reviews from your storefront products and identify listings that need updates, richer copy, or better stock quality."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <SellerStatCard label="Reviewed products" value={reviewedProducts.length} />
        <SellerStatCard label="Total reviews" value={reviews.length} />
        <SellerStatCard
          label="Avg rating"
          value={reviewedProducts.length > 0 ? (reviewedProducts.reduce((sum, product) => sum + Number(product.rating || 0), 0) / reviewedProducts.length).toFixed(1) : '0.0'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <Star size={18} className="text-amber-500" />
            <h2 className="text-lg font-bold text-slate-950">Products with reviews</h2>
          </div>
          <div className="mt-5 space-y-3">
            {reviewedProducts.length === 0 ? (
              <SellerEmptyState message="Reviews will appear here after customers leave feedback on your products." />
            ) : (
              reviewedProducts.map((product) => (
                <div key={product.id} className="rounded-2xl border border-slate-200 px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-900">{product.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{Number(product.rating || 0).toFixed(1)} stars â€¢ {Number(product.reviews_count || 0)} reviews</p>
                    </div>
                    <Link to={`/products/${product.slug}`} className="text-sm font-semibold text-primary">
                      View product
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <MessageSquareText size={18} className="text-primary" />
            <h2 className="text-lg font-bold text-slate-950">Latest review feed</h2>
          </div>
          <div className="mt-5 space-y-3">
            {reviews.length === 0 ? (
              <SellerEmptyState message="No customer reviews found for this seller yet." />
            ) : (
              reviews.slice(0, 20).map((review) => (
                <div key={review.id} className="rounded-2xl border border-slate-200 px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-900">{review.productName}</p>
                      <p className="mt-1 text-xs text-slate-500">{review.user_name || 'Anonymous buyer'} â€¢ {review.created_at ? new Date(review.created_at).toLocaleDateString() : 'No date'}</p>
                    </div>
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">{Number(review.rating || 0).toFixed(1)} / 5</span>
                  </div>
                  <p className="mt-3 text-sm text-slate-700">{review.comment || 'No written comment provided.'}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default SellerReviewsPage;
