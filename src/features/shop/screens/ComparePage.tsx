import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@/lib/navigation";
import { ArrowRight, Scale, Star, Trash2, X } from "lucide-react";
import { useCompare } from "@/features/shop/state/CompareContext";
import { formatPrice, cn } from "@/lib/utils";
import type { Product } from "@/types";
import OptimizedImage from "@/features/shared/ui/OptimizedImage";
import { EmptyState } from "@/features/shared/ui/FeedbackState";

type ComparisonRow = {
  label: string;
  render: (product: Product) => ReactNode;
};

const formatRating = (rating: number) =>
  Number.isInteger(rating) ? String(rating) : rating.toFixed(1);

function StockStatus({ product }: { product: Product }) {
  if (product.stock <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-error-soft px-2.5 py-1 text-xs font-bold text-error">
        Out of stock
      </span>
    );
  }

  if (product.stock <= 5) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-bold text-warning">
        Only {product.stock} left
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-bold text-success">
      <span
        className="h-1.5 w-1.5 rounded-full bg-success"
        aria-hidden="true"
      />
      In stock
    </span>
  );
}

const ComparisonRows: ComparisonRow[] = [
  {
    label: "Price",
    render: (product) => (
      <span className="text-base font-bold text-primary">
        {formatPrice(product.price)}
      </span>
    ),
  },
  {
    label: "Original price",
    render: (product) =>
      product.old_price != null && product.old_price > product.price ? (
        <span className="text-slate-400 line-through">
          {formatPrice(product.old_price)}
        </span>
      ) : (
        <span className="text-slate-400">—</span>
      ),
  },
  {
    label: "Rating",
    render: (product) => (
      <span className="inline-flex items-center gap-1.5">
        <Star
          size={14}
          className="text-amber-400"
          fill="currentColor"
          aria-hidden="true"
        />
        <span>
          {product.rating > 0 ? `${formatRating(product.rating)} / 5` : "—"}
        </span>
      </span>
    ),
  },
  {
    label: "Reviews",
    render: (product) =>
      `${product.reviews_count} review${product.reviews_count === 1 ? "" : "s"}`,
  },
  {
    label: "Stock",
    render: (product) => <StockStatus product={product} />,
  },
  {
    label: "Category",
    render: (product) =>
      product.category ? (
        <span className="inline-flex max-w-full truncate rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">
          {product.category}
        </span>
      ) : (
        <span className="text-slate-400">—</span>
      ),
  },
  {
    label: "Seller",
    render: (product) =>
      product.store_name || product.seller_name || "Marketplace seller",
  },
  {
    label: "Variants",
    render: (product) =>
      Array.isArray(product.variant_options) &&
      product.variant_options.length > 0 ? (
        <span className="inline-flex flex-wrap gap-1.5">
          {product.variant_options.map((option) => (
            <span
              key={option.name}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600"
            >
              {option.name}
            </span>
          ))}
        </span>
      ) : (
        <span className="text-slate-400">No variants</span>
      ),
  },
];

const linkClassName =
  "inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

export const ComparePage = () => {
  const { items, removeFromCompare, clearCompare } = useCompare();
  const [pendingClear, setPendingClear] = useState(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    },
    [],
  );

  const handleClear = () => {
    if (pendingClear) {
      setPendingClear(false);
      clearCompare();
      clearTimer.current = null;
      return;
    }
    setPendingClear(true);
    clearTimer.current = setTimeout(() => setPendingClear(false), 3000);
  };

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
        <h1 className="sr-only">Compare products</h1>
        <EmptyState
          icon={<Scale size={30} className="text-primary" />}
          title="Nothing to compare yet"
          description="Add products from the shop or product page, then compare pricing, ratings, variants, and stock side by side."
          actions={
            <Link to="/shop" className={linkClassName}>
              Browse products
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:py-12">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-primary/70">
            Compare products
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Side-by-side buying decisions
            </h1>
            <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
              {items.length} {items.length === 1 ? "product" : "products"}
            </span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500">
            Review core differences in price, ratings, stock, and available
            options before you commit to checkout.
          </p>
        </div>
        <button
          type="button"
          onClick={handleClear}
          className={cn(
            "inline-flex items-center justify-center gap-2 self-start rounded-2xl border px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 md:self-auto",
            pendingClear
              ? "border-rose-600 bg-rose-600 text-white hover:bg-rose-700"
              : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
          )}
        >
          <Trash2 size={18} aria-hidden="true" />
          <span>
            {pendingClear
              ? "Tap again to confirm"
              : `Clear all (${items.length})`}
          </span>
        </button>
      </div>

      <div className="hidden overflow-x-auto rounded-[2rem] border border-slate-200 bg-white shadow-sm md:block">
        <table className="w-full min-w-[680px] border-collapse text-left text-sm">
          <caption className="sr-only">
            Comparison of the selected products
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 w-44 bg-slate-50 p-5 align-bottom text-sm font-bold text-slate-500"
              >
                Product
              </th>
              {items.map((product) => (
                <th
                  key={product.id}
                  scope="col"
                  className="min-w-[11rem] border-l border-slate-200 p-5 align-top font-normal"
                >
                  <div className="relative">
                    <Link
                      to={`/product/${product.slug}`}
                      aria-label={product.name}
                      className="block"
                    >
                      <OptimizedImage
                        src={product.image}
                        alt=""
                        widthHint={360}
                        heightHint={270}
                        fit="limit"
                        className="aspect-[4/3] w-full rounded-2xl bg-slate-100 object-cover"
                      />
                    </Link>
                    <button
                      type="button"
                      onClick={() => removeFromCompare(product.id)}
                      aria-label={`Remove ${product.name} from comparison`}
                      className="absolute right-2 top-2 rounded-full bg-white/90 p-2 text-slate-400 shadow-sm transition hover:bg-white hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </div>
                  <Link
                    to={`/product/${product.slug}`}
                    className="mt-3 block text-base font-bold text-slate-950 transition hover:text-primary"
                  >
                    {product.name}
                  </Link>
                  <div className="mt-2 flex items-center gap-1.5 text-slate-500">
                    <Star
                      size={14}
                      className="text-amber-400"
                      fill="currentColor"
                      aria-hidden="true"
                    />
                    <span>{product.rating > 0 ? product.rating : "—"}</span>
                    <span aria-hidden="true">•</span>
                    <span>{product.reviews_count} reviews</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ComparisonRows.map((row) => (
              <tr key={row.label} className="border-t border-slate-100">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-slate-50 p-5 align-top text-sm font-semibold text-slate-700"
                >
                  {row.label}
                </th>
                {items.map((product) => (
                  <td
                    key={`${product.id}-${row.label}`}
                    className="border-l border-slate-100 p-5 align-top text-slate-600"
                  >
                    {row.render(product)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-slate-50 p-5 align-middle text-sm font-bold text-slate-700"
              >
                Actions
              </th>
              {items.map((product) => (
                <td
                  key={product.id}
                  className="border-l border-slate-200 p-5 align-middle"
                >
                  <Link
                    to={`/product/${product.slug}`}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    View product
                  </Link>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="grid gap-5 md:hidden">
        {items.map((product) => (
          <article
            key={product.id}
            className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm"
          >
            <div className="flex gap-4 p-5">
              <Link
                to={`/product/${product.slug}`}
                aria-label={product.name}
                className="block shrink-0"
              >
                <OptimizedImage
                  src={product.image}
                  alt=""
                  widthHint={160}
                  heightHint={160}
                  fit="limit"
                  className="h-24 w-24 rounded-2xl bg-slate-100 object-cover sm:h-28 sm:w-28"
                />
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/product/${product.slug}`} className="block">
                    <h2 className="line-clamp-2 text-base font-bold leading-snug text-slate-950 transition hover:text-primary">
                      {product.name}
                    </h2>
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeFromCompare(product.id)}
                    aria-label={`Remove ${product.name} from comparison`}
                    className="-mr-1 -mt-1 shrink-0 rounded-full p-2.5 text-slate-400 transition hover:bg-rose-50 hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-500">
                  <Star
                    size={14}
                    className="text-amber-400"
                    fill="currentColor"
                    aria-hidden="true"
                  />
                  <span>{product.rating > 0 ? product.rating : "—"}</span>
                  <span aria-hidden="true">•</span>
                  <span>{product.reviews_count} reviews</span>
                </div>
              </div>
            </div>
            <dl className="border-t border-slate-100 px-5 py-1">
              {ComparisonRows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-4 border-b border-slate-50 py-2.5 last:border-b-0"
                >
                  <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {row.label}
                  </dt>
                  <dd className="text-right text-sm text-slate-700">
                    {row.render(product)}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="border-t border-slate-100 p-5">
              <Link
                to={`/product/${product.slug}`}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                View product
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </article>
        ))}
      </div>

      <div className="flex flex-col items-center justify-between gap-4 rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-sm sm:flex-row sm:text-left">
        <p className="text-sm leading-6 text-slate-500">
          Still weighing options? You can add or remove products from any shop
          or product page.
        </p>
        <Link
          to="/shop"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Continue comparing
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
};
