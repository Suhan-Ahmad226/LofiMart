'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link } from '../../../lib/navigation';
import {
  ArrowRight,
  Baby,
  Bike,
  ChevronDown,
  ChevronRight,
  Home,
  Laptop,
  Palette,
  Search,
  ShoppingBag,
  Sparkles,
  Tag,
  Utensils,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { AnimatedIcon } from '@/features/shared/ui/AnimatedIcon';
import { Skeleton } from '@/features/shared/ui/Skeleton';
import { cn } from '../../../lib/utils';
import type { CategoriesPageData, Category } from './CategoriesPage.data';

const fallbackCategories: Category[] = [
  { id: 'fashion', name: 'Fashion', subcategories: [{ id: 'fashion-women', name: 'Women' }, { id: 'fashion-men', name: 'Men' }] },
  { id: 'electronics', name: 'Electronics', subcategories: [{ id: 'electronics-mobile', name: 'Mobiles' }, { id: 'electronics-audio', name: 'Audio' }] },
  { id: 'groceries', name: 'Groceries', subcategories: [{ id: 'groceries-fresh', name: 'Fresh foods' }, { id: 'groceries-pantry', name: 'Pantry' }] },
  { id: 'home', name: 'Home & Living', subcategories: [{ id: 'home-decor', name: 'Decor' }, { id: 'home-kitchen', name: 'Kitchen' }] },
  { id: 'beauty', name: 'Beauty', subcategories: [{ id: 'beauty-skincare', name: 'Skincare' }, { id: 'beauty-makeup', name: 'Makeup' }] },
  { id: 'baby', name: 'Baby Care', subcategories: [{ id: 'baby-feeding', name: 'Feeding' }, { id: 'baby-essentials', name: 'Essentials' }] },
  { id: 'sports', name: 'Sports', subcategories: [{ id: 'sports-fitness', name: 'Fitness' }, { id: 'sports-outdoor', name: 'Outdoor' }] },
  { id: 'art', name: 'Art & Crafts', subcategories: [{ id: 'art-painting', name: 'Painting' }, { id: 'art-diy', name: 'DIY' }] },
];

const categoryStyles = [
  { icon: <ShoppingBag size={26} strokeWidth={2.1} />, color: 'from-sky-500/20 to-cyan-500/10 text-sky-700' },
  { icon: <Laptop size={26} strokeWidth={2.1} />, color: 'from-violet-500/20 to-fuchsia-500/10 text-violet-700' },
  { icon: <Utensils size={26} strokeWidth={2.1} />, color: 'from-emerald-500/20 to-lime-500/10 text-emerald-700' },
  { icon: <Home size={26} strokeWidth={2.1} />, color: 'from-orange-500/20 to-amber-500/10 text-orange-700' },
  { icon: <Sparkles size={26} strokeWidth={2.1} />, color: 'from-pink-500/20 to-rose-500/10 text-pink-700' },
  { icon: <Baby size={26} strokeWidth={2.1} />, color: 'from-cyan-500/20 to-sky-500/10 text-cyan-700' },
  { icon: <Bike size={26} strokeWidth={2.1} />, color: 'from-red-500/20 to-orange-500/10 text-red-700' },
  { icon: <Palette size={26} strokeWidth={2.1} />, color: 'from-indigo-500/20 to-blue-500/10 text-indigo-700' },
];

function getCategoryStyle(index: number) {
  return categoryStyles[index % categoryStyles.length];
}

function CategoriesSkeleton() {
  return (
    <div className="space-y-10">
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Skeleton className="h-[360px] w-full rounded-[2rem]" />
        <Skeleton className="h-[360px] w-full rounded-[2rem]" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-14 w-full rounded-2xl" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-sm">
            <Skeleton className="h-14 w-14 rounded-2xl" />
            <div className="mt-5 space-y-3">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-10 w-32 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const CategoriesPage = ({ initialData }: { initialData?: CategoriesPageData }) => {
  const hasInitialCategories = !!(initialData && initialData.categories.length > 0);
  const [categories, setCategories] = useState<Category[]>(hasInitialCategories ? (initialData?.categories ?? fallbackCategories) : fallbackCategories);
  const [products, setProducts] = useState<CategoriesPageData['products']>(initialData?.products ?? []);
  const [loading, setLoading] = useState(!hasInitialCategories);
  const [error, setError] = useState('');
  const [usingFallback, setUsingFallback] = useState(false);
  const [query, setQuery] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<string | number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (hasInitialCategories) return;
    let active = true;

    const loadData = async () => {
      try {
        const [categoriesRes, productsRes] = await Promise.all([
          fetch('/api/categories/tree'),
          fetch('/api/products'),
        ]);

        const categoriesData = categoriesRes.ok ? await categoriesRes.json() : fallbackCategories;
        const productsData = productsRes.ok ? await productsRes.json() : [];

        if (!active) return;

        const hasLiveCategories = Array.isArray(categoriesData) && categoriesData.length > 0;
        setCategories(hasLiveCategories ? categoriesData : fallbackCategories);
        setProducts(Array.isArray(productsData) ? productsData : []);
        setUsingFallback(!hasLiveCategories || !categoriesRes.ok);
      } catch (fetchError: unknown) {
        if (!active) return;
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to load categories right now.');
        setCategories(fallbackCategories);
        setProducts([]);
        setUsingFallback(true);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [hasInitialCategories, reloadKey]);

  const reload = () => {
    setError('');
    setUsingFallback(false);
    setLoading(true);
    setReloadKey((key) => key + 1);
  };

  const decoratedCategories = useMemo(() => {
    return categories.map((category, index) => {
      const style = getCategoryStyle(index);
      const categoryCount = products.filter(
        (product) => product.category?.trim().toLowerCase() === category.name.trim().toLowerCase(),
      ).length;

      return {
        ...category,
        style,
        count: categoryCount,
        subcategoryCount: category.subcategories?.length ?? 0,
      };
    });
  }, [categories, products]);

  const filteredCategories = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return decoratedCategories;
    }

    return decoratedCategories.filter((category) => {
      const matchesCategory = category.name.toLowerCase().includes(term);
      const matchesSubcategory = category.subcategories?.some((subcategory) =>
        `${subcategory.name} ${(subcategory.subsubcategories || []).map((item) => item.name).join(' ')}`.toLowerCase().includes(term),
      );
      return matchesCategory || matchesSubcategory;
    });
  }, [decoratedCategories, query]);

  const featuredCategories = filteredCategories.slice(0, 4);
  const totalSubcategories = decoratedCategories.reduce((sum, category) => sum + (category.subcategories?.length ?? 0), 0);
  const totalItems = decoratedCategories.reduce((sum, category) => sum + category.count, 0);
  const isSearchTerm = query.trim().length > 0;

  return (
    <div className="bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_42%,#f8fafc_100%)]">
      <div className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-14">
        {loading ? (
          <CategoriesSkeleton />
        ) : (
          <div className="space-y-10">
            <section className="grid gap-6 overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-xl shadow-slate-200/45 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="space-y-6 p-6 sm:p-8">
                <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                  <Tag size={14} />
                  Browse smarter
                </div>
                <div className="space-y-4">
                  <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl font-display">
                    Explore categories built for faster product discovery
                  </h1>
                  <p className="max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                    Jump into the collection that fits your intent, compare related subcategories, and move into shopping with less friction across mobile and desktop.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-2xl font-bold text-slate-950">{decoratedCategories.length}+</p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">Main categories</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-2xl font-bold text-slate-950">{totalSubcategories}+</p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">Subcategories</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-2xl font-bold text-slate-950">{totalItems || 'Many'}</p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">Products mapped</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 p-6 sm:p-8 lg:border-l lg:border-t-0">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Featured category picks</p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {featuredCategories.map((category) => (
                    <Link
                      key={category.id}
                      to={`/shop?category=${encodeURIComponent(category.name)}`}
                      className="group rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-1 hover:bg-white hover:shadow-lg"
                    >
                      <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${category.style.color} ring-1 ring-black/5`}>
                        <AnimatedIcon loop="float" glow className="text-current">
                          {category.style.icon}
                        </AnimatedIcon>
                      </span>
                      <h2 className="mt-4 text-lg font-bold text-slate-950">{category.name}</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {category.count > 0 ? `${category.count}+ products` : `${category.subcategoryCount}+ curated segments`}
                      </p>
                      <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary transition group-hover:gap-3">
                        Explore now
                        <ArrowRight size={15} />
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-4 rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-sm md:grid-cols-[1fr_auto] md:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="search"
                  aria-label="Search product categories"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search categories, subcategories, or product spaces"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  to="/shop"
                  className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Shop all
                  <ArrowRight size={15} />
                </Link>
                <Link
                  to="/search"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Global search
                  <ChevronRight size={15} />
                </Link>
              </div>
            </section>

            {error && (
              <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
                <p>{error} Showing the latest available category structure instead.</p>
                <button
                  type="button"
                  onClick={reload}
                  className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-200"
                >
                  Try again
                </button>
              </div>
            )}
            {!error && usingFallback && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Live category data is syncing. Showing the current browsing structure for now.
              </div>
            )}

            {filteredCategories.length === 0 ? (
              <section className="rounded-[2rem] border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
                <div className="mx-auto max-w-lg space-y-3">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                    <Search size={24} />
                  </div>
                  {isSearchTerm ? (
                    <>
                      <h2 className="text-2xl font-bold text-slate-950">No categories matched your search</h2>
                      <p className="text-sm leading-7 text-slate-500">
                        Try a simpler keyword or browse all categories again to continue exploring.
                      </p>
                      <button
                        type="button"
                        onClick={() => setQuery('')}
                        className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                      >
                        Reset search
                        <ArrowRight size={16} />
                      </button>
                    </>
                  ) : (
                    <>
                      <h2 className="text-2xl font-bold text-slate-950">No categories available right now</h2>
                      <p className="text-sm leading-7 text-slate-500">
                        We couldn't load the category structure. Check your connection or try again.
                      </p>
                      <button
                        type="button"
                        onClick={reload}
                        className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                      >
                        Try again
                        <ArrowRight size={16} />
                      </button>
                    </>
                  )}
                </div>
              </section>
            ) : (
              <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                {filteredCategories.map((category, index) => {
                  const expanded = expandedCategory === category.id;

                  return (
                    <motion.article
                      key={category.id}
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.04 }}
                      className="overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/55"
                    >
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <span className={`inline-flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-gradient-to-br ${category.style.color} ring-1 ring-black/5`}>
                            <AnimatedIcon loop="float" glow className="text-current">
                              {category.style.icon}
                            </AnimatedIcon>
                          </span>
                          <button
                            type="button"
                            onClick={() => setExpandedCategory(expanded ? null : category.id)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                            aria-expanded={expanded}
                            aria-controls={`category-${category.id}-panel`}
                            aria-label={expanded ? `Collapse ${category.name}` : `Expand ${category.name}`}
                          >
                            <ChevronDown
                              size={18}
                              className={cn('transition-transform duration-300', expanded && 'rotate-180')}
                            />
                          </button>
                        </div>

                        <div className="mt-5 space-y-2">
                          <h2 className="text-xl font-bold text-slate-950">{category.name}</h2>
                          <p className="text-sm text-slate-500">
                            {category.count > 0
                              ? `${category.count}+ products currently mapped`
                              : `${category.subcategoryCount} curated subcategories to explore`}
                          </p>
                        </div>

                        <div className="mt-5 flex items-center justify-between gap-3">
                          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                            <Tag size={12} />
                            {category.subcategoryCount} sections
                          </span>
                          <Link
                            to={`/shop?category=${encodeURIComponent(category.name)}`}
                            className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition hover:gap-3"
                          >
                            Shop now
                            <ArrowRight size={15} />
                          </Link>
                        </div>
                      </div>

                      {expanded && (
                        <div id={`category-${category.id}-panel`} className="border-t border-slate-100 bg-slate-50 px-5 py-4">
                          {category.subcategories && category.subcategories.length > 0 ? (
                            <div className="space-y-3">
                              {category.subcategories.slice(0, 6).map((subcategory) => (
                                <div key={subcategory.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-900">{subcategory.name}</p>
                                      {subcategory.subsubcategories && subcategory.subsubcategories.length > 0 && (
                                        <p className="mt-1 text-xs leading-5 text-slate-500">
                                          {subcategory.subsubcategories.slice(0, 3).map((item) => item.name).join(', ')}
                                          {subcategory.subsubcategories.length > 3 ? '...' : ''}
                                        </p>
                                      )}
                                    </div>
                                    <Link
                                      to={`/shop?category=${encodeURIComponent(category.name)}`}
                                      className="shrink-0 text-xs font-semibold text-primary hover:underline"
                                    >
                                      View
                                    </Link>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm leading-6 text-slate-500">
                              This category is ready to shop directly even without nested subcategories.
                            </p>
                          )}
                        </div>
                      )}
                    </motion.article>
                  );
                })}
              </section>
            )}

            <section className="grid gap-6 rounded-[2rem] border border-slate-200/80 bg-slate-950 p-6 text-white shadow-xl shadow-slate-300/20 md:grid-cols-[1fr_auto] md:items-center md:p-8">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">Need help choosing?</p>
                <h2 className="text-3xl font-bold font-display">Move from category browsing to confident shopping faster</h2>
                <p className="max-w-2xl text-sm leading-7 text-slate-300">
                  If you already know what you want, jump into search or contact support for a quicker route to the right product.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
                <Link
                  to="/search"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
                >
                  Search products
                  <ArrowRight size={16} />
                </Link>
                <Link
                  to="/contact"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Contact support
                  <ChevronRight size={16} />
                </Link>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default CategoriesPage;
