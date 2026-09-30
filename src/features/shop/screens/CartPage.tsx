import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Heart, Home, Info, Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { Link, useNavigate } from '@/lib/navigation';
import { Skeleton } from '@/features/shared/ui/Skeleton';
import { useCart } from '@/features/shop/state/CartContext';
import { useWishlist } from '@/features/shop/state/WishlistContext';
import { cn, formatPrice } from '@/lib/utils';
import { PLATFORM_FEE } from '@/lib/commerce-channels';
import { ProductCard } from '@/features/shared/ui/product/ProductCard';
import type { CartItem, Product } from '@/types';

const DEALS_PAGE_SIZE = 8;

type SellerGroup = {
  id: string;
  name: string;
  items: CartItem[];
};

function getProductList(payload: unknown): Product[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.products)) return record.products as Product[];
  if (Array.isArray(record.items)) return record.items as Product[];
  if (Array.isArray(record.data)) return record.data as Product[];
  const data = record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : null;
  if (Array.isArray(data?.products)) return data.products as Product[];
  if (Array.isArray(data?.items)) return data.items as Product[];

  return [];
}

function getPaginationHasMore(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const record = payload as Record<string, unknown>;
  const pagination =
    record.pagination && typeof record.pagination === 'object'
      ? (record.pagination as Record<string, unknown>)
      : null;
  if (!pagination) return false;
  const value = pagination.hasMore ?? pagination.has_more;
  return typeof value === 'boolean' ? value : Boolean(value);
}

function getCartItemKey(item: Pick<CartItem, 'id' | 'selected_variant_key'>) {
  return `${item.id}:${item.selected_variant_key || 'base'}`;
}

function getSellerKey(item: CartItem) {
  if (item.seller_id) return `seller:${item.seller_id}`;
  return `seller:${(item.store_name || item.seller_name || item.category || 'Marketplace').trim().toLowerCase()}`;
}

function getSellerName(item: CartItem) {
  return item.store_name?.trim() || item.seller_name?.trim() || item.category || 'Marketplace';
}

function getVariantLabel(item: CartItem) {
  return item.selected_variant_summary || 'Standard';
}

function groupItemsBySeller(items: CartItem[]) {
  const groups = new Map<string, SellerGroup>();

  for (const item of items) {
    const id = getSellerKey(item);
    const existing = groups.get(id);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(id, {
        id,
        name: getSellerName(item),
        items: [item],
      });
    }
  }

  return Array.from(groups.values());
}

function CartSkeleton() {
  return (
    <main className="min-h-screen bg-[#f5f5f5]">
      <div className="px-2 py-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="rounded bg-white p-5">
            <Skeleton className="h-8 w-56 rounded" />
            <div className="mt-4 space-y-3">
              <Skeleton className="h-48 w-full rounded" />
              <Skeleton className="h-48 w-full rounded" />
            </div>
          </div>
          <Skeleton className="h-80 rounded" />
        </div>
      </div>
    </main>
  );
}

const Checkbox = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) => (
  <button
    type="button"
    onClick={onChange}
    aria-label={label}
    aria-pressed={checked}
    className={cn(
      'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-white transition',
      checked ? 'border-[#6366F1] bg-white text-[#6366F1]' : 'border-[#cfd4dc] bg-white text-transparent',
    )}
  >
    <Check size={16} strokeWidth={3} aria-hidden="true" />
  </button>
);

const QuantityControl = ({
  item,
  onUpdate,
}: {
  item: CartItem;
  onUpdate: (item: CartItem, quantity: number) => void;
}) => {
  const stock = Number(item.stock);
  const hasStockLimit = Number.isFinite(stock) && stock > 0;
  const atMax = hasStockLimit && item.quantity >= stock;

  return (
    <div className="flex h-[30px] overflow-hidden rounded border border-[#E2E8F0] bg-white">
      <button
        type="button"
        disabled={item.quantity <= 1}
        onClick={() => onUpdate(item, item.quantity - 1)}
        aria-label={`Decrease quantity for ${item.name}`}
        className="flex w-[28px] items-center justify-center px-2 text-[#2563EB] transition hover:bg-[#f7f7f7] disabled:cursor-not-allowed disabled:text-[#c9ced8]"
      >
        <Minus size={14} aria-hidden="true" />
      </button>
      <span className="flex min-w-9 items-center justify-center border-x border-[#E2E8F0] px-3 text-sm text-[#0f172a]">{item.quantity}</span>
      <button
        type="button"
        disabled={atMax}
        onClick={() => onUpdate(item, item.quantity + 1)}
        aria-label={`Increase quantity for ${item.name}`}
        className="flex items-center justify-center px-2 text-[#2563EB] transition hover:bg-[#f7f7f7] disabled:cursor-not-allowed disabled:text-[#c9ced8]"
      >
        <Plus size={14} aria-hidden="true" />
      </button>
    </div>
  );
};

const CartProduct = ({
  item,
  selected,
  onToggle,
  onUpdateQuantity,
  onRemove,
  onWishlist,
}: {
  item: CartItem;
  selected: boolean;
  onToggle: (item: CartItem) => void;
  onUpdateQuantity: (item: CartItem, quantity: number) => void;
  onRemove: (item: CartItem) => void;
  onWishlist: (item: CartItem) => void;
}) => {
  const lineTotal = item.price * item.quantity;
  const oldLineTotal = item.old_price && item.old_price > item.price ? item.old_price * item.quantity : null;

  return (
    <div className="rounded-b-lg bg-white px-2 pb-2">
      <div className="flex flex-col gap-3 py-2 sm:flex-row">
        <Checkbox checked={selected} onChange={() => onToggle(item)} label={`Select ${item.name}`} />

        <Link
          to={`/product/${item.slug}`}
          className="block h-[118px] w-[118px] shrink-0 overflow-hidden rounded-lg bg-[#f4f6f8] p-1"
          aria-label={`View ${item.name}`}
        >
          <img
            src={item.image || '/icon.svg'}
            alt={item.name}
            className="h-full w-full rounded-md object-cover"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        </Link>

        <div className="min-w-0 flex-1 pr-2">
          <Link to={`/product/${item.slug}`} className="line-clamp-2 text-[17px] font-medium leading-6 text-black hover:text-[#2563EB]">
            {item.name}
          </Link>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            {item.verification_badge ? (
              <span className="rounded bg-[#173b6c] px-1.5 py-0.5 text-[11px] font-semibold text-white">Verified</span>
            ) : null}
            <span className="rounded-full bg-[#F1F5F9] px-3 py-1 text-[#0f172a]">
              <span className="mr-1 text-black">●</span>
              {getVariantLabel(item)}
            </span>
            <span className="text-[#15803D]">Fulfilled by Seller</span>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-2">
            <QuantityControl item={item} onUpdate={onUpdateQuantity} />
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-row items-end justify-between sm:w-[108px] sm:flex-col sm:items-end">
          <div className="text-left sm:text-right">
            <p className="text-[25px] font-semibold leading-7 text-[#2563EB]">{formatPrice(lineTotal)}</p>
            {oldLineTotal ? <p className="text-sm text-[#8a94a6] line-through">{formatPrice(oldLineTotal)}</p> : null}
          </div>
          <div className="flex items-center gap-4 pb-1 text-[#9aa3b1]">
            <button type="button" onClick={() => onRemove(item)} aria-label={`Remove ${item.name}`} className="transition hover:text-[#2563EB]">
              <Trash2 size={20} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => onWishlist(item)} aria-label={`Add ${item.name} to wishlist`} className="transition hover:text-[#2563EB]">
              <Heart size={22} fill="currentColor" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const SellerBlock = ({
  group,
  selectedKeys,
  onToggleSeller,
  onToggleItem,
  onUpdateQuantity,
  onRemove,
  onWishlist,
}: {
  group: SellerGroup;
  selectedKeys: Set<string>;
  onToggleSeller: (group: SellerGroup) => void;
  onToggleItem: (item: CartItem) => void;
  onUpdateQuantity: (item: CartItem, quantity: number) => void;
  onRemove: (item: CartItem) => void;
  onWishlist: (item: CartItem) => void;
}) => {
  const allSelected = group.items.every((item) => selectedKeys.has(getCartItemKey(item)));

  return (
    <section className="overflow-hidden rounded-lg bg-[#eaf6ff]">
      <div className="flex h-[44px] items-center justify-between px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Checkbox checked={allSelected} onChange={() => onToggleSeller(group)} label={`Select all products from ${group.name}`} />
          <span className="truncate text-sm font-medium text-black">{group.name}</span>
          {group.name.toLowerCase().includes('kiddy') ? (
            <span className="rounded bg-[#ff2b77] px-2 py-1 text-[10px] font-bold uppercase text-white">Certified Store</span>
          ) : null}
        </div>
        <span className="text-sm text-[#334155]">{group.items.length} items</span>
      </div>

      {group.items.map((item) => (
        <CartProduct
          key={getCartItemKey(item)}
          item={item}
          selected={selectedKeys.has(getCartItemKey(item))}
          onToggle={onToggleItem}
          onUpdateQuantity={onUpdateQuantity}
          onRemove={onRemove}
          onWishlist={onWishlist}
        />
      ))}

      <div className="flex min-h-[62px] items-center justify-between px-3">
        <span className="text-sm text-[#16A34A]">Standard Delivery</span>
      </div>
    </section>
  );
};

const ProductRailSection = ({
  title,
  products,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
  loadError = false,
  onRetry,
}: {
  title: string;
  products: Product[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  loadError?: boolean;
  onRetry?: () => void;
}) => {
  const showFooter = (onLoadMore != null && hasMore) || Boolean(loadError && onRetry);
  if (products.length === 0 && !showFooter) return null;

  return (
    <section className="bg-white">
      <header className="flex items-center gap-2 border-b border-[#eef0f3] px-3 py-3">
        <span className="h-4 w-1 shrink-0 rounded-full bg-gradient-to-b from-[#9b3bb0] to-[#2563EB]" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-black">{title}</h2>
      </header>
      {products.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 px-3 py-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {products.map((product) => (
            <ProductCard
              key={`${title}-${product.id}`}
              product={product}
            />
          ))}
        </div>
      ) : null}
      {showFooter ? (
        <div className="flex flex-col items-center gap-2 border-t border-[#eef0f3] px-2 py-3">
          {loadError ? (
            <>
              <p className="text-[13px] text-[#b91c1c]" role="alert">
                Couldn't load more products.
              </p>
              <button
                type="button"
                onClick={onRetry}
                disabled={loadingMore}
                className="h-9 rounded-full border border-[#2563EB] px-6 text-sm font-semibold text-[#2563EB] transition hover:bg-[#fff0f8] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Try Again
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMore}
              className="h-9 rounded-full border border-[#2563EB] px-6 text-sm font-semibold text-[#2563EB] transition hover:bg-[#fff0f8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMore ? 'Loading...' : 'Load More'}
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
};

const ProductRailSkeleton = ({ title, count = 8 }: { title: string; count?: number }) => (
  <section className="bg-white">
    <header className="flex items-center gap-2 border-b border-[#eef0f3] px-3 py-3">
      <span className="h-4 w-1 shrink-0 rounded-full bg-gradient-to-b from-[#9b3bb0] to-[#2563EB]" aria-hidden="true" />
      <h2 className="text-sm font-semibold text-black">{title}</h2>
    </header>
    <div className="grid grid-cols-2 gap-3 px-3 py-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-lg border border-slate-200 bg-white p-2">
          <Skeleton className="aspect-square w-full rounded-md" />
          <Skeleton className="mt-3 h-3 w-4/5 rounded" />
          <Skeleton className="mt-2 h-3 w-3/5 rounded" />
          <Skeleton className="mt-3 h-9 w-full rounded-md" />
        </div>
      ))}
    </div>
  </section>
);

export const CartPage = () => {
  const { items, removeFromCart, updateQuantity, replaceCart, isReady } = useCart();
  const { addToWishlist, isInWishlist } = useWishlist();
  const navigate = useNavigate();
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [deals, setDeals] = useState<Product[]>([]);
  const [dealsHasMore, setDealsHasMore] = useState(false);
  const [dealsInitialLoading, setDealsInitialLoading] = useState(true);
  const [dealsInitialError, setDealsInitialError] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [dealsLoadError, setDealsLoadError] = useState(false);

  const nextDealsPageRef = useRef(1);
  const loadMoreInFlightRef = useRef(false);
  const loadMoreControllerRef = useRef<AbortController | null>(null);

  const groups = useMemo(() => groupItemsBySeller(items), [items]);

  const allKeys = useMemo(() => items.map(getCartItemKey), [items]);
  const allSelected = items.length > 0 && allKeys.every((key) => selectedKeys.has(key));

  const selectedItems = useMemo(() => items.filter((item) => selectedKeys.has(getCartItemKey(item))), [items, selectedKeys]);
  const productTotal = useMemo(() => selectedItems.reduce((sum, item) => sum + item.price * item.quantity, 0), [selectedItems]);
  const totalPayment = productTotal + PLATFORM_FEE;

  const fetchDealsPage = useCallback(
    async (page: number, signal?: AbortSignal) => {
      const response = await fetch(`/api/products?page=${page}&limit=${DEALS_PAGE_SIZE}`, {
        signal,
      });
      if (!response.ok) throw new Error('Failed to load deals');
      const payload = await response.json().catch(() => null);
      return {
        products: getProductList(payload),
        hasMore: getPaginationHasMore(payload),
      };
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const { products, hasMore } = await fetchDealsPage(1, controller.signal);
        if (cancelled || controller.signal.aborted) return;
        setDeals(products);
        setDealsHasMore(hasMore);
        nextDealsPageRef.current = 2;
      } catch (error) {
        if (cancelled || controller.signal.aborted || (error as Error).name === 'AbortError') return;
        setDeals([]);
        setDealsHasMore(false);
        setDealsInitialError(true);
      } finally {
        if (!cancelled && !controller.signal.aborted) {
          setDealsInitialLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [fetchDealsPage]);

  useEffect(() => {
    return () => loadMoreControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;

      setSelectedKeys((current) => {
        if (allKeys.length === 0 || current.size === 0) {
          return current.size === 0 && allKeys.length > 0 ? new Set(allKeys) : current;
        }

        let next: Set<string> | null = null;
        for (const key of current) {
          if (!allKeys.includes(key)) {
            if (!next) next = new Set(current);
            next.delete(key);
          }
        }

        return next ?? current;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [allKeys]);

  const toggleAll = useCallback(() => {
    setSelectedKeys((current) => {
      const selectedEveryItem = allKeys.length > 0 && allKeys.every((key) => current.has(key));
      return selectedEveryItem ? new Set() : new Set(allKeys);
    });
  }, [allKeys]);

  const toggleSeller = useCallback((group: SellerGroup) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      const sellerKeys = group.items.map(getCartItemKey);
      const selectedEveryItem = sellerKeys.every((key) => next.has(key));

      for (const key of sellerKeys) {
        if (selectedEveryItem) {
          next.delete(key);
        } else {
          next.add(key);
        }
      }

      return next;
    });
  }, []);

  const toggleItem = useCallback((item: CartItem) => {
    const key = getCartItemKey(item);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleUpdateQuantity = useCallback(
    (item: CartItem, quantity: number) => {
      const stock = Number(item.stock);
      const max = Number.isFinite(stock) && stock > 0 ? stock : Number.POSITIVE_INFINITY;
      const nextQuantity = Math.min(Math.max(1, quantity), max);
      if (nextQuantity !== item.quantity) {
        updateQuantity(item.id, nextQuantity, item.selected_variant_key ?? undefined);
      }
    },
    [updateQuantity],
  );

  const handleRemove = useCallback(
    (item: CartItem) => {
      removeFromCart(item.id, item.selected_variant_key ?? undefined);
      setSelectedKeys((current) => {
        const next = new Set(current);
        next.delete(getCartItemKey(item));
        return next;
      });
    },
    [removeFromCart],
  );

  const handleDeleteSelected = useCallback(() => {
    for (const item of selectedItems) {
      removeFromCart(item.id, item.selected_variant_key ?? undefined);
    }
    setSelectedKeys(new Set());
  }, [removeFromCart, selectedItems]);

  const handleCheckout = useCallback(() => {
    if (selectedItems.length === 0) return;
    if (selectedItems.length === items.length) {
      navigate('/checkout');
      return;
    }
    replaceCart(selectedItems);
    navigate('/checkout');
  }, [items.length, navigate, replaceCart, selectedItems]);

  const handleWishlist = useCallback(
    (item: CartItem) => {
      if (!isInWishlist(item.id)) {
        void addToWishlist(item);
      }
    },
    [addToWishlist, isInWishlist],
  );

  const handleLoadMoreDeals = useCallback(() => {
    if (loadMoreInFlightRef.current || isLoadingMore || !dealsHasMore) return;

    setDealsLoadError(false);

    const page = nextDealsPageRef.current;
    loadMoreInFlightRef.current = true;
    setIsLoadingMore(true);

    const controller = new AbortController();
    loadMoreControllerRef.current = controller;

    void (async () => {
      try {
        const { products, hasMore } = await fetchDealsPage(page, controller.signal);
        if (controller.signal.aborted) return;

        setDeals((current) => {
          const seen = new Map(current.map((product) => [product.id, product]));
          for (const product of products) {
            if (!seen.has(product.id)) seen.set(product.id, product);
          }
          return Array.from(seen.values());
        });
        setDealsHasMore(hasMore);
        nextDealsPageRef.current = page + 1;
      } catch (error) {
        if (!controller.signal.aborted && (error as Error).name !== 'AbortError') {
          setDealsLoadError(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingMore(false);
        }
        loadMoreInFlightRef.current = false;
        if (loadMoreControllerRef.current === controller) {
          loadMoreControllerRef.current = null;
        }
      }
    })();
  }, [fetchDealsPage, isLoadingMore, dealsHasMore]);

  const handleRetryDeals = useCallback(() => {
    if (loadMoreInFlightRef.current) return;

    setDealsInitialError(false);
    setDealsLoadError(false);

    loadMoreInFlightRef.current = true;
    setIsLoadingMore(true);

    const controller = new AbortController();
    loadMoreControllerRef.current = controller;

    void (async () => {
      try {
        const { products, hasMore } = await fetchDealsPage(1, controller.signal);
        if (controller.signal.aborted) return;

        setDeals(products);
        setDealsHasMore(hasMore);
        nextDealsPageRef.current = 2;
      } catch (error) {
        if (!controller.signal.aborted && (error as Error).name !== 'AbortError') {
          setDeals([]);
          setDealsHasMore(false);
          setDealsInitialError(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingMore(false);
        }
        loadMoreInFlightRef.current = false;
        if (loadMoreControllerRef.current === controller) {
          loadMoreControllerRef.current = null;
        }
      }
    })();
  }, [fetchDealsPage]);

  if (!isReady) return <CartSkeleton />;

  if (items.length === 0) {
    return (
      <main className="min-h-screen bg-[#f5f5f5] px-2 py-6">
        <div className="mx-auto max-w-xl rounded bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#eaf6ff] text-[#6366F1]">
            <ShoppingCart size={28} aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-xl font-semibold text-black">Your cart is empty</h1>
          <p className="mt-2 text-sm text-[#667085]">Add products to see them here.</p>
          <Link to="/shop" className="mt-5 inline-flex rounded bg-[#2563EB] px-5 py-2.5 text-sm font-semibold text-white">
            Continue Shopping
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] text-black">
      <nav className="flex h-[56px] items-center gap-3 border-b border-[#e5e7eb] bg-[#f7f8fa] px-3 text-sm" aria-label="Breadcrumb">
        <Link to="/" aria-label="Home" className="text-[#344054] transition hover:text-[#2563EB]">
          <Home size={18} aria-hidden="true" />
        </Link>
        <ChevronRight size={17} className="text-[#111827]" aria-hidden="true" />
        <span className="font-medium text-black">Cart</span>
      </nav>

      <div className="grid gap-4 px-2 py-0 sm:px-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="bg-white px-5 py-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-5">
              <h1 className="text-[21px] font-medium text-black">Order items ({items.length})</h1>
              <div className="flex items-center gap-2 text-base text-black">
                <Checkbox checked={allSelected} onChange={toggleAll} label={`Select all ${items.length} items`} />
                Select All ({items.length})
              </div>
            </div>
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={selectedItems.length === 0}
              className="flex items-center gap-1 text-sm text-[#8a94a6] transition hover:text-[#2563EB] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 size={16} aria-hidden="true" />
              Delete
            </button>
          </header>

          <div className="mt-3 space-y-2">
            {groups.map((group) => (
              <SellerBlock
                key={group.id}
                group={group}
                selectedKeys={selectedKeys}
                onToggleSeller={toggleSeller}
                onToggleItem={toggleItem}
                onUpdateQuantity={handleUpdateQuantity}
                onRemove={handleRemove}
                onWishlist={handleWishlist}
              />
            ))}
          </div>
        </section>

        <aside className="px-0 py-0 lg:pt-0">
          <div className="rounded border border-[#E2E8F0] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.06)] lg:sticky lg:top-4">
            <h2 className="text-sm font-semibold text-[#1f2937]">Order summary:</h2>
            <div className="mt-4 border-t border-[#E2E8F0] pt-5">
              <div className="flex items-center justify-between text-base text-[#334155]">
                <span>Product price:</span>
                <span className="font-semibold">{formatPrice(productTotal)}</span>
              </div>
              <div className="mt-7 flex items-center justify-between text-base text-[#334155]">
                <span className="flex items-center gap-1">
                  Platform fee:
                  <Info size={15} className="text-[#2f6bff]" aria-hidden="true" />
                </span>
                <span className="font-semibold">{formatPrice(PLATFORM_FEE)}</span>
              </div>
            </div>
            <div className="mt-7 border-t border-dashed border-[#E2E8F0] pt-6">
              <div className="flex items-center justify-between text-base text-[#334155]">
                <span>Total payment:</span>
                <span className="font-semibold">{formatPrice(totalPayment)}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCheckout}
              disabled={selectedItems.length === 0}
              className="mt-10 flex h-[33px] w-full items-center justify-center rounded-full bg-[linear-gradient(90deg,#9b3bb0_0%,#2563EB_100%)] text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Checkout
            </button>
          </div>
        </aside>
      </div>

      <div className="mt-3 space-y-3 px-2 pb-6 sm:px-3">
        {dealsInitialLoading ? (
          <ProductRailSkeleton title="Deals you can't miss" />
        ) : (
          <ProductRailSection
            title="Deals you can't miss"
            products={deals}
            onLoadMore={handleLoadMoreDeals}
            onRetry={deals.length > 0 ? handleLoadMoreDeals : handleRetryDeals}
            hasMore={deals.length > 0 && dealsHasMore}
            loadingMore={isLoadingMore}
            loadError={deals.length > 0 ? dealsLoadError : dealsInitialError}
          />
        )}
      </div>
    </main>
  );
};
