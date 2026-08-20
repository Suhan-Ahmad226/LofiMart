import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, Link } from '../../../lib/navigation';
import {
  ChevronDown,
  LayoutGrid,
  List,
  ChevronRight,
  Search,
  Star,
  Sparkles,
  Scale,
  SlidersHorizontal,
  X,
  RotateCcw,
  PackageSearch,
} from 'lucide-react';
import { ProductCard } from '@/features/shop/components/ProductCard';
import { Product } from '../../../types';
import { useCompare } from '../../../features/shop/state/CompareContext';
import { getCachedClientValue } from '../../../lib/client-cache';
import { ProductQuickView } from '../../../features/shop/components/ProductQuickView';

type ShopCategory = {
  id: string | number;
  name: string;
};

type SortOption = 'featured' | 'price-low' | 'price-high' | 'rating' | 'discount';
type ViewMode = 'grid' | 'list';

const DEFAULT_MAX_PRICE = 50000;
const MIN_PRICE = 500;
const SEARCH_DEBOUNCE_MS = 300;
const PRICE_DEBOUNCE_MS = 180;

function getProductList(payload: unknown): Product[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.products)) return record.products;
  if (Array.isArray(record.items)) return record.items;
  if (Array.isArray(record.data)) return record.data;
  const data = record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : null;
  if (Array.isArray(data?.products)) return data.products;
  if (Array.isArray(data?.items)) return data.items;

  return [];
}

function getCategoryList(payload: unknown): ShopCategory[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.categories)) return record.categories;
  if (Array.isArray(record.data)) return record.data;
  const data = record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : null;
  if (Array.isArray(data?.categories)) return data.categories;

  return [];
}

function normalizeSort(value: string | null): SortOption {
  return value === 'price-low' || value === 'price-high' || value === 'rating' || value === 'discount' ? value : 'featured';
}

function normalizeViewMode(value: string | null): ViewMode {
  return value === 'list' ? 'list' : 'grid';
}

function normalizeRating(value: string | null) {
  const rating = Number(value || 0);
  return Number.isFinite(rating) ? Math.max(0, Math.min(5, Math.round(rating))) : 0;
}

function normalizePrice(value: string | null) {
  const price = Number(value || DEFAULT_MAX_PRICE);
  return Number.isFinite(price) ? Math.max(MIN_PRICE, Math.min(DEFAULT_MAX_PRICE, Math.round(price))) : DEFAULT_MAX_PRICE;
}

function getDiscountAmount(product: Product) {
  return Math.max(0, Number(product.old_price || 0) - Number(product.price || 0));
}

export const ShopPage = () => {
  const { items: compareItems, clearCompare } = useCompare();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchDraft, setSearchDraft] = useState(() => searchParams.get('q') || '');
  const [maxPriceDraft, setMaxPriceDraft] = useState(() => normalizePrice(searchParams.get('price')));
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const categoryParam = searchParams.get('category') || '';
  const queryParam = searchParams.get('q') || '';
  const sortBy = normalizeSort(searchParams.get('sort'));
  const selectedRating = normalizeRating(searchParams.get('rating'));
  const maxPrice = normalizePrice(searchParams.get('price'));
  const viewMode = normalizeViewMode(searchParams.get('view'));

  const loadShopData = useCallback((signal: AbortSignal) => {
    const controller = new AbortController();
    const abortForwarder = () => controller.abort();
    signal.addEventListener('abort', abortForwarder, { once: true });

    setLoading(true);
    setError('');

    return getCachedClientValue('shop-page:v2', 5 * 60 * 1000, async () => {
      const res = await fetch('/api/shop-page', { cache: 'force-cache', signal: controller.signal });
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
        signal.removeEventListener('abort', abortForwarder);
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        void loadShopData(controller.signal);
      }
    });

    return () => controller.abort();
  }, [loadShopData]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setSearchDraft(queryParam || '');
      }
    });
    return () => {
      active = false;
    };
  }, [queryParam]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setMaxPriceDraft(maxPrice);
      }
    });
    return () => {
      active = false;
    };
  }, [maxPrice]);

  const updateUrlParams = useCallback(
    (
      updates: Record<string, string | number | null | undefined>,
      options: { replace?: boolean; scroll?: boolean } = {},
    ) => {
      const nextParams = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || typeof value === 'undefined' || value === '') {
          nextParams.delete(key);
          return;
        }
        nextParams.set(key, String(value));
      });

      setSearchParams(nextParams, { scroll: false, ...options });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    const normalizedDraft = searchDraft.trim();
    if (normalizedDraft === queryParam) return undefined;

    const timeoutId = window.setTimeout(() => {
      updateUrlParams({ q: normalizedDraft || null }, { replace: true, scroll: false });
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [queryParam, searchDraft, updateUrlParams]);

  useEffect(() => {
    if (maxPriceDraft === maxPrice) return undefined;

    const timeoutId = window.setTimeout(() => {
      updateUrlParams({ price: maxPriceDraft < DEFAULT_MAX_PRICE ? maxPriceDraft : null }, { replace: true, scroll: false });
    }, PRICE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [maxPrice, maxPriceDraft, updateUrlParams]);

  const safeProducts = useMemo(() => getProductList(products), [products]);
  const safeCategories = useMemo(() => getCategoryList(categories), [categories]);
  const safeCompareItems = useMemo(() => (Array.isArray(compareItems) ? compareItems : []), [compareItems]);
  const normalizedQuery = useMemo(() => queryParam.trim().toLowerCase(), [queryParam]);
  const categoryOptions = useMemo(
    () =>
      safeCategories.length > 0
        ? safeCategories
        : Array.from(new Set(safeProducts.map((product) => product.category).filter(Boolean))).map((name) => ({
            id: name,
            name,
          })),
    [safeCategories, safeProducts],
  );

  const filteredProducts = useMemo(() => {
    const filtered = safeProducts.filter((product) => {
      if (categoryParam && product.category !== categoryParam) {
        return false;
      }

      if (normalizedQuery) {
        const productName = product.name?.toLowerCase() || '';
        const productCategory = product.category?.toLowerCase() || '';
        const productDescription = product.description?.toLowerCase() || '';
        const sellerName = (product.store_name || product.seller_name || '').toLowerCase();
        const matchesQuery =
          productName.includes(normalizedQuery) ||
          productCategory.includes(normalizedQuery) ||
          productDescription.includes(normalizedQuery) ||
          sellerName.includes(normalizedQuery);

        if (!matchesQuery) {
          return false;
        }
      }

      if (selectedRating > 0 && Number(product.rating || 0) < selectedRating) {
        return false;
      }

      if (Number(product.price || 0) > maxPrice) {
        return false;
      }

      return true;
    });

    return filtered
      .map((product, index) => ({ product, index }))
      .sort((a, b) => {
        let result = 0;
        switch (sortBy) {
          case 'price-low':
            result = Number(a.product.price || 0) - Number(b.product.price || 0);
            break;
          case 'price-high':
            result = Number(b.product.price || 0) - Number(a.product.price || 0);
            break;
          case 'rating':
            result = Number(b.product.rating || 0) - Number(a.product.rating || 0);
            break;
          case 'discount':
            result = getDiscountAmount(b.product) - getDiscountAmount(a.product);
            break;
          default:
            result = Number(b.product.reviews_count || 0) - Number(a.product.reviews_count || 0);
        }
        return result || a.index - b.index;
      })
      .map(({ product }) => product);
  }, [categoryParam, maxPrice, normalizedQuery, safeProducts, selectedRating, sortBy]);

  const featuredCategories = useMemo(() => categoryOptions.slice(0, 5), [categoryOptions]);
  const priceProgress = useMemo(() => Math.max(0, Math.min(100, (maxPriceDraft / DEFAULT_MAX_PRICE) * 100)), [maxPriceDraft]);
  const activeFiltersCount = useMemo(
    () =>
      Number(Boolean(categoryParam)) +
      Number(Boolean(queryParam)) +
      Number(selectedRating > 0) +
      Number(maxPrice < DEFAULT_MAX_PRICE),
    [categoryParam, maxPrice, queryParam, selectedRating],
  );

  const updateSearchQuery = useCallback(
    (nextQuery?: string, replace = false) => {
      const normalizedSearch = nextQuery?.trim();
      updateUrlParams({ q: normalizedSearch || null }, { replace, scroll: false });
    },
    [updateUrlParams],
  );

  const updateCategoryFilter = useCallback(
    (categoryName?: string) => {
      updateUrlParams({ category: categoryName || null }, { scroll: false });
    },
    [updateUrlParams],
  );

  const updateRatingFilter = useCallback(
    (rating: number) => {
      updateUrlParams({ rating: rating > 0 ? rating : null }, { scroll: false });
    },
    [updateUrlParams],
  );

  const updateSort = useCallback(
    (value: string) => {
      updateUrlParams({ sort: normalizeSort(value) === 'featured' ? null : normalizeSort(value) }, { scroll: false });
    },
    [updateUrlParams],
  );

  const updateViewMode = useCallback(
    (value: ViewMode) => {
      updateUrlParams({ view: value === 'grid' ? null : value }, { replace: true, scroll: false });
    },
    [updateUrlParams],
  );

  const clearAllFilters = useCallback(() => {
    setSearchDraft('');
    setMaxPriceDraft(DEFAULT_MAX_PRICE);
    updateUrlParams({ category: null, q: null, rating: null, price: null }, { scroll: false });
  }, [updateUrlParams]);

  const openMobileFilters = useCallback(() => setMobileFiltersOpen(true), []);
  const closeMobileFilters = useCallback(() => setMobileFiltersOpen(false), []);
  const openQuickView = useCallback((product: Product) => setQuickViewProduct(product), []);
  const closeQuickView = useCallback(() => setQuickViewProduct(null), []);
  const retryLoad = useCallback(() => {
    const controller = new AbortController();
    void loadShopData(controller.signal);
  }, [loadShopData]);

  const activeFilterChips = useMemo(
    () =>
      [
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
              onRemove: () => {
                setSearchDraft('');
                updateSearchQuery(undefined);
              },
            }
          : null,
        selectedRating > 0
          ? {
              key: 'rating',
              label: `${selectedRating}+ stars`,
              onRemove: () => updateRatingFilter(0),
            }
          : null,
        maxPrice < DEFAULT_MAX_PRICE
          ? {
              key: 'price',
              label: `Up to ${maxPrice.toLocaleString()} BDT`,
              onRemove: () => {
                setMaxPriceDraft(DEFAULT_MAX_PRICE);
                updateUrlParams({ price: null }, { scroll: false });
              },
            }
          : null,
      ].filter(Boolean) as Array<{ key: string; label: string; onRemove: () => void }>,
    [categoryParam, maxPrice, queryParam, selectedRating, updateCategoryFilter, updateRatingFilter, updateSearchQuery, updateUrlParams],
  );

  const productGridClass = useMemo(
    () =>
      viewMode === 'grid'
        ? 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
        : 'grid grid-cols-1 gap-4',
    [viewMode],
  );

  const filterContent = (
    <div className="content-stack">
    

      <div className="surface-card p-5 sm:p-6">
        <h3 className="mb-4 flex items-center justify-between text-base font-bold sm:text-lg">
          Categories
          <ChevronDown size={16} />
        </h3>
        <div className="space-y-2">
          {categoryOptions.map((cat) => (
            <label key={cat.id} className="group flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 transition hover:bg-primary/5">
              <input
                type="checkbox"
                checked={categoryParam === cat.name}
                onChange={() => updateCategoryFilter(categoryParam === cat.name ? undefined : cat.name)}
                className="rounded text-primary focus:ring-primary"
              />
              <span className="text-sm font-medium text-gray-600 transition-colors group-hover:text-primary">{cat.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="surface-card p-5 sm:p-6">
        <h3 className="mb-4 text-base font-bold sm:text-lg">Price Range</h3>
        <input
          type="range"
          className="w-full accent-primary"
          min="5"
          max="50000"
          step="500"
          value={maxPriceDraft}
          onChange={(e) => setMaxPriceDraft(Number(e.target.value))}
          aria-label="Maximum product price"
        />
        
        <div className="mt-2 flex justify-between text-xs text-gray-500">
          <span>0 BDT</span>
          <span>Up to {maxPriceDraft.toLocaleString()} BDT</span>
        </div>
      </div>

      <div className="surface-card p-5 sm:p-6">
        <h3 className="mb-4 text-base font-bold sm:text-lg">Rating</h3>
        <div className="space-y-2">
          {[5, 4, 3, 2, 1].map((star) => (
            <label key={star} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 transition hover:bg-amber-50">
              <input
                type="checkbox"
                checked={selectedRating === star}
                onChange={() => updateRatingFilter(selectedRating === star ? 0 : star)}
                className="rounded text-primary focus:ring-primary"
              />
              <span className="flex items-center gap-1 text-sm text-gray-600">
                <Star size={14} fill="currentColor" className="text-amber-400" />
                {star} Stars & Up
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="page-shell scroll-smooth py-5 md:py-10 xl:py-12">
      <nav className="mb-6 hidden items-center space-x-2 text-sm text-gray-500 md:flex" aria-label="Breadcrumb">
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
          onClick={openMobileFilters}
          aria-label="Open product filters"
          className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-black/5 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition active:scale-[0.98]"
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
        <div
          className="fixed inset-0 z-[70] bg-slate-950/45 backdrop-blur-sm md:hidden"
          onClick={closeMobileFilters}
          role="presentation"
        >
          <div
            className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-2xl transition-transform duration-200 ease-out"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Product filters"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-primary/70">Smart Filters</p>
                <h2 className="text-xl font-bold text-gray-900">Refine your results</h2>
              </div>
              <button
                type="button"
                onClick={closeMobileFilters}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
                aria-label="Close filters"
              >
                <X size={18} />
              </button>
            </div>

            {filterContent}

            <div className="sticky bottom-0 -mx-5 mt-6 border-t border-slate-200 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
              <button
                type="button"
                onClick={closeMobileFilters}
                className="min-h-12 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/20 transition hover:bg-slate-800 active:scale-[0.99]"
              >
                Show {filteredProducts.length} products
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        <aside className="hidden w-full md:block lg:w-72 lg:shrink-0 xl:w-80">
          {filterContent}
        </aside>

        <main className="min-w-0 flex-1" aria-live="polite">
          {safeCompareItems.length > 0 ? (
            <div className="sticky top-3 z-30 mb-6 rounded-[1.5rem] border border-primary/10 bg-white/95 p-4 shadow-lg shadow-primary/5 backdrop-blur sm:flex sm:items-center sm:justify-between md:static md:rounded-[1.75rem] md:bg-primary/5 md:shadow-none">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-white p-3 text-primary shadow-sm">
                  <Scale size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{safeCompareItems.length} product{safeCompareItems.length === 1 ? '' : 's'} ready to compare</p>
                  <p className="text-xs text-slate-500">Open side-by-side comparison before making the final call.</p>
                </div>
              </div>
              <div className="mt-4 flex gap-3 sm:mt-0">
                <button
                  type="button"
                  onClick={clearCompare}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/25 sm:flex-none"
                  aria-label="Clear compare list"
                >
                  <X size={16} />
                  <span>Clear</span>
                </button>
                <Link
                  to="/compare"
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/25 sm:flex-none"
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
                className="flex w-full max-w-xl flex-col items-stretch gap-3 rounded-[1.35rem] border border-black/5 bg-slate-50 px-4 py-3 shadow-sm transition focus-within:border-primary/30 focus-within:bg-white focus-within:ring-4 focus-within:ring-primary/10 sm:flex-row sm:items-center"
                role="search"
              >
                <Search size={18} className="text-gray-400" />
                <input
                  ref={searchInputRef}
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder="Search products, categories, or styles"
                  aria-label="Search marketplace products"
                  className="min-h-10 min-w-0 flex-1 bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
                />
                {searchDraft ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchDraft('');
                      updateSearchQuery(undefined);
                      searchInputRef.current?.focus();
                    }}
                    className="min-h-10 rounded-xl px-2 text-xs font-semibold text-gray-500 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    aria-label="Clear search"
                  >
                    Clear
                  </button>
                ) : null}
                <button
                  type="submit"
                  className="min-h-10 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/25 sm:shrink-0"
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
                  className={`min-h-10 rounded-full px-4 py-2 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-primary/25 ${
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
                    className="rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary transition hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/25"
                    aria-label={`Remove ${chip.label} filter`}
                  >
                    {chip.label} x
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-4 rounded-2xl bg-bg-light p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                <button
                  type="button"
                  onClick={() => updateViewMode('grid')}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl transition focus:outline-none focus:ring-2 focus:ring-primary/25 ${viewMode === 'grid' ? 'bg-white text-primary shadow-sm' : 'text-gray-400 hover:text-slate-700'}`}
                  aria-label="Show products in grid view"
                  aria-pressed={viewMode === 'grid'}
                >
                  <LayoutGrid size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => updateViewMode('list')}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl transition focus:outline-none focus:ring-2 focus:ring-primary/25 ${viewMode === 'list' ? 'bg-white text-primary shadow-sm' : 'text-gray-400 hover:text-slate-700'}`}
                  aria-label="Show products in list view"
                  aria-pressed={viewMode === 'list'}
                >
                  <List size={20} />
                </button>
                <span className="text-sm text-gray-500">Showing {filteredProducts.length} results</span>
              </div>

              <div className="flex items-center justify-between space-x-2">
                <span className="text-sm text-gray-500">Sort by:</span>
                <select
                  value={sortBy}
                  onChange={(e) => updateSort(e.target.value)}
                  aria-label="Sort products"
                  className="min-h-10 min-w-0 rounded-xl border border-black/5 bg-white px-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20"
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
            <div className={productGridClass} aria-label="Loading products">
              {Array.from({ length: viewMode === 'grid' ? 10 : 5 }).map((_, index) => (
                <div key={index} className="min-h-[21rem] animate-pulse overflow-hidden rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                  <div className="aspect-square rounded-2xl bg-slate-100" />
                  <div className="mt-4 h-4 w-5/6 rounded bg-slate-100" />
                  <div className="mt-2 h-4 w-2/3 rounded bg-slate-100" />
                  <div className="mt-3 h-3 w-20 rounded bg-slate-100" />
                  <div className="mt-4 h-10 rounded-xl bg-slate-100" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center shadow-sm sm:p-12">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-rose-500 shadow-sm">
                <RotateCcw size={26} />
              </div>
              <h2 className="text-2xl font-bold text-rose-900">Shop data is unavailable</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-rose-700">{error}</p>
              <button
                type="button"
                onClick={retryLoad}
                className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-rose-900/10 transition hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-300"
              >
                <RotateCcw size={16} />
                Retry loading
              </button>
            </div>
          ) : filteredProducts.length > 0 ? (
            <section className={productGridClass} aria-label="Product results">
              {filteredProducts.map((product) => (
                <div key={product.id} className="min-w-0 transition duration-200 hover:-translate-y-0.5">
                  <ProductCard
                    product={product}
                    onQuickView={openQuickView}
                  />
                </div>
              ))}
            </section>
          ) : (
            <div className="rounded-3xl border border-dashed border-primary/20 bg-white/85 p-8 text-center shadow-sm sm:p-12">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 text-primary">
                <PackageSearch size={32} />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">No products matched your filters</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-gray-500">
                Try a wider price range, remove a rating filter, or explore another category.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {activeFiltersCount > 0 ? (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/25"
                  >
                    Remove filters
                  </button>
                ) : null}
                {featuredCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => updateCategoryFilter(cat.name)}
                    className="rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground transition hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
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
          onClose={closeQuickView}
        />
      )}
    </div>
  );
};
