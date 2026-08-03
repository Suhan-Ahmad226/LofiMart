import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from '../../../lib/navigation';
import { ChevronDown, LayoutGrid, List, ChevronRight, Search, Star, Sparkles, Scale, SlidersHorizontal, X } from 'lucide-react';
import { ProductCard } from '../../../components/ProductCard';
import { Product } from '../../../types';
import { useCompare } from '../../../features/shop/state/CompareContext';
import { getCachedClientValue } from '../../../lib/client-cache';
import { ProductQuickView } from '../../../features/shop/components/ProductQuickView';

function getProductList(payload: unknown): Product[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const record = payload as Record<string, any>;
  if (Array.isArray(record.products)) return record.products;
  if (Array.isArray(record.items)) return record.items;
  if (Array.isArray(record.data)) return record.data;
  if (Array.isArray(record.data?.products)) return record.data.products;
  if (Array.isArray(record.data?.items)) return record.data.items;

  return [];
}

function getCategoryList(payload: unknown): any[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const record = payload as Record<string, any>;
  if (Array.isArray(record.categories)) return record.categories;
  if (Array.isArray(record.data)) return record.data;
  if (Array.isArray(record.data?.categories)) return record.data.categories;

  return [];
}

export const ShopPage = () => {
  const { items: compareItems, clearCompare } = useCompare();
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryParam = searchParams.get('category');
  const queryParam = searchParams.get('q');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState('featured');
  const [selectedRating, setSelectedRating] = useState(0);
  const [maxPrice, setMaxPrice] = useState(50000);
  const [searchDraft, setSearchDraft] = useState(queryParam || '');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError('');

    getCachedClientValue('shop-page:v1', 5 * 60 * 1000, async () => {
      const res = await fetch('/api/shop-page', { cache: 'no-store', signal: controller.signal });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Unable to load shop products right now.');
      }
      return data;
    })
      .then((data) => {
        if (controller.signal.aborted) return;
        setCategories(getCategoryList(data));
        setProducts(getProductList(data));
      })
      .catch((fetchError) => {
        if ((fetchError as Error).name !== 'AbortError') {
          setCategories([]);
          setProducts([]);
          setError(fetchError instanceof Error ? fetchError.message : 'Unable to load shop products right now.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    setSearchDraft(queryParam || '');
  }, [queryParam]);

  const safeProducts = getProductList(products);
  const safeCategories = getCategoryList(categories);
  const safeCompareItems = Array.isArray(compareItems) ? compareItems : [];

  const filteredProducts = safeProducts
    .filter((product) => {
      if (categoryParam && product.category !== categoryParam) {
        return false;
      }

      if (queryParam) {
        const q = queryParam.toLowerCase();
        const matchesQuery =
          product.name.toLowerCase().includes(q) ||
          product.category.toLowerCase().includes(q) ||
          product.description.toLowerCase().includes(q);

        if (!matchesQuery) {
          return false;
        }
      }

      if (selectedRating > 0 && product.rating < selectedRating) {
        return false;
      }

      if (product.price > maxPrice) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'price-low':
          return a.price - b.price;
        case 'price-high':
          return b.price - a.price;
        case 'rating':
          return b.rating - a.rating;
        case 'discount':
          return (b.old_price - b.price) - (a.old_price - a.price);
        default:
          return b.reviews_count - a.reviews_count;
      }
    });

  const featuredCategories = safeCategories.slice(0, 5);
  const priceProgress = Math.max(0, Math.min(100, (maxPrice / 50000) * 100));
  const activeFiltersCount =
    Number(Boolean(categoryParam)) +
    Number(Boolean(queryParam)) +
    Number(selectedRating > 0) +
    Number(maxPrice < 50000);

  const updateSearchQuery = (nextQuery?: string) => {
    const normalizedQuery = nextQuery?.trim();
    setSearchParams({
      ...(normalizedQuery ? { q: normalizedQuery } : {}),
      ...(categoryParam ? { category: categoryParam } : {}),
    });
  };

  const updateCategoryFilter = (categoryName?: string) => {
    setSearchParams({
      ...(queryParam ? { q: queryParam } : {}),
      ...(categoryName ? { category: categoryName } : {}),
    });
  };

  const clearAllFilters = () => {
    setSelectedRating(0);
    setMaxPrice(50000);
    setSearchParams(queryParam ? { q: queryParam } : {});
  };

  const activeFilterChips = [
    categoryParam
      ? {
          key: 'category',
          label: `Category: ${categoryParam}`,
          onRemove: () => updateCategoryFilter(undefined),
        }
      : null,
    queryParam
      ? {
          key: 'query',
          label: `Search: ${queryParam}`,
          onRemove: () => updateSearchQuery(undefined),
        }
      : null,
    selectedRating > 0
      ? {
          key: 'rating',
          label: `${selectedRating}+ stars`,
          onRemove: () => setSelectedRating(0),
        }
      : null,
    maxPrice < 50000
      ? {
          key: 'price',
          label: `Up to ${maxPrice.toLocaleString()} BDT`,
          onRemove: () => setMaxPrice(50000),
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; onRemove: () => void }>;

  const filterContent = (
    <aside className="content-stack">
      <div className="surface-card p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="section-kicker">Smart Filters</p>
            <h2 className="mt-2 text-xl font-bold text-gray-900">Shop your way</h2>
          </div>
          <div className="rounded-2xl bg-primary/10 p-3 text-primary">
            <Sparkles size={18} />
          </div>
        </div>
        <p className="text-sm text-gray-500">
          Narrow by category, price, and review score to find the best match faster.
        </p>
        {activeFiltersCount > 0 ? (
          <button
            type="button"
            onClick={clearAllFilters}
            className="mt-4 text-sm font-semibold text-primary hover:text-primary-dark"
          >
            Clear all filters
          </button>
        ) : null}
      </div>

      <div className="surface-card p-5 sm:p-6">
        <h3 className="mb-4 flex items-center justify-between text-base font-bold sm:text-lg">
          Categories
          <ChevronDown size={16} />
        </h3>
        <div className="space-y-2">
          {safeCategories.map((cat) => (
            <label key={cat.id} className="group flex cursor-pointer items-center space-x-2">
              <input
                type="checkbox"
                checked={categoryParam === cat.name}
                onChange={() => updateCategoryFilter(categoryParam === cat.name ? undefined : cat.name)}
                className="rounded text-primary focus:ring-primary"
              />
              <span className="text-sm text-gray-600 transition-colors group-hover:text-primary">{cat.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="surface-card p-5 sm:p-6">
        <h3 className="mb-4 text-base font-bold sm:text-lg">Price Range</h3>
        <input
          type="range"
          className="w-full accent-primary"
          min="500"
          max="50000"
          step="500"
          value={maxPrice}
          onChange={(e) => setMaxPrice(Number(e.target.value))}
        />
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${priceProgress}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-xs text-gray-500">
          <span>0 BDT</span>
          <span>Up to {maxPrice.toLocaleString()} BDT</span>
        </div>
      </div>

      <div className="surface-card p-5 sm:p-6">
        <h3 className="mb-4 text-base font-bold sm:text-lg">Rating</h3>
        <div className="space-y-2">
          {[5, 4, 3, 2, 1].map((star) => (
            <label key={star} className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedRating === star}
                onChange={() => setSelectedRating((current) => (current === star ? 0 : star))}
                className="rounded text-primary"
              />
              <span className="flex items-center gap-1 text-sm text-gray-600">
                <Star size={14} fill="currentColor" className="text-amber-400" />
                {star} Stars & Up
              </span>
            </label>
          ))}
        </div>
      </div>
    </aside>
  );

  return (
    <div className="page-shell py-6 md:py-12">
      <nav className="mb-8 hidden items-center space-x-2 text-sm text-gray-500 md:flex">
        <Link to="/" className="transition-colors hover:text-primary">Home</Link>
        <ChevronRight size={14} />
        <Link to="/shop" className="transition-colors hover:text-primary">Shop</Link>
        {categoryParam ? (
          <>
            <ChevronRight size={14} />
            <span className="font-medium text-gray-900">{categoryParam}</span>
          </>
        ) : null}
        {queryParam ? (
          <>
            <ChevronRight size={14} />
            <span className="font-medium italic text-gray-900">Search: "{queryParam}"</span>
          </>
        ) : null}
      </nav>

      <div className="mb-4 flex items-center gap-3 md:hidden">
        <button
          type="button"
          onClick={() => setMobileFiltersOpen(true)}
          className="inline-flex items-center gap-2 rounded-2xl border border-black/5 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm"
        >
          <SlidersHorizontal size={16} />
          Filters
          {activeFiltersCount > 0 ? (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-white">{activeFiltersCount}</span>
          ) : null}
        </button>
        <div className="surface-card min-w-0 flex-1 px-4 py-3 text-sm text-slate-500">
          {filteredProducts.length} items
        </div>
      </div>

      {mobileFiltersOpen ? (
        <div className="fixed inset-0 z-[70] bg-slate-950/45 md:hidden" onClick={() => setMobileFiltersOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-primary/70">Smart Filters</p>
                <h2 className="text-xl font-bold text-gray-900">Refine your results</h2>
              </div>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="rounded-full bg-slate-100 p-2 text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            {filterContent}

            <div className="sticky bottom-0 -mx-5 mt-6 border-t border-slate-200 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Show {filteredProducts.length} products
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-8 md:flex-row">
        <aside className="hidden w-full md:block md:w-72 md:shrink-0">
          {filterContent}
        </aside>

        <main className="flex-1">
          {safeCompareItems.length > 0 ? (
          <div className="mb-6 rounded-[1.75rem] border border-primary/10 bg-primary/5 p-4 sm:flex sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-white p-3 text-primary shadow-sm">
                  <Scale size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{safeCompareItems.length} product{safeCompareItems.length === 1 ? '' : 's'} ready to compare</p>
                  <p className="text-xs text-slate-500">Open side-by-side comparison before making the final call.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={clearCompare}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <X size={16} />
                  <span>Clear</span>
                </button>
                <Link
                  to="/compare"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  <Scale size={16} />
                  <span>Compare now</span>
                </Link>
              </div>
            </div>
          ) : null}

          <div className="surface-card mb-6 p-4 sm:p-6">
            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Search size={16} />
                  <span>{queryParam ? `Search results for "${queryParam}"` : 'Explore our best collections'}</span>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
                  {categoryParam ? `${categoryParam} collection` : 'All products'}
                </h1>
                <p className="text-sm text-gray-500">{filteredProducts.length} items matched your current filters.</p>
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  updateSearchQuery(searchDraft);
                }}
                className="flex w-full max-w-xl flex-col items-stretch gap-3 rounded-[1.35rem] border border-black/5 bg-slate-50 px-4 py-3 shadow-sm sm:flex-row sm:items-center"
              >
                <Search size={18} className="text-gray-400" />
                <input
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder="Search products, categories, or styles"
                  className="min-w-0 flex-1 bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
                />
                {searchDraft ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchDraft('');
                      updateSearchQuery(undefined);
                    }}
                    className="text-xs font-semibold text-gray-500 hover:text-primary"
                  >
                    Clear
                  </button>
                ) : null}
                <button
                  type="submit"
                  className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 sm:shrink-0"
                >
                  Search
                </button>
              </form>
            </div>

            <div className="flex flex-wrap gap-2">
              {featuredCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => updateCategoryFilter(cat.name)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                    categoryParam === cat.name
                      ? 'bg-primary text-white shadow-lg shadow-primary/20'
                      : 'bg-secondary text-secondary-foreground hover:bg-primary/10 hover:text-primary'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {activeFilterChips.length > 0 ? (
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-black/5 pt-5">
                <span className="text-xs font-bold uppercase tracking-[0.22em] text-primary/70">Active filters</span>
                {activeFilterChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={chip.onRemove}
                    className="rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary transition hover:bg-primary/10"
                  >
                    {chip.label} ×
                  </button>
                ))}
              </div>
            ) : null}

            <div className="flex flex-col gap-4 rounded-2xl bg-bg-light p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`rounded p-2 ${viewMode === 'grid' ? 'bg-white text-primary shadow-sm' : 'text-gray-400'}`}
                >
                  <LayoutGrid size={20} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`rounded p-2 ${viewMode === 'list' ? 'bg-white text-primary shadow-sm' : 'text-gray-400'}`}
                >
                  <List size={20} />
                </button>
                <span className="text-sm text-gray-500">Showing {filteredProducts.length} results</span>
              </div>

              <div className="flex items-center justify-between space-x-2">
                <span className="text-sm text-gray-500">Sort by:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="min-w-0 rounded-xl border border-black/5 bg-white px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-primary/20"
                >
                  <option value="featured">Most Popular</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="rating">Top Rated</option>
                  <option value="discount">Best Discount</option>
                </select>
              </div>
            </div>
          </div>

          {loading ? (
            <div className={viewMode === 'grid' ? 'responsive-grid' : 'grid grid-cols-1 gap-6'}>
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="animate-pulse overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="aspect-square rounded-2xl bg-slate-100" />
                  <div className="mt-4 h-4 w-3/4 rounded bg-slate-100" />
                  <div className="mt-2 h-4 w-1/2 rounded bg-slate-100" />
                  <div className="mt-4 h-5 w-24 rounded bg-slate-100" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 p-12 text-center">
              <h2 className="text-2xl font-bold text-rose-900">Shop data is unavailable</h2>
              <p className="mt-3 text-sm text-rose-700">{error}</p>
            </div>
          ) : filteredProducts.length > 0 ? (
            <div className={viewMode === 'grid' ? 'responsive-grid' : 'grid grid-cols-1 gap-6'}>
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onQuickView={setQuickViewProduct}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-primary/20 bg-white/85 p-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Search size={28} />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">No products matched your filters</h2>
              <p className="mt-3 text-sm text-gray-500">
                Try a wider price range, remove a rating filter, or explore another category.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {featuredCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => updateCategoryFilter(cat.name)}
                    className="rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground hover:bg-primary/10 hover:text-primary"
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {quickViewProduct && (
        <ProductQuickView
          product={quickViewProduct}
          isOpen={!!quickViewProduct}
          onClose={() => setQuickViewProduct(null)}
        />
      )}
    </div>
  );
};
