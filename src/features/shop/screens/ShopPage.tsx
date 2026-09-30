import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSearchParams, Link } from '../../../lib/navigation';
import {
  ChevronDown,
  ChevronRight,
  PackageSearch,
  RotateCcw,
  Scale,
  SlidersHorizontal,
  Star,
  X,
} from 'lucide-react';

import { ProductCard } from '@/features/shared/ui/product/ProductCard';
import { Product } from '../../../types';
import { useCompare } from '../../../features/shop/state/CompareContext';

type ShopCategory = {
  id: string | number;
  name: string;
};

type SortOption =
  | 'featured'
  | 'price-low'
  | 'price-high'
  | 'rating'
  | 'discount';

const DEFAULT_MAX_PRICE = 50000;
const MIN_PRICE = 500;

const SEARCH_DEBOUNCE_MS = 300;
const PRICE_DEBOUNCE_MS = 180;

/* -------------------------------------------------------------------------- */
/* Lazy Quick View */
/* -------------------------------------------------------------------------- */

const ProductQuickView = lazy(() =>
  import('../../../features/shop/components/ProductQuickView').then(
    ({ ProductQuickView }) => ({
      default: ProductQuickView,
    }),
  ),
);

/* -------------------------------------------------------------------------- */
/* Helpers */
/* -------------------------------------------------------------------------- */

function getProductList(payload: unknown): Product[] {
  if (Array.isArray(payload)) {
    return payload as Product[];
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const record = payload as Record<string, unknown>;

  if (Array.isArray(record.products)) {
    return record.products as Product[];
  }

  if (Array.isArray(record.items)) {
    return record.items as Product[];
  }

  if (Array.isArray(record.data)) {
    return record.data as Product[];
  }

  const data =
    record.data && typeof record.data === 'object'
      ? (record.data as Record<string, unknown>)
      : null;

  if (Array.isArray(data?.products)) {
    return data.products as Product[];
  }

  if (Array.isArray(data?.items)) {
    return data.items as Product[];
  }

  return [];
}

function getCategoryList(payload: unknown): ShopCategory[] {
  if (Array.isArray(payload)) {
    return payload as ShopCategory[];
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const record = payload as Record<string, unknown>;

  if (Array.isArray(record.categories)) {
    return record.categories as ShopCategory[];
  }

  if (Array.isArray(record.data)) {
    return record.data as ShopCategory[];
  }

  const data =
    record.data && typeof record.data === 'object'
      ? (record.data as Record<string, unknown>)
      : null;

  if (Array.isArray(data?.categories)) {
    return data.categories as ShopCategory[];
  }

  return [];
}

function normalizeSort(value: string | null): SortOption {
  if (
    value === 'price-low' ||
    value === 'price-high' ||
    value === 'rating' ||
    value === 'discount'
  ) {
    return value;
  }

  return 'featured';
}

function normalizeRating(value: string | null): number {
  const rating = Number(value || 0);

  if (!Number.isFinite(rating)) {
    return 0;
  }

  return Math.max(0, Math.min(5, Math.round(rating)));
}

function normalizePrice(value: string | null): number {
  const price = Number(value || DEFAULT_MAX_PRICE);

  if (!Number.isFinite(price)) {
    return DEFAULT_MAX_PRICE;
  }

  return Math.max(
    MIN_PRICE,
    Math.min(DEFAULT_MAX_PRICE, Math.round(price)),
  );
}

/* -------------------------------------------------------------------------- */
/* Paginated Shop Data                                                        */
/* -------------------------------------------------------------------------- */

type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

type ShopFetchParams = {
  page: number;
  q?: string;
  category?: string;
  rating: number;
  price?: number;
  sort: SortOption;
};

const SHOP_PAGE_LIMIT = 20;

async function fetchShopProducts(
  params: ShopFetchParams,
  signal: AbortSignal,
): Promise<{
  products: Product[];
  categories: ShopCategory[];
  pagination: PaginationMeta;
}> {
  const url = new URL(
    '/api/shop/products',
    window.location.origin,
  );

  url.searchParams.set(
    'page',
    String(params.page),
  );
  url.searchParams.set(
    'limit',
    String(SHOP_PAGE_LIMIT),
  );

  if (params.q) {
    url.searchParams.set('q', params.q);
  }

  if (params.category) {
    url.searchParams.set(
      'category',
      params.category,
    );
  }

  if (params.rating > 0) {
    url.searchParams.set(
      'rating',
      String(params.rating),
    );
  }

  if (
    params.price !== undefined &&
    params.price > 0 &&
    params.price < DEFAULT_MAX_PRICE
  ) {
    url.searchParams.set(
      'price',
      String(params.price),
    );
  }

  if (params.sort !== 'featured') {
    url.searchParams.set('sort', params.sort);
  }

  const response = await fetch(url.toString(), {
    signal,
  });

  const json = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    throw new Error(
      json?.error ||
        'Unable to load shop products right now.',
    );
  }

  const productList = getProductList(json);
  const categoryList = getCategoryList(json);

  return {
    products: productList,
    categories: categoryList,
    pagination: json?.pagination ?? {
      page: params.page,
      limit: SHOP_PAGE_LIMIT,
      total: productList.length,
      hasMore: false,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Filter Section */
/* -------------------------------------------------------------------------- */

const FilterSection = memo(function FilterSection({
  categories,
  selectedCategory,
  onCategoryChange,
  selectedRating,
  onRatingChange,
  maxPrice,
  onPriceChange,
}: {
  categories: ShopCategory[];
  selectedCategory: string;
  onCategoryChange: (name?: string) => void;
  selectedRating: number;
  onRatingChange: (rating: number) => void;
  maxPrice: number;
  onPriceChange: (value: number) => void;
}) {
  return (
    <div className="content-stack">
      {/* Categories */}
      <div className="surface-card p-3 sm:p-4">
        <h3 className="mb-3 flex items-center justify-between text-sm font-bold sm:text-base">
          Categories
          <ChevronDown size={16} />
        </h3>

        <div className="space-y-1">
          {categories.map((category) => {
            const isChecked =
              selectedCategory === category.name;

            return (
              <label
                key={category.id}
                className="group flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2 transition hover:bg-primary/5"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() =>
                    onCategoryChange(
                      isChecked
                        ? undefined
                        : category.name,
                    )
                  }
                  className="h-3.5 w-3.5 rounded text-primary focus:ring-primary"
                />

                <span
                  className={`text-sm font-medium transition-colors ${
                    isChecked
                      ? 'text-primary'
                      : 'text-gray-600 group-hover:text-primary'
                  }`}
                >
                  {category.name}
                </span>
              </label>
            );
          })}
        </div>


      {/* Price */}

        <h3 className="mb-4 text-base font-bold sm:text-lg">
          Price Range
        </h3>

        <input
          type="range"
          min={MIN_PRICE}
          max={DEFAULT_MAX_PRICE}
          step={500}
          value={maxPrice}
          onChange={(event) =>
            onPriceChange(Number(event.target.value))
          }
          className="w-full accent-primary"
          aria-label="Maximum product price"
        />

        <div className="mt-2 flex justify-between gap-3 text-xs text-gray-500">
          <span>0 BDT</span>

          <span className="text-right font-medium text-gray-700">
            Up to {maxPrice.toLocaleString()} BDT
          </span>
        </div>


      {/* Rating */}

        <h3 className="mb-4 text-base font-bold sm:text-lg">
          Rating
        </h3>

        <div className="space-y-1">
          {[5, 4, 3, 2, 1].map((star) => {
            const isChecked =
              selectedRating === star;

            return (
              <label
                key={star}
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 transition ${
                  isChecked
                    ? 'bg-amber-50'
                    : 'hover:bg-amber-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() =>
                    onRatingChange(
                      isChecked ? 0 : star,
                    )
                  }
                  className="h-3.5 w-3.5 rounded text-primary focus:ring-primary"
                />

                <span className="flex items-center gap-1 text-sm text-gray-600">
                  <Star
                    size={14}
                    fill="currentColor"
                    className="text-amber-400"
                  />

                  {star} Stars & Up
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* Active Filter Chips */
/* -------------------------------------------------------------------------- */

const FilterChips = memo(function FilterChips({
  chips,
  onClearAll,
}: {
  chips: Array<{
    key: string;
    label: string;
    onRemove: () => void;
  }>;
  onClearAll: () => void;
}) {
  if (!chips.length) {
    return null;
  }

  return (
    <div className="flex w-full min-w-0 items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-primary/70 sm:text-xs sm:tracking-[0.22em]">
        Active Filters
      </span>

      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          className="inline-flex max-w-[240px] shrink-0 items-center gap-1 rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/25 sm:text-sm"
          aria-label={`Remove ${chip.label} filter`}
        >
          <span className="truncate">
            {chip.label}
          </span>

          <X
            size={13}
            className="shrink-0"
          />
        </button>
      ))}

      {chips.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 sm:text-sm"
        >
          Clear all
        </button>
      )}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* Product Grid */
/* -------------------------------------------------------------------------- */

const ProductGrid = memo(function ProductGrid({
  products,
  onQuickView,
}: {
  products: Product[];
  onQuickView: (product: Product) => void;
}) {
  return (
    <section
      className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5"
      aria-label="Product results"
    >
      {products.map((product) => (
        <div
          key={product.id}
          className="min-w-0 transition duration-200 hover:-translate-y-0.5"
        >
          <ProductCard
            product={product}
            onQuickView={onQuickView}
          />
        </div>
      ))}
    </section>
  );
});

/* -------------------------------------------------------------------------- */
/* Loading Skeleton */
/* -------------------------------------------------------------------------- */

const LoadingSkeleton = memo(function LoadingSkeleton() {
  return (
    <div
      className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5"
      aria-label="Loading products"
    >
      {Array.from({ length: 10 }).map((_, index) => (
        <div
          key={index}
          className="min-h-[21rem] animate-pulse overflow-hidden rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
        >
          <div className="aspect-square rounded-2xl bg-slate-100" />

          <div className="mt-4 h-4 w-5/6 rounded bg-slate-100" />

          <div className="mt-2 h-4 w-2/3 rounded bg-slate-100" />

          <div className="mt-3 h-3 w-20 rounded bg-slate-100" />

          <div className="mt-4 h-10 rounded-xl bg-slate-100" />
        </div>
      ))}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* Shop Page */
/* -------------------------------------------------------------------------- */

export const ShopPage = () => {
  const { items: compareItems, clearCompare } =
    useCompare();

  const [searchParams, setSearchParams] =
    useSearchParams();

  /* ---------------------------------------------------------------------- */
  /* Product Data State */
  /* ---------------------------------------------------------------------- */

  const [products, setProducts] =
    useState<Product[]>([]);

  const [categories, setCategories] =
    useState<ShopCategory[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [pagination, setPagination] =
    useState<PaginationMeta>({
      page: 1,
      limit: SHOP_PAGE_LIMIT,
      total: 0,
      hasMore: false,
    });

  const [loadingMore, setLoadingMore] =
    useState(false);

  const [reloadToken, setReloadToken] =
    useState(0);

  /* ---------------------------------------------------------------------- */
  /* LOCAL FILTER STATE                                                     */
  /*                                                                      */
  /* Important: UI/filtering uses these states directly.                   */
  /* URL is only synchronization/storage.                                 */
  /* ---------------------------------------------------------------------- */

  const [selectedCategory, setSelectedCategory] =
    useState(
      () => searchParams.get('category') || '',
    );

  const [searchQuery, setSearchQuery] =
    useState(
      () => searchParams.get('q') || '',
    );

  const [selectedRating, setSelectedRating] =
    useState(
      () =>
        normalizeRating(
          searchParams.get('rating'),
        ),
    );

  const [maxPrice, setMaxPrice] =
    useState(
      () =>
        normalizePrice(
          searchParams.get('price'),
        ),
    );

  const [debouncedSearch, setDebouncedSearch] =
    useState(
      () => searchParams.get('q') || '',
    );

  const [debouncedMaxPrice, setDebouncedMaxPrice] =
    useState(
      () =>
        normalizePrice(
          searchParams.get('price'),
        ),
    );

  const [sortBy, setSortBy] =
    useState<SortOption>(
      () =>
        normalizeSort(
          searchParams.get('sort'),
        ),
    );

  /* ---------------------------------------------------------------------- */
  /* Other State */
  /* ---------------------------------------------------------------------- */

  const [mobileFiltersOpen, setMobileFiltersOpen] =
    useState(false);

  const [loadMoreError, setLoadMoreError] =
    useState('');

  const [quickViewProduct, setQuickViewProduct] =
    useState<Product | null>(null);

  const searchTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

  const priceTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

  const requestSeqRef = useRef(0);

  const activeControllerRef =
    useRef<AbortController | null>(
      null,
    );

  const filtersTriggerRef =
    useRef<HTMLButtonElement | null>(null);

  const mobileDialogRef =
    useRef<HTMLDivElement | null>(null);

  const closeMobileFilters =
    useCallback(() => {
      setMobileFiltersOpen(false);
    }, []);

  useEffect(() => {
    if (!mobileFiltersOpen) {
      return;
    }

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    mobileDialogRef.current?.focus();

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === 'Escape') {
        closeMobileFilters();
      }
    };

    document.addEventListener(
      'keydown',
      handleKeyDown,
    );

    return () => {
      document.removeEventListener(
        'keydown',
        handleKeyDown,
      );

      previouslyFocused?.focus();
    };
  }, [mobileFiltersOpen, closeMobileFilters]);

/* ---------------------------------------------------------------------- */
  /* Debounced Filter Activators: Search + Price                             */
  /*                                                                      */
  /* Search/price update instantly for the UI, but product fetching is      */
  /* debounced so every keystroke / slider tick does not hit the API.       */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const timeout = setTimeout(
      () =>
        setDebouncedSearch(
          searchQuery.trim(),
        ),
      SEARCH_DEBOUNCE_MS,
    );

    return () =>
      clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    const timeout = setTimeout(
      () =>
        setDebouncedMaxPrice(maxPrice),
      PRICE_DEBOUNCE_MS,
    );

    return () =>
      clearTimeout(timeout);
  }, [maxPrice]);

  /* ---------------------------------------------------------------------- */
  /* Load Shop Products: Page 1                                              */
  /*                                                                      */
  /* Re-runs whenever a filter/sort/search value changes. Resets the list,  */
  /* scrolls back to page 1, and aborts any in-flight Load More request.    */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    activeControllerRef.current?.abort();

    const seq = ++requestSeqRef.current;
    const controller =
      new AbortController();

    activeControllerRef.current =
      controller;

    setLoading(true);
    setLoadingMore(false);
    setError('');
    setLoadMoreError('');
    setProducts([]);
    setPagination({
      page: 1,
      limit: SHOP_PAGE_LIMIT,
      total: 0,
      hasMore: false,
    });

    const params: ShopFetchParams = {
      page: 1,
      q: debouncedSearch || undefined,
      category:
        selectedCategory || undefined,
      rating: selectedRating,
      price:
        debouncedMaxPrice <
        DEFAULT_MAX_PRICE
          ? debouncedMaxPrice
          : undefined,
      sort: sortBy,
    };

    (async () => {
      try {
        const payload =
          await fetchShopProducts(
            params,
            controller.signal,
          );

        if (seq !== requestSeqRef.current) {
          return;
        }

        setProducts(payload.products);
        setPagination(payload.pagination);
        setCategories((current) =>
          current.length > 0 ||
          payload.categories.length === 0
            ? current
            : payload.categories,
        );
      } catch (fetchError) {
        if (
          seq !== requestSeqRef.current ||
          (fetchError as Error).name ===
            'AbortError'
        ) {
          return;
        }

        setProducts([]);
        setPagination({
          page: 1,
          limit: SHOP_PAGE_LIMIT,
          total: 0,
          hasMore: false,
        });
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : 'Unable to load shop products right now.',
        );
      } finally {
        if (seq === requestSeqRef.current) {
          setLoading(false);

          if (
            activeControllerRef.current ===
            controller
          ) {
            activeControllerRef.current =
              null;
          }
        }
      }
    })();

    return () => controller.abort();
  }, [
    debouncedSearch,
    selectedCategory,
    selectedRating,
    debouncedMaxPrice,
    sortBy,
    reloadToken,
  ]);

  /* ---------------------------------------------------------------------- */
  /* URL Update Helper                                                      */
  /* ---------------------------------------------------------------------- */

  const updateUrlParams = useCallback(
    (
      updates: Record<
        string,
        string | number | null | undefined
      >,
      options: {
        replace?: boolean;
        scroll?: boolean;
      } = {},
    ) => {
      const nextParams =
        new URLSearchParams(
          searchParams.toString(),
        );

      Object.entries(updates).forEach(
        ([key, value]) => {
          if (
            value === null ||
            value === undefined ||
            value === ''
          ) {
            nextParams.delete(key);
          } else {
            nextParams.set(
              key,
              String(value),
            );
          }
        },
      );

      setSearchParams(nextParams, {
        scroll: false,
        ...options,
      });
    },
    [
      searchParams,
      setSearchParams,
    ],
  );

  /* ---------------------------------------------------------------------- */
  /* Sync URL -> Local State                                                */
  /*                                                                      */
  /* This handles browser Back/Forward and external URL changes.           */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const urlCategory =
      searchParams.get('category') || '';

    const urlQuery =
      searchParams.get('q') || '';

    const urlRating =
      normalizeRating(
        searchParams.get('rating'),
      );

    const urlPrice =
      normalizePrice(
        searchParams.get('price'),
      );

    const urlSort =
      normalizeSort(
        searchParams.get('sort'),
      );

    setSelectedCategory((current) =>
      current === urlCategory
        ? current
        : urlCategory,
    );

    setSearchQuery((current) =>
      current === urlQuery
        ? current
        : urlQuery,
    );

    setSelectedRating((current) =>
      current === urlRating
        ? current
        : urlRating,
    );

    setMaxPrice((current) =>
      current === urlPrice
        ? current
        : urlPrice,
    );

    setSortBy((current) =>
      current === urlSort
        ? current
        : urlSort,
    );
  }, [searchParams]);

  /* ---------------------------------------------------------------------- */
  /* Search URL Debounce                                                    */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(
        searchTimeoutRef.current,
      );
    }

    searchTimeoutRef.current =
      setTimeout(() => {
        const currentUrlQuery =
          searchParams.get('q') || '';

        if (
          currentUrlQuery === searchQuery
        ) {
          return;
        }

        updateUrlParams(
          {
            q:
              searchQuery.trim() ||
              null,
          },
          {
            replace: true,
            scroll: false,
          },
        );
      }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(
          searchTimeoutRef.current,
        );
      }
    };
  }, [
    searchQuery,
    searchParams,
    updateUrlParams,
  ]);

  /* ---------------------------------------------------------------------- */
  /* Price URL Debounce                                                     */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (priceTimeoutRef.current) {
      clearTimeout(
        priceTimeoutRef.current,
      );
    }

    priceTimeoutRef.current =
      setTimeout(() => {
        const currentUrlPrice =
          normalizePrice(
            searchParams.get('price'),
          );

        if (
          currentUrlPrice === maxPrice
        ) {
          return;
        }

        updateUrlParams(
          {
            price:
              maxPrice <
              DEFAULT_MAX_PRICE
                ? maxPrice
                : null,
          },
          {
            replace: true,
            scroll: false,
          },
        );
      }, PRICE_DEBOUNCE_MS);

    return () => {
      if (priceTimeoutRef.current) {
        clearTimeout(
          priceTimeoutRef.current,
        );
      }
    };
  }, [
    maxPrice,
    searchParams,
    updateUrlParams,
  ]);

/* ---------------------------------------------------------------------- */
/* Safe Data                                                              */
/* ---------------------------------------------------------------------- */

  const safeCompareItems =
    Array.isArray(compareItems)
      ? compareItems
      : [];

  /* ---------------------------------------------------------------------- */
  /* Category Options                                                       */
  /* ---------------------------------------------------------------------- */

  const categoryOptions =
    useMemo(() => {
      if (categories.length > 0) {
        return categories;
      }

      return Array.from(
        new Set(
          products
            .map(
              (product) =>
                product.category,
            )
            .filter(
              (name): name is string =>
                Boolean(name),
            ),
        ),
      ).map((name) => ({
        id: name,
        name,
      }));
    }, [categories, products]);

  const featuredCategories =
    categoryOptions.slice(0, 5);

  /* ---------------------------------------------------------------------- */
  /* Active Filter Count                                                    */
  /* ---------------------------------------------------------------------- */

  const activeFiltersCount =
    Number(Boolean(selectedCategory)) +
    Number(Boolean(searchQuery.trim())) +
    Number(selectedRating > 0) +
    Number(
      maxPrice < DEFAULT_MAX_PRICE,
    );

  /* ---------------------------------------------------------------------- */
  /* Filter Handlers                                                        */
  /* ---------------------------------------------------------------------- */

  const updateCategoryFilter =
    useCallback(
      (categoryName?: string) => {
        const nextCategory =
          categoryName || '';

        /* Immediate UI update */
        setSelectedCategory(
          nextCategory,
        );

        /* URL update */
        updateUrlParams(
          {
            category:
              nextCategory || null,
          },
          {
            replace: true,
            scroll: false,
          },
        );
      },
      [updateUrlParams],
    );

  const updateRatingFilter =
    useCallback(
      (rating: number) => {
        /* Immediate UI + filtering */
        setSelectedRating(rating);

        /* Immediate URL update */
        updateUrlParams(
          {
            rating:
              rating > 0
                ? rating
                : null,
          },
          {
            replace: true,
            scroll: false,
          },
        );
      },
      [updateUrlParams],
    );

  const updatePriceFilter =
    useCallback(
      (value: number) => {
        /* Immediate slider + product filtering */
        setMaxPrice(value);
      },
      [],
    );

  const updateSort =
    useCallback(
      (value: string) => {
        const normalized =
          normalizeSort(value);

        /* Immediate UI */
        setSortBy(normalized);

        /* URL */
        updateUrlParams(
          {
            sort:
              normalized ===
              'featured'
                ? null
                : normalized,
          },
          {
            replace: true,
            scroll: false,
          },
        );
      },
      [updateUrlParams],
    );

  /* ---------------------------------------------------------------------- */
  /* Clear All Filters                                                      */
  /* ---------------------------------------------------------------------- */

  const clearAllFilters =
    useCallback(() => {
      /* Immediate reset */
      setSelectedCategory('');
      setSearchQuery('');
      setSelectedRating(0);
      setMaxPrice(
        DEFAULT_MAX_PRICE,
      );

      updateUrlParams(
        {
          category: null,
          q: null,
          rating: null,
          price: null,
        },
        {
          replace: true,
          scroll: false,
        },
      );
    }, [updateUrlParams]);

  /* ---------------------------------------------------------------------- */
  /* Quick View                                                             */
  /* ---------------------------------------------------------------------- */

  const openQuickView =
    useCallback(
      (product: Product) => {
        setQuickViewProduct(product);
      },
      [],
    );

  const closeQuickView =
    useCallback(() => {
      setQuickViewProduct(null);
    }, []);

/* ---------------------------------------------------------------------- */
/* Retry                                                                  */
/* ---------------------------------------------------------------------- */

  const retryLoad =
    useCallback(() => {
      setReloadToken(
        (token) => token + 1,
      );
    }, []);

  /* ---------------------------------------------------------------------- */
  /* Load More                                                              */
  /* ---------------------------------------------------------------------- */

  const handleLoadMore =
    useCallback(() => {
      if (
        loadingMore ||
        !pagination.hasMore
      ) {
        return;
      }

      activeControllerRef.current?.abort();

      const seq = ++requestSeqRef.current;
      const controller =
        new AbortController();

      activeControllerRef.current =
        controller;

      const params: ShopFetchParams = {
        page: pagination.page + 1,
        q: debouncedSearch || undefined,
        category:
          selectedCategory || undefined,
        rating: selectedRating,
        price:
          debouncedMaxPrice <
          DEFAULT_MAX_PRICE
            ? debouncedMaxPrice
            : undefined,
        sort: sortBy,
      };

      setLoadingMore(true);
      setLoadMoreError('');

      (async () => {
        try {
          const payload =
            await fetchShopProducts(
              params,
              controller.signal,
            );

          if (seq !== requestSeqRef.current) {
            return;
          }

          setProducts((current) => [
            ...current,
            ...payload.products,
          ]);
          setPagination(payload.pagination);
        } catch (fetchError) {
          if (
            seq !== requestSeqRef.current ||
            (fetchError as Error).name ===
              'AbortError'
          ) {
            return;
          }

          setLoadMoreError(
            fetchError instanceof Error
              ? fetchError.message
              : 'Unable to load more products right now.',
          );
        } finally {
          if (seq === requestSeqRef.current) {
            setLoadingMore(false);

            if (
              activeControllerRef.current ===
              controller
            ) {
              activeControllerRef.current =
                null;
            }
          }
        }
      })();
    }, [
      loadingMore,
      pagination,
      debouncedSearch,
      selectedCategory,
      selectedRating,
      debouncedMaxPrice,
      sortBy,
    ]);

  /* ---------------------------------------------------------------------- */
  /* Active Filter Chips                                                    */
  /* ---------------------------------------------------------------------- */

  const activeFilterChips =
    useMemo(() => {
      const chips: Array<{
        key: string;
        label: string;
        onRemove: () => void;
      }> = [];

      if (selectedCategory) {
        chips.push({
          key: 'category',
          label: `Category: ${selectedCategory}`,
          onRemove: () =>
            updateCategoryFilter(
              undefined,
            ),
        });
      }

      if (searchQuery.trim()) {
        chips.push({
          key: 'query',
          label: `Search: ${searchQuery}`,
          onRemove: () => {
            setSearchQuery('');

            updateUrlParams(
              {
                q: null,
              },
              {
                replace: true,
                scroll: false,
              },
            );
          },
        });
      }

      if (selectedRating > 0) {
        chips.push({
          key: 'rating',
          label: `${selectedRating}+ stars`,
          onRemove: () =>
            updateRatingFilter(0),
        });
      }

      if (
        maxPrice <
        DEFAULT_MAX_PRICE
      ) {
        chips.push({
          key: 'price',
          label: `Up to ${maxPrice.toLocaleString()} BDT`,
          onRemove: () => {
            setMaxPrice(
              DEFAULT_MAX_PRICE,
            );

            updateUrlParams(
              {
                price: null,
              },
              {
                replace: true,
                scroll: false,
              },
            );
          },
        });
      }

      return chips;
    }, [
      selectedCategory,
      searchQuery,
      selectedRating,
      maxPrice,
      updateCategoryFilter,
      updateRatingFilter,
      updateUrlParams,
    ]);

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  return (
    <div className="page-shell scroll-smooth py-5 sm:py-7 md:py-10 xl:py-12">
      {/* ------------------------------------------------------------------ */}
      {/* Breadcrumb                                                         */}
      {/* ------------------------------------------------------------------ */}

      <nav
        className="mb-6 hidden items-center space-x-2 text-sm text-gray-500 md:flex"
        aria-label="Breadcrumb"
      >
        <Link
          to="/"
          className="transition-colors hover:text-primary"
        >
          Home
        </Link>

        <ChevronRight size={14} />

        <Link
          to="/shop"
          className="transition-colors hover:text-primary"
        >
          Shop
        </Link>

        {selectedCategory && (
          <>
            <ChevronRight size={14} />

            <span className="font-medium text-gray-900">
              {selectedCategory}
            </span>
          </>
        )}

        {searchQuery.trim() && (
          <>
            <ChevronRight size={14} />

            <span className="font-medium italic text-gray-900">
              Search: "{searchQuery}"
            </span>
          </>
        )}
      </nav>

      {/* ------------------------------------------------------------------ */}
      {/* Mobile Filter Button                                               */}
      {/* ------------------------------------------------------------------ */}

      <div className="mb-4 flex items-center gap-2.5 md:hidden">
        <button
          type="button"
          ref={filtersTriggerRef}
          onClick={() =>
            setMobileFiltersOpen(true)
          }
          aria-haspopup="dialog"
          aria-expanded={mobileFiltersOpen}
          aria-controls="mobile-filter-dialog"
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-2xl border border-black/5 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition active:scale-[0.98]"
        >
          <SlidersHorizontal size={16} />

          Filters

          {activeFiltersCount > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-white">
              {activeFiltersCount}
            </span>
          )}
        </button>

        <div className="surface-card min-w-0 flex-1 truncate px-3.5 py-2.5 text-sm text-slate-500">
          {pagination.total}{' '}
          items
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Mobile Filters                                                     */}
      {/* ------------------------------------------------------------------ */}

      {mobileFiltersOpen && (
        <div
          className="fixed inset-0 z-[70] bg-slate-950/45 backdrop-blur-sm md:hidden"
          onClick={() =>
            setMobileFiltersOpen(false)
          }
          role="presentation"
        >
          <div
            id="mobile-filter-dialog"
            ref={mobileDialogRef}
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-[2rem] bg-white p-4 shadow-2xl outline-none sm:p-5"
            onClick={(event) =>
              event.stopPropagation()
            }
            role="dialog"
            aria-modal="true"
            aria-label="Product filters"
          >
            <div className="mb-5 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/70 sm:text-xs">
                  Smart Filters
                </p>

                <h2 className="mt-1 text-lg font-bold text-gray-900 sm:text-xl">
                  Refine your results
                </h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  setMobileFiltersOpen(
                    false,
                  )
                }
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                aria-label="Close filters"
              >
                <X size={18} />
              </button>
            </div>

            <FilterSection
              categories={
                categoryOptions
              }
              selectedCategory={
                selectedCategory
              }
              onCategoryChange={
                updateCategoryFilter
              }
              selectedRating={
                selectedRating
              }
              onRatingChange={
                updateRatingFilter
              }
              maxPrice={maxPrice}
              onPriceChange={
                updatePriceFilter
              }
            />

            <div className="sticky bottom-0 -mx-4 mt-5 border-t border-slate-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:-mx-5 sm:px-5">
              <button
                type="button"
                onClick={() =>
                  setMobileFiltersOpen(
                    false,
                  )
                }
                disabled={loading}
                className="min-h-11 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/20 transition hover:bg-slate-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading
                  ? 'Applying filters…'
                  : `Show ${
                      pagination.total
                    } products`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Main Layout                                                        */}
      {/* ------------------------------------------------------------------ */}

      <div className="flex flex-col gap-5 lg:flex-row lg:gap-8">
        {/* Desktop Filters */}
        <aside className="hidden w-full md:block lg:w-64 lg:shrink-0 xl:w-72">
          <FilterSection
            categories={
              categoryOptions
            }
            selectedCategory={
              selectedCategory
            }
            onCategoryChange={
              updateCategoryFilter
            }
            selectedRating={
              selectedRating
            }
            onRatingChange={
              updateRatingFilter
            }
            maxPrice={maxPrice}
            onPriceChange={
              updatePriceFilter
            }
          />
        </aside>

        {/* ---------------------------------------------------------------- */}
        {/* Main Content                                                      */}
        {/* ---------------------------------------------------------------- */}

        <main
          className="min-w-0 flex-1"
          aria-live="polite"
        >
          {/* -------------------------------------------------------------- */}
          {/* Compare Bar                                                     */}
          {/* -------------------------------------------------------------- */}

          {safeCompareItems.length >
            0 && (
            <div className="sticky top-3 z-30 mb-5 rounded-[1.5rem] border border-primary/10 bg-white/95 p-3.5 shadow-lg shadow-primary/5 backdrop-blur sm:p-4 md:static md:rounded-[1.75rem] md:bg-primary/5 md:shadow-none">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="shrink-0 rounded-2xl bg-white p-3 text-primary shadow-sm">
                    <Scale size={18} />
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {
                        safeCompareItems.length
                      }{' '}
                      product
                      {safeCompareItems.length ===
                      1
                        ? ''
                        : 's'}{' '}
                      ready to compare
                    </p>

                    <p className="mt-0.5 text-xs text-slate-500">
                      Compare products
                      side-by-side.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <button
                    type="button"
                    onClick={
                      clearCompare
                    }
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:px-4"
                  >
                    <X size={16} />
                    Clear
                  </button>

                  <Link
                    to="/compare"
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 sm:px-4"
                  >
                    <Scale size={16} />
                    Compare
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* -------------------------------------------------------------- */}
          {/* Title + Sort                                                    */}
          {/* -------------------------------------------------------------- */}

          <div className="mb-3 flex w-full items-center gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-bold leading-tight text-gray-900 sm:text-2xl lg:text-3xl">
                {selectedCategory
                  ? `${selectedCategory} collection`
                  : 'All products'}
              </h1>

              <p className="mt-1 text-xs text-gray-500 sm:text-sm">
                {pagination.total}{' '}
                items matched your
                current filters.
              </p>
            </div>

            {/* Sort */}
            <div className="flex shrink-0 items-center gap-2 rounded-2xl bg-bg-light p-2">
              <span className="hidden whitespace-nowrap px-1 text-xs font-medium text-gray-500 sm:inline sm:px-2 sm:text-sm">
                Sort by
              </span>

              <select
                value={sortBy}
                onChange={(event) =>
                  updateSort(
                    event.target.value,
                  )
                }
                aria-label="Sort products"
                className="min-h-9 rounded-xl border border-black/5 bg-white px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20 sm:min-h-10 sm:px-4 sm:text-sm"
              >
                <option value="featured">
                  Most Popular
                </option>

                <option value="price-low">
                  Price: Low to High
                </option>

                <option value="price-high">
                  Price: High to Low
                </option>

                <option value="rating">
                  Top Rated
                </option>

                <option value="discount">
                  Best Discount
                </option>
              </select>
            </div>
          </div>

          {/* -------------------------------------------------------------- */}
          {/* Active Filters Row                                              */}
          {/* -------------------------------------------------------------- */}

          {activeFilterChips.length >
            0 && (
            <div className="mb-5 w-full border-b border-slate-100 pb-3">
              <FilterChips
                chips={
                  activeFilterChips
                }
                onClearAll={
                  clearAllFilters
                }
              />
            </div>
          )}

          {/* -------------------------------------------------------------- */}
          {/* Results                                                         */}
          {/* -------------------------------------------------------------- */}

          {loading ? (
            <LoadingSkeleton />
          ) : error ? (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-center shadow-sm sm:p-12">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-rose-500 shadow-sm sm:h-16 sm:w-16">
                <RotateCcw size={24} />
              </div>

              <h2 className="text-xl font-bold text-rose-900 sm:text-2xl">
                Shop data is unavailable
              </h2>

              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-rose-700">
                {error}
              </p>

              <button
                type="button"
                onClick={
                  retryLoad
                }
                className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-rose-900/10 transition hover:bg-rose-700"
              >
                <RotateCcw size={16} />
                Retry loading
              </button>
            </div>
          ) : products.length > 0 ? (
            <>
              <ProductGrid
                products={products}
                onQuickView={
                  openQuickView
                }
              />

              <div className="mt-8">
                <p className="mb-4 text-center text-xs font-medium text-slate-500 sm:text-sm">
                  Showing {products.length}{' '}
                  of {pagination.total}{' '}
                  products
                </p>

                {pagination.hasMore && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={
                        handleLoadMore
                      }
                      disabled={
                        loadingMore
                      }
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-slate-950/20 transition hover:bg-slate-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loadingMore
                        ? 'Loading...'
                        : 'Load More'}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-3xl border border-dashed border-primary/20 bg-white/85 p-6 text-center shadow-sm sm:p-12">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary sm:h-20 sm:w-20">
                <PackageSearch
                  size={28}
                  className="sm:h-8 sm:w-8"
                />
              </div>

              <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">
                No products matched
                your filters
              </h2>

              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-gray-500">
                Try a wider price
                range, remove a
                rating filter, or
                explore another
                category.
              </p>

              <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                {activeFiltersCount >
                  0 && (
                  <button
                    type="button"
                    onClick={
                      clearAllFilters
                    }
                    className="rounded-full bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800"
                  >
                    Remove filters
                  </button>
                )}

                {featuredCategories.map(
                  (category) => (
                    <button
                      key={
                        category.id
                      }
                      type="button"
                      onClick={() =>
                        updateCategoryFilter(
                          category.name,
                        )
                      }
                      className="rounded-full bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground transition hover:bg-primary/10 hover:text-primary"
                    >
                      {category.name}
                    </button>
                  ),
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Quick View                                                         */}
      {/* ------------------------------------------------------------------ */}

      {quickViewProduct && (
        <Suspense fallback={null}>
          <ProductQuickView
            product={
              quickViewProduct
            }
            isOpen
            onClose={
              closeQuickView
            }
          />
        </Suspense>
      )}
    </div>
  );
};
