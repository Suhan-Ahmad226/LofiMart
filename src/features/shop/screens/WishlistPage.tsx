import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '../../../lib/navigation';
import { Heart, ArrowRight, Loader2 } from 'lucide-react';
import { useWishlist } from '../../../features/shop/state/WishlistContext';
import { useUser } from '../../../features/shared/state/UserContext';
import { ProductCard } from '@/features/shared/ui/product/ProductCard';
import { Product } from '@/types';

const PAGE_SIZE = 8;

type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

type WishlistApiResponse = {
  items: Product[];
  pagination: PaginationMeta;
};

function dedupeProducts(products: Product[]): Product[] {
  const seen = new Set<string>();
  return products.filter((product) => {
    const key = String(product.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const WishlistPage = () => {
  const { items: wishlistItems } = useWishlist();
  const { token } = useUser();
  const isAuthed = Boolean(token);

  const [visibleProducts, setVisibleProducts] = useState<Product[]>([]);
  const [guestLoadedCount, setGuestLoadedCount] = useState(PAGE_SIZE);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialError, setInitialError] = useState('');
  const [loadMoreError, setLoadMoreError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [apiTotal, setApiTotal] = useState(0);
  const [retryKey, setRetryKey] = useState(0);

  const nextPageRef = useRef(2);
  const loadingMoreRef = useRef(false);
  const prevContextIdsRef = useRef<Set<string>>(new Set());
  const removedIdsRef = useRef<Set<string>>(new Set());

  const fetchPage = useCallback(
    async (page: number) => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      const response = await fetch(`/api/wishlist?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) {
        throw new Error('Failed to load wishlist');
      }
      const payload: WishlistApiResponse = await response.json();
      return payload;
    },
    [token],
  );

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setInitialLoading(true);
      setInitialError('');
      setLoadMoreError('');
      nextPageRef.current = 2;
      loadingMoreRef.current = false;

      if (!isAuthed || !token) {
        if (!cancelled) {
          setGuestLoadedCount(PAGE_SIZE);
          setVisibleProducts([]);
          setApiTotal(0);
          setInitialLoading(false);
        }
        return;
      }

      try {
        const payload = await fetchPage(1);
        if (cancelled) return;
        setVisibleProducts(dedupeProducts(payload.items));
        setApiTotal(payload.pagination.total);
        setHasMore(payload.pagination.hasMore);
        nextPageRef.current = payload.pagination.page + 1;
      } catch (error) {
        if (cancelled) return;
        setInitialError(error instanceof Error ? error.message : 'Failed to load wishlist');
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [isAuthed, token, fetchPage, retryKey]);

  useEffect(() => {
    const prevIds = prevContextIdsRef.current;
    const nextIds = new Set(wishlistItems.map((item) => String(item.id)));
    const removedIds = [...prevIds].filter((id) => !nextIds.has(id));
    if (removedIds.length > 0) {
      removedIds.forEach((id) => removedIdsRef.current.add(id));
      setVisibleProducts((prev) => prev.filter((product) => !removedIds.includes(String(product.id))));
    }
    prevContextIdsRef.current = nextIds;
  }, [wishlistItems]);

  const displayProducts = useMemo(() => {
    if (!isAuthed || !token) {
      return wishlistItems.slice(0, guestLoadedCount);
    }
    return visibleProducts;
  }, [isAuthed, token, wishlistItems, guestLoadedCount, visibleProducts]);

  const totalCount = Math.max(wishlistItems.length, apiTotal);

  const effectiveHasMore = isAuthed && token ? hasMore : guestLoadedCount < wishlistItems.length;

  const handleLoadMore = useCallback(() => {
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;

    if (!isAuthed || !token) {
      setGuestLoadedCount((count) => count + PAGE_SIZE);
      loadingMoreRef.current = false;
      return;
    }

    setLoadingMore(true);
    setLoadMoreError('');

    void (async () => {
      try {
        const payload = await fetchPage(nextPageRef.current);
        setVisibleProducts((prev) => {
          const seen = new Set(prev.map((product) => String(product.id)));
          const additions = payload.items.filter(
            (product) =>
              !seen.has(String(product.id)) && !removedIdsRef.current.has(String(product.id)),
          );
          return [...prev, ...additions];
        });
        setApiTotal(payload.pagination.total);
        setHasMore(payload.pagination.hasMore);
        nextPageRef.current = payload.pagination.page + 1;
      } catch {
        setLoadMoreError('Could not load more products.');
      } finally {
        setLoadingMore(false);
        loadingMoreRef.current = false;
      }
    })();
  }, [isAuthed, token, fetchPage]);

  const handleRetryInitial = useCallback(() => {
    setRetryKey((key) => key + 1);
  }, []);

  if (initialLoading) {
    return (
      <div className="mx-auto flex min-h-[360px] max-w-7xl items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="animate-spin text-primary" size={34} />
          <p className="text-sm font-medium">Loading your wishlist...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-12">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold">My Wishlist</h1>
          <p className="mt-2 text-gray-500">
            {totalCount > 0
              ? `You have ${totalCount} ${totalCount === 1 ? 'item' : 'items'} saved for later.`
              : 'Save products you love and find them here later.'}
          </p>
        </div>
        <Link to="/shop" className="flex items-center space-x-2 font-bold text-primary hover:underline">
          <span>Continue Shopping</span>
          <ArrowRight size={18} />
        </Link>
      </div>

      {initialError ? (
        <div className="rounded-2xl border border-dashed border-red-200 bg-red-50 px-6 py-10 text-center">
          <p className="text-red-600">{initialError}</p>
          <button
            type="button"
            onClick={handleRetryInitial}
            className="mt-4 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
          >
            Try Again
          </button>
        </div>
      ) : totalCount === 0 ? (
        <div className="py-24 text-center">
          <div className="mx-auto inline-flex h-20 w-20 items-center justify-center rounded-full bg-gray-50 text-gray-300">
            <Heart size={40} />
          </div>
          <h2 className="mt-4 text-2xl font-bold">Your Wishlist is Empty</h2>
          <p className="mt-2 text-gray-500">Save products you love and find them here later.</p>
          <Link
            to="/shop"
            className="mt-6 inline-block rounded-full bg-primary px-8 py-3 font-semibold text-white transition-colors hover:bg-primary/90"
          >
            Continue Shopping
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {displayProducts.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>

          <div className="mt-10 flex flex-col items-center gap-3">
            {loadingMore && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="animate-spin" size={16} />
                <span>Loading more...</span>
              </div>
            )}

            {loadMoreError && (
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm text-red-500">Couldn&apos;t load more products.</p>
                <button
                  type="button"
                  onClick={handleLoadMore}
                  className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
                >
                  Try Again
                </button>
              </div>
            )}

            {effectiveHasMore && !loadingMore && !loadMoreError && (
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="rounded-full bg-primary px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            )}

            {!effectiveHasMore && displayProducts.length > 0 && (
              <p className="text-sm text-slate-400">
                Showing all {totalCount} wishlist {totalCount === 1 ? 'item' : 'items'}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};
