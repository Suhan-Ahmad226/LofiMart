import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Heart, Home, Info, Minus, Plus, ShoppingCart, Star, Trash2 } from 'lucide-react';
import { Link } from '@/lib/navigation';
import { Skeleton } from '@/features/shared/ui/Skeleton';
import { useCart } from '@/features/shop/state/CartContext';
import { useWishlist } from '@/features/shop/state/WishlistContext';
import { cn, formatPrice } from '@/lib/utils';
import type { CartItem, Product } from '@/types';

const PLATFORM_FEE = 5;

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
  if (item.selected_variant_summary) return item.selected_variant_summary;
  if (item.category) return `Color-${item.category}`;
  return 'Color-Not Specified';
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
            {item.rating ? (
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
            <button
              type="button"
              className="h-[30px] rounded-full border border-[#ff8bc8] px-4 text-xs text-[#2563EB] transition hover:bg-[#fff0f8]"
            >
              More Items Like This
            </button>
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
        <span className="rounded-full border border-[#7ee7ad] bg-white px-3 py-2 text-xs text-[#16A34A]">No Product Selected</span>
      </div>
    </section>
  );
};

const CompactProductCard = ({
  product,
  onAddToCart,
  onWishlist,
  wishlisted,
}: {
  product: Product;
  onAddToCart: (product: Product) => void;
  onWishlist: (product: Product) => void;
  wishlisted: boolean;
}) => {
  const discount = product.old_price && product.old_price > product.price ? Math.round(((product.old_price - product.price) / product.old_price) * 100) : 0;

  return (
    <article className="min-w-[86px] bg-white p-1.5 sm:min-w-[118px]">
      <Link to={`/product/${product.slug}`} className="block aspect-square overflow-hidden bg-[#f7f8fb]">
        <img
          src={product.image || '/icon.svg'}
          alt={product.name}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      </Link>
      <Link to={`/product/${product.slug}`} className="mt-1.5 block min-h-[28px] text-[10px] leading-[14px] text-[#111827] hover:text-[#2563EB]">
        <span className="line-clamp-2">{product.name}</span>
      </Link>
      <div className="mt-1 flex items-start justify-between gap-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-xs font-semibold text-[#2563EB]">{formatPrice(product.price)}</span>
            {discount > 0 ? <span className="text-[9px] text-[#2563EB]">-{discount}%</span> : null}
          </div>
          {product.old_price && product.old_price > product.price ? (
            <p className="text-[9px] text-[#8a94a6] line-through">{formatPrice(product.old_price)}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onWishlist(product)}
          aria-label={wishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
          className="shrink-0 text-[#2563EB] transition hover:text-[#2563EB]"
        >
          <Heart size={14} fill={wishlisted ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-1 flex items-center justify-between gap-1">
        <div className="flex items-center gap-0.5 text-[#ff9800]">
          {Array.from({ length: 5 }).map((_, index) => (
            <Star key={index} size={8} fill="currentColor" aria-hidden="true" />
          ))}
          <span className="ml-0.5 text-[8px] text-[#98a2b3]">({product.reviews_count || 0})</span>
        </div>
        <button
          type="button"
          onClick={() => onAddToCart(product)}
          aria-label={`Add ${product.name} to cart`}
          className="text-[#2563EB] transition hover:text-[#2563EB]"
        >
          <ShoppingCart size={13} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
};

const ProductRailSection = ({
  title,
  products,
  onAddToCart,
  onWishlist,
  isWishlisted,
  onLoadMore,
  hasMore = false,
}: {
  title: string;
  products: Product[];
  onAddToCart: (product: Product) => void;
  onWishlist: (product: Product) => void;
  isWishlisted: (productId: number) => boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
}) => {
  if (products.length === 0) return null;

  return (
    <section className="bg-white">
      <h2 className="border-b border-[#eef0f3] px-2 py-2 text-xs font-medium text-black">{title}</h2>
      <div className="grid grid-cols-2 gap-2 px-2 py-2 min-[430px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {products.map((product) => (
          <CompactProductCard
            key={`${title}-${product.id}`}
            product={product}
            onAddToCart={onAddToCart}
            onWishlist={onWishlist}
            wishlisted={isWishlisted(product.id)}
          />
        ))}
      </div>
      {onLoadMore && hasMore ? (
        <div className="flex justify-center border-t border-[#eef0f3] px-2 py-3">
          <button
            type="button"
            onClick={onLoadMore}
            className="h-9 rounded-full border border-[#2563EB] px-6 text-sm font-semibold text-[#2563EB] transition hover:bg-[#fff0f8]"
          >
            Load More
          </button>
        </div>
      ) : null}
    </section>
  );
};

export const CartPage = () => {
  const { items, addToCart, removeFromCart, updateQuantity, isReady } = useCart();
  const { addToWishlist, isInWishlist } = useWishlist();
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const [visibleDealCount, setVisibleDealCount] = useState(12);

  const groups = useMemo(() => groupItemsBySeller(items), [items]);

  const allKeys = useMemo(() => items.map(getCartItemKey), [items]);
  const allSelected = items.length > 0 && allKeys.every((key) => selectedKeys.has(key));

  const selectedItems = useMemo(() => items.filter((item) => selectedKeys.has(getCartItemKey(item))), [items, selectedKeys]);
  const productTotal = useMemo(() => selectedItems.reduce((sum, item) => sum + item.price * item.quantity, 0), [selectedItems]);
  const totalPayment = selectedItems.length > 0 ? productTotal + PLATFORM_FEE : PLATFORM_FEE;
  const fallbackProducts = useMemo<Product[]>(() => items.map(({ quantity: _quantity, ...product }) => product), [items]);
  const recommendationProducts = recommendations.length > 0 ? recommendations : fallbackProducts;
  const recentlyViewedProducts = useMemo(() => recommendationProducts.slice(0, 6), [recommendationProducts]);
  const dealProducts = useMemo(() => recommendationProducts.slice(6, 30), [recommendationProducts]);
  const visibleDealProducts = useMemo(() => {
    const products = dealProducts.length > 0 ? dealProducts : recommendationProducts;
    return products.slice(0, visibleDealCount);
  }, [dealProducts, recommendationProducts, visibleDealCount]);
  const hasMoreDeals = (dealProducts.length > 0 ? dealProducts : recommendationProducts).length > visibleDealCount;

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch('/api/products?limit=30', {
          signal: controller.signal,
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) return;
        if (!controller.signal.aborted) {
          setRecommendations(getProductList(payload));
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setRecommendations([]);
        }
      }
    })();

    return () => controller.abort();
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;

      setSelectedKeys((current) => {
        const validKeys = new Set(allKeys);
        const next = new Set<string>();

        for (const key of current) {
          if (validKeys.has(key)) next.add(key);
        }

        if (current.size === 0 && allKeys.length > 0) {
          return new Set(allKeys);
        }

        return next;
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
        updateQuantity(item.id, nextQuantity, item.selected_variant_key);
      }
    },
    [updateQuantity],
  );

  const handleRemove = useCallback(
    (item: CartItem) => {
      removeFromCart(item.id, item.selected_variant_key);
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
      removeFromCart(item.id, item.selected_variant_key);
    }
    setSelectedKeys(new Set());
  }, [removeFromCart, selectedItems]);

  const handleWishlist = useCallback(
    (item: CartItem) => {
      if (!isInWishlist(item.id)) {
        void addToWishlist(item);
      }
    },
    [addToWishlist, isInWishlist],
  );

  const handleRecommendationWishlist = useCallback(
    (product: Product) => {
      if (!isInWishlist(product.id)) {
        void addToWishlist(product);
      }
    },
    [addToWishlist, isInWishlist],
  );

  const handleLoadMoreDeals = useCallback(() => {
    setVisibleDealCount((count) => count + 12);
  }, []);

  if (!isReady) return <CartSkeleton />;

  if (items.length === 0) {
    return (
      <main className="min-h-screen bg-[#f5f5f5] px-2 py-6">
        <div className="mx-auto max-w-xl rounded bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#eaf6ff] text-[#6366F1]">
            <Home size={28} aria-hidden="true" />
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
            <Link
              to="/checkout"
              className="mt-10 flex h-[33px] w-full items-center justify-center rounded-full bg-[linear-gradient(90deg,#9b3bb0_0%,#2563EB_100%)] text-sm font-semibold text-white transition hover:opacity-95"
            >
              Checkout
            </Link>
          </div>
        </aside>
      </div>

      <div className="mt-3 space-y-3 px-2 pb-6 sm:px-3">
        <ProductRailSection
          title="Recently viewed product"
          products={recentlyViewedProducts}
          onAddToCart={addToCart}
          onWishlist={handleRecommendationWishlist}
          isWishlisted={isInWishlist}
        />
        <ProductRailSection
          title="Deals you can't miss"
          products={visibleDealProducts}
          onAddToCart={addToCart}
          onWishlist={handleRecommendationWishlist}
          isWishlisted={isInWishlist}
          onLoadMore={handleLoadMoreDeals}
          hasMore={hasMoreDeals}
        />
      </div>
    </main>
  );
};
