import React from 'react';
import { Link } from '@/src/lib/navigation';
import { ArrowRight, Scale, Star, Trash2, X } from 'lucide-react';
import { useCompare } from '@/src/context/CompareContext';
import { formatPrice } from '@/src/lib/utils';

export const ComparePage = () => {
  const { items, removeFromCompare, clearCompare } = useCompare();

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-20 text-center">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-10 shadow-sm">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.5rem] bg-primary/10 text-primary">
            <Scale size={34} />
          </div>
          <h1 className="mt-6 text-3xl font-bold text-slate-950">No products selected for comparison</h1>
          <p className="mt-3 text-sm leading-7 text-slate-500">
            Add products from the shop or product page, then compare pricing, ratings, variants, and stock side by side.
          </p>
          <Link
            to="/shop"
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Browse products
            <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    );
  }

  const comparisonRows = [
    { label: 'Price', render: (product: any) => formatPrice(product.price) },
    { label: 'Original price', render: (product: any) => (product.old_price > product.price ? formatPrice(product.old_price) : '—') },
    { label: 'Rating', render: (product: any) => `${product.rating} / 5` },
    { label: 'Reviews', render: (product: any) => `${product.reviews_count}` },
    { label: 'Stock', render: (product: any) => `${product.stock}` },
    { label: 'Category', render: (product: any) => product.category || '—' },
    { label: 'Seller', render: (product: any) => product.seller_name || 'Marketplace seller' },
    {
      label: 'Variants',
      render: (product: any) =>
        Array.isArray(product.variant_options) && product.variant_options.length > 0
          ? product.variant_options.map((option: any) => option.name).join(', ')
          : 'No variants',
    },
  ];
  const getProductImageSrc = (product: any) => product.image || '/icon.svg';

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-primary/70">Compare products</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">Side-by-side buying decisions</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500">
            Review core differences in price, ratings, stock, and available options before you commit to checkout.
          </p>
        </div>
        <button
          onClick={clearCompare}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
        >
          <Trash2 size={18} />
          <span>Clear compare list</span>
        </button>
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="grid border-b border-slate-200" style={{ gridTemplateColumns: `220px repeat(${items.length}, minmax(220px, 1fr))` }}>
          <div className="bg-slate-50 p-5 text-sm font-bold text-slate-500">Overview</div>
          {items.map((product) => (
            <div key={product.id} className="border-l border-slate-200 p-5">
              <div className="flex items-start justify-between gap-3">
                <Link to={`/product/${product.slug}`} className="block">
                  <img
                    src={getProductImageSrc(product)}
                    alt={product.name}
                    className="h-32 w-full rounded-2xl bg-slate-100 object-cover"
                    referrerPolicy="no-referrer"
                  />
                </Link>
                <button
                  onClick={() => removeFromCompare(product.id)}
                  className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600"
                >
                  <X size={16} />
                </button>
              </div>
              <Link to={`/product/${product.slug}`} className="mt-4 block text-lg font-bold text-slate-950 transition hover:text-primary">
                {product.name}
              </Link>
              <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                <Star size={14} className="text-amber-400" fill="currentColor" />
                <span>{product.rating}</span>
                <span>•</span>
                <span>{product.reviews_count} reviews</span>
              </div>
            </div>
          ))}
        </div>

        {comparisonRows.map((row) => (
          <div
            key={row.label}
            className="grid border-b border-slate-100 last:border-b-0"
            style={{ gridTemplateColumns: `220px repeat(${items.length}, minmax(220px, 1fr))` }}
          >
            <div className="bg-slate-50/80 p-5 text-sm font-semibold text-slate-700">{row.label}</div>
            {items.map((product) => (
              <div key={`${product.id}-${row.label}`} className="border-l border-slate-100 p-5 text-sm text-slate-600">
                {row.render(product)}
              </div>
            ))}
          </div>
        ))}

        <div className="grid" style={{ gridTemplateColumns: `220px repeat(${items.length}, minmax(220px, 1fr))` }}>
          <div className="bg-slate-50/80 p-5 text-sm font-semibold text-slate-700">Actions</div>
          {items.map((product) => (
            <div key={`${product.id}-actions`} className="border-l border-slate-100 p-5">
              <div className="flex flex-col gap-3">
                <Link
                  to={`/product/${product.slug}`}
                  className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  View product
                </Link>
                <Link
                  to="/shop"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Continue comparing
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
