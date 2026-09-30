"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Clock3,
  Loader2,
  PackageOpen,
  RotateCcw,
  Zap,
} from "lucide-react";
import { ProductCard } from "@/features/shared/ui/product/ProductCard";
import { Skeleton } from "@/features/shared/ui/Skeleton";
import type { Product } from "@/types";

type FlashSaleCampaign = {
  id: string;
  title: string;
  description?: string;
  banner_image?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  status: string;
};

type FlashSaleEntry = {
  id: string;
  sale_price: number;
  allocated_stock: number;
  product: Product | null;
};

type PaginationMeta = {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
};

type FlashSaleApiResponse = {
  campaign: FlashSaleCampaign | null;
  entries: FlashSaleEntry[];
  pagination: PaginationMeta;
};

type Countdown = {
  hours: string;
  mins: string;
  secs: string;
  ended: boolean;
};

const PAGE_SIZE = 20;

const DEFAULT_DESCRIPTION =
  "Live limited-time marketplace offers managed by admin and fulfilled by approved sellers.";

const defaultCountdown: Countdown = {
  hours: "00",
  mins: "00",
  secs: "00",
  ended: true,
};

const calculateCountdown = (targetIso?: string | null): Countdown => {
  if (!targetIso) return defaultCountdown;

  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) return defaultCountdown;

  const totalSeconds = Math.floor(diff / 1000);
  return {
    hours: String(Math.floor(totalSeconds / 3600)).padStart(2, "0"),
    mins: String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0"),
    secs: String(totalSeconds % 60).padStart(2, "0"),
    ended: false,
  };
};

function entryToProduct(entry: FlashSaleEntry): Product | null {
  if (!entry.product) return null;
  return {
    ...entry.product,
    old_price: entry.product.old_price || entry.product.price,
    price: entry.sale_price,
    stock: entry.allocated_stock || entry.product.stock,
  };
}

function mergeDeduplicate(existing: Product[], incoming: Product[]): Product[] {
  const seen = new Set(existing.map((product) => product.id));
  const merged = [...existing];
  for (const product of incoming) {
    if (!seen.has(product.id)) {
      seen.add(product.id);
      merged.push(product);
    }
  }
  return merged;
}

function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5"
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="h-full rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
        >
          <Skeleton className="aspect-[4/5] w-full rounded-xl" />
          <Skeleton className="mt-3 h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
          <Skeleton className="mt-3 h-4 w-2/5" />
          <Skeleton className="mt-4 h-10 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  message,
}: {
  icon: ReactNode;
  title: string;
  message: string;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm sm:py-20">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {icon}
      </div>
      <h2 className="text-lg font-bold text-slate-900 sm:text-xl">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{message}</p>
    </div>
  );
}

function ErrorPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center shadow-sm sm:p-12">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-rose-500 shadow-sm">
        <AlertTriangle size={26} aria-hidden="true" />
      </div>
      <h2 className="text-lg font-bold text-slate-900 sm:text-xl">
        Flash sale data is unavailable
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-rose-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
      >
        <RotateCcw size={16} aria-hidden="true" />
        Try Again
      </button>
    </div>
  );
}

function CountdownTiles({
  countdown,
  label,
}: {
  countdown: Countdown;
  label: string;
}) {
  const tiles = [
    { label: "Hours", value: countdown.hours },
    { label: "Mins", value: countdown.mins },
    { label: "Secs", value: countdown.secs },
  ];

  return (
    <div
      role="timer"
      aria-label={label}
      className="w-full max-w-sm rounded-2xl border border-white/25 bg-white/15 p-4 text-center backdrop-blur-md sm:w-auto sm:min-w-[320px] sm:p-6"
    >
      <p className="mb-4 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-white">
        <Clock3 size={15} aria-hidden="true" />
        <span>{label}</span>
      </p>
      <div className="flex items-stretch justify-center gap-2 sm:gap-3">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="flex min-w-[58px] flex-1 flex-col gap-1 rounded-xl bg-slate-950/55 px-2 py-2.5 sm:min-w-[68px] sm:flex-none sm:px-3 sm:py-3"
          >
            <span className="font-mono text-2xl font-bold tabular-nums text-white sm:text-4xl">
              {tile.value}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">
              {tile.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const FlashSalePage = () => {
  const [campaign, setCampaign] = useState<FlashSaleCampaign | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [countdown, setCountdown] = useState<Countdown>(defaultCountdown);
  const [reloadToken, setReloadToken] = useState(0);

  const currentOffset = useRef(0);
  const loadingMoreRef = useRef(false);
  const campaignGenerationRef = useRef(0);
  const endedRefetchIdRef = useRef<string | null>(null);

  const fetchPage = useCallback(async (offset: number, isInitial: boolean) => {
    const generation = campaignGenerationRef.current + (isInitial ? 1 : 0);
    if (isInitial) campaignGenerationRef.current = generation;

    if (isInitial) {
      setInitialLoading(true);
      setError("");
    } else {
      setLoadingMore(true);
      setLoadMoreError("");
    }

    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      const response = await fetch(`/api/flash-sale/active?${params}`);

      let payload: FlashSaleApiResponse | null = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok || !payload) {
        throw new Error("Failed to load flash sale. Please try again.");
      }

      if (generation !== campaignGenerationRef.current) return;

      const incomingProducts = (payload.entries || [])
        .map(entryToProduct)
        .filter((product): product is Product => product !== null);

      if (isInitial) {
        setCampaign(payload.campaign || null);
        setProducts(incomingProducts);
      } else {
        setProducts((previous) => mergeDeduplicate(previous, incomingProducts));
      }

      setHasMore(payload.pagination.hasMore);
      setTotal(payload.pagination.total);
      currentOffset.current = offset + incomingProducts.length;
    } catch (requestError) {
      if (generation !== campaignGenerationRef.current) return;
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Failed to load flash sale. Please try again.";
      if (isInitial) {
        setCampaign(null);
        setError(message);
      } else {
        setLoadMoreError(message);
      }
    } finally {
      if (isInitial) {
        setInitialLoading(false);
      } else {
        setLoadingMore(false);
        loadingMoreRef.current = false;
      }
    }
  }, []);

  useEffect(() => {
    currentOffset.current = 0;
    loadingMoreRef.current = false;
    endedRefetchIdRef.current = null;
    void fetchPage(0, true);
  }, [fetchPage, reloadToken]);

  const isScheduled = campaign?.status === "scheduled";

  useEffect(() => {
    if (!campaign) {
      setCountdown(defaultCountdown);
      return;
    }

    const targetIso = isScheduled ? campaign.starts_at : campaign.ends_at;
    if (!targetIso) {
      setCountdown(defaultCountdown);
      return;
    }

    const tick = () => {
      const next = calculateCountdown(targetIso);
      setCountdown((previous) =>
        previous.ended === next.ended &&
        previous.hours === next.hours &&
        previous.mins === next.mins &&
        previous.secs === next.secs
          ? previous
          : next,
      );

      if (next.ended && endedRefetchIdRef.current !== campaign.id) {
        endedRefetchIdRef.current = campaign.id;
        void fetchPage(0, true);
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [campaign, fetchPage, isScheduled]);

  const handleLoadMore = useCallback(() => {
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    void fetchPage(currentOffset.current, false);
  }, [fetchPage]);

  const handleRetry = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const countdownLabel = isScheduled
    ? countdown.ended
      ? "Sale starting"
      : "Sale starts in"
    : countdown.ended
      ? "Sale ended"
      : "Sale ends in";

  return (
    <div className="pb-12 sm:pb-16 md:pb-20">
      <div className="relative overflow-hidden bg-accent text-white">
        {campaign?.banner_image ? (
          <>
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${campaign.banner_image})` }}
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-slate-950/70"
            />
          </>
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-br from-accent-dark/30 to-transparent"
          />
        )}

        <div className="page-shell relative flex flex-col items-center gap-8 py-12 sm:py-14 md:flex-row md:items-center md:justify-between md:gap-10 md:py-16">
          <div className="max-w-2xl space-y-3 text-center md:text-left">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/75">
              Limited-time marketplace deals
            </p>
            <h1 className="flex flex-wrap items-center justify-center gap-3 font-display text-3xl font-bold leading-tight md:justify-start sm:text-4xl md:text-5xl lg:text-6xl">
              <Zap
                size={34}
                aria-hidden="true"
                className="shrink-0 sm:h-11 sm:w-11 md:h-12 md:w-12"
                fill="currentColor"
              />
              <span className="min-w-0 text-balance">
                {campaign?.title || "Flash Sale"}
              </span>
            </h1>
            <p className="mx-auto max-w-2xl text-sm text-white/85 sm:text-base md:mx-0 md:text-lg">
              {campaign?.description || DEFAULT_DESCRIPTION}
            </p>
          </div>

          {campaign ? (
            <CountdownTiles countdown={countdown} label={countdownLabel} />
          ) : initialLoading ? (
            <div
              aria-hidden="true"
              className="w-full max-w-sm animate-pulse rounded-2xl border border-white/20 bg-white/10 p-6 sm:min-w-[320px]"
            >
              <div className="mx-auto mb-4 h-3 w-28 rounded-full bg-white/25" />
              <div className="flex justify-center gap-3">
                {[0, 1, 2].map((index) => (
                  <div
                    key={index}
                    className="h-16 w-16 rounded-xl bg-white/20 sm:h-20 sm:w-20"
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="page-shell mt-8 sm:mt-10">
        {initialLoading ? (
          <ProductGridSkeleton count={8} />
        ) : error ? (
          <ErrorPanel message={error} onRetry={handleRetry} />
        ) : !campaign ? (
          <EmptyState
            icon={<Zap size={26} aria-hidden="true" />}
            title="No live flash sale right now"
            message="Admin campaigns will appear here after sellers are approved and the schedule goes live."
          />
        ) : (
          <>
            {products.length === 0 && !loadingMore ? (
              <EmptyState
                icon={<PackageOpen size={26} aria-hidden="true" />}
                title="Campaign ready, product approvals pending"
                message="Approved seller entries will appear here as soon as admin reviews are complete."
              />
            ) : (
              <>
                <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
                      Approved flash sale products
                    </h2>
                    <p className="mt-1.5 text-sm text-slate-500">
                      Seller-submitted offers curated by admin for this
                      campaign.
                    </p>
                  </div>
                  <div className="inline-flex w-fit items-center gap-2 self-start rounded-full bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-primary sm:self-auto">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full bg-primary"
                    />
                    {total > 0 ? total : products.length} products
                  </div>
                </div>

                <div
                  className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5"
                  aria-label="Approved flash sale products"
                >
                  {products.map((product) => (
                    <div key={product.id} className="min-w-0">
                      <ProductCard product={product} />
                    </div>
                  ))}
                </div>

                <div className="mt-10 flex flex-col items-center gap-4">
                  {loadingMore && (
                    <p
                      role="status"
                      className="flex items-center gap-2 text-sm text-slate-500"
                    >
                      <Loader2
                        className="animate-spin"
                        size={16}
                        aria-hidden="true"
                      />
                      Loading more products...
                    </p>
                  )}

                  {loadMoreError && (
                    <div className="flex flex-col items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-6 py-5 sm:px-8">
                      <p className="text-sm font-medium text-rose-600">
                        Couldn&apos;t load more products. Please try again.
                      </p>
                      <button
                        type="button"
                        onClick={handleLoadMore}
                        className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        Try Again
                      </button>
                    </div>
                  )}

                  {hasMore && !loadingMore && !loadMoreError && (
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      className="inline-flex items-center justify-center rounded-full bg-primary px-8 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      Load More Products
                    </button>
                  )}

                  {!hasMore && products.length > 0 && !loadingMore && (
                    <p className="text-xs font-medium text-slate-400">
                      You&apos;ve reached the end of this sale.
                    </p>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default FlashSalePage;
