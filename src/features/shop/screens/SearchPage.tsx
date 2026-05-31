import React, { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from '@/src/lib/navigation';
import { Search, Loader2 } from 'lucide-react';
import { Product } from '@/src/types';
import { ProductCard } from '@/src/components/ProductCard';
import { ProductGridSkeleton } from '@/src/components/ui/DataSkeletons';
import { EmptyState } from '@/src/components/ui/FeedbackState';
import { getCachedClientValue } from '@/src/lib/client-cache';

export const SearchPage = () => {
  const RECENT_SEARCHES_KEY = 'amarshop_recent_searches';
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get('q') || '';
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchDraft, setSearchDraft] = useState(query);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [trendingSearches, setTrendingSearches] = useState<string[]>([]);

  useEffect(() => {
    setSearchDraft(query);
  }, [query]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(RECENT_SEARCHES_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setRecentSearches(parsed.filter((item): item is string => typeof item === 'string').slice(0, 6));
      }
    } catch {
      setRecentSearches([]);
    }
  }, []);

  useEffect(() => {
    if (!query.trim() || typeof window === 'undefined') return;
    const next = [query.trim(), ...recentSearches.filter((item) => item.toLowerCase() !== query.trim().toLowerCase())].slice(0, 6);
    setRecentSearches(next);
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  }, [query]);

  useEffect(() => {
    let cancelled = false;

    const loadDiscovery = async () => {
      try {
        const payload = await getCachedClientValue('search-discovery:v1', 10 * 60 * 1000, async () => {
          const response = await fetch('/api/search/discovery', { cache: 'no-store' });
          if (!response.ok) {
            return null;
          }
          return response.json().catch(() => null);
        });
        if (!cancelled && Array.isArray(payload?.trending)) {
          setTrendingSearches(payload.trending.filter((item: unknown): item is string => typeof item === 'string').slice(0, 8));
        }
      } catch {
        if (!cancelled) {
          setTrendingSearches([]);
        }
      }
    };

    void loadDiscovery();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError('');

    getCachedClientValue(`search-products:${query.trim().toLowerCase()}`, 2 * 60 * 1000, async () => {
      const res = await fetch(`/api/search/products?q=${encodeURIComponent(query)}`, {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Unable to load search results right now.');
      }
      return data;
    })
      .then((data) => {
        if (controller.signal.aborted) return;
        setProducts(Array.isArray(data) ? data : []);
      })
      .catch((fetchError) => {
        if ((fetchError as Error).name !== 'AbortError') {
          setProducts([]);
          setError(fetchError instanceof Error ? fetchError.message : 'Unable to load search results right now.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [query]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-3xl font-bold mb-2">Search Results</h1>
          <p className="text-gray-500">
            {loading ? 'Searching...' : `Found ${products.length} results for "${query}"`}
          </p>
        </div>
        
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const nextQuery = searchDraft.trim();
            if (!nextQuery) {
              navigate('/shop');
              return;
            }
            navigate(`/search?q=${encodeURIComponent(nextQuery)}`);
          }}
          className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-black/5 bg-white px-4 py-3 shadow-sm"
        >
          <Search className="h-4 w-4 text-gray-400" />
          <input
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Refine your search"
            className="min-w-0 flex-1 bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
          />
          {searchDraft ? (
            <button
              type="button"
              onClick={() => setSearchDraft('')}
              className="text-xs font-semibold text-gray-500 hover:text-primary"
            >
              Clear
            </button>
          ) : null}
          <button
            type="submit"
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Search
          </button>
        </form>
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="surface-card-soft flex items-center gap-3 px-5 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-sm font-medium text-slate-600">Searching the catalog for the closest matches...</p>
          </div>
          <ProductGridSkeleton cards={10} />
        </div>
      ) : error ? (
        <EmptyState
          tone="danger"
          icon={<Search className="h-8 w-8" />}
          title="Search is temporarily unavailable"
          description={error}
          actions={
            <Link to="/shop" className="rounded-xl bg-slate-950 px-8 py-3 font-bold text-white transition-colors hover:bg-slate-800">
              Browse All Products
            </Link>
          }
        />
      ) : products.length > 0 ? (
        <>
          <div className="mb-6 flex flex-wrap gap-2">
            <Link
              to={`/shop${query ? `?q=${encodeURIComponent(query)}` : ''}`}
              className="rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/15"
            >
              Open full filters
            </Link>
            <Link
              to="/shop"
              className="rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground transition hover:bg-primary/10 hover:text-primary"
            >
              Browse all categories
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {products.map((product) => (
              <div key={product.id}>
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-8">
          <EmptyState
            tone="soft"
            icon={<Search className="h-8 w-8" />}
            title="No results found"
            description={`We couldn't find anything matching "${query}". Try a different keyword, category, or brand.`}
            actions={
              <>
                <Link to="/shop" className="rounded-xl bg-slate-950 px-8 py-3 font-bold text-white transition-colors hover:bg-slate-800">
                  Browse All Products
                </Link>
                <Link
                  to="/categories"
                  className="rounded-xl border border-gray-200 bg-white px-8 py-3 font-bold text-slate-700 transition-colors hover:bg-gray-50"
                >
                  Explore Categories
                </Link>
              </>
            }
          />
          <div className="text-center">
            {trendingSearches.length > 0 || recentSearches.length > 0 ? (
              <div className="space-y-4">
                {trendingSearches.length > 0 ? (
                  <div>
                    <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Trending searches</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {trendingSearches.map((term) => (
                        <button
                          key={term}
                          onClick={() => navigate(`/search?q=${encodeURIComponent(term)}`)}
                          className="rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/15"
                        >
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {recentSearches.length > 0 ? (
                  <div>
                    <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Recent searches</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {recentSearches.map((term) => (
                        <button
                          key={term}
                          onClick={() => navigate(`/search?q=${encodeURIComponent(term)}`)}
                          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
