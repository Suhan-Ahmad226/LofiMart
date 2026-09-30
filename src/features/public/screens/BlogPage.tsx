'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  Search,
  Sparkles,
  Tag,
  User,
} from 'lucide-react';
import { Link } from '../../../lib/navigation';
import { Skeleton } from '@/features/shared/ui/Skeleton';
import {
  decorateBlogPost,
  formatBlogDate,
  getBlogExcerpt,
  type BlogPost,
  type DecoratedBlogPost,
} from '../../../lib/blog';

function BlogPageSkeleton() {
  return (
    <div className="space-y-10">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Skeleton className="h-[420px] w-full rounded-[2rem]" />
        <div className="space-y-5">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-12 w-48 rounded-2xl" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-14 w-full rounded-2xl" />
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-sm">
            <Skeleton className="h-52 w-full rounded-[1.25rem]" />
            <div className="mt-5 space-y-3">
              <Skeleton className="h-4 w-28 rounded-full" />
              <Skeleton className="h-6 w-4/5" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-10 w-36 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const BlogPage = () => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [usingFallback, setUsingFallback] = useState(false);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  useEffect(() => {
    let active = true;

    const loadPosts = async () => {
      try {
        const response = await fetch('/api/blog');
        if (!response.ok) {
          throw new Error('Unable to load blog posts');
        }

        const data = (await response.json()) as BlogPost[];
        if (!active) return;

        if (Array.isArray(data) && data.length > 0) {
          setPosts(data);
          setUsingFallback(false);
        } else {
          setPosts([]);
          setUsingFallback(true);
        }
      } catch (fetchError: any) {
        if (!active) return;
        setError(fetchError?.message || 'Unable to load blog posts right now.');
        setPosts([]);
        setUsingFallback(true);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadPosts();

    return () => {
      active = false;
    };
  }, []);

  const decoratedPosts = useMemo<DecoratedBlogPost[]>(
    () => posts.map((post) => decorateBlogPost(post)),
    [posts],
  );

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(decoratedPosts.map((post) => post.category)))],
    [decoratedPosts],
  );

  const filteredPosts = useMemo(() => {
    return decoratedPosts.filter((post) => {
      const matchesCategory = activeCategory === 'All' || post.category === activeCategory;
      const source = `${post.title} ${post.content} ${post.author_name ?? ''}`.toLowerCase();
      const matchesQuery = !query.trim() || source.includes(query.trim().toLowerCase());
      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, decoratedPosts, query]);

  const featuredPost = filteredPosts[0] ?? decoratedPosts[0] ?? null;
  const visiblePosts = featuredPost
    ? filteredPosts.length > 1
      ? filteredPosts.filter((post) => post.id !== featuredPost.id)
      : [featuredPost]
    : [];

  return (
    <div className="bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_38%,#f8fafc_100%)]">
      <div className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-14">
        {loading ? (
          <BlogPageSkeleton />
        ) : (
          <div className="space-y-10">
            {featuredPost ? (
            <section className="grid items-stretch gap-6 overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-xl shadow-slate-200/40 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="relative min-h-[320px] overflow-hidden">
                {featuredPost.image ? (
                  <img
                    src={featuredPost.image}
                    alt={featuredPost.title}
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#dbeafe_0%,#eef2ff_48%,#f8fafc_100%)]">
                    <div className="space-y-3 text-center">
                      <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm">
                        <BookOpen size={24} />
                      </div>
                      <p className="text-sm font-semibold text-slate-700">Editorial cover image not available</p>
                    </div>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-tr from-slate-950/70 via-slate-900/35 to-transparent" />
                <div className="absolute left-6 top-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white backdrop-blur-sm">
                  <Sparkles size={14} />
                  Editorial Picks
                </div>
              </div>

              <div className="flex flex-col justify-between p-6 sm:p-8">
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-500">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                      <Tag size={14} />
                      {featuredPost.category}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={14} />
                      {formatBlogDate(featuredPost.created_at)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <User size={14} />
                      {featuredPost.author_name || 'LofiMart Team'}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl font-display">
                      Marketplace stories, product thinking, and growth insights
                    </h1>
                    <p className="max-w-2xl text-base leading-7 text-slate-600">
                      Discover practical ideas for smarter commerce, better product discovery, stronger seller growth, and a smoother shopping experience across LofiMart.
                    </p>
                  </div>

                  <article className="space-y-3 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Featured article</p>
                    <h2 className="text-2xl font-bold text-slate-950">{featuredPost.title}</h2>
                    <p className="text-sm leading-7 text-slate-600">{getBlogExcerpt(featuredPost.content, 220)}</p>
                    <Link
                      to={`/blog/${featuredPost.slug || featuredPost.id}`}
                      className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      Read article
                      <ArrowRight size={17} />
                    </Link>
                  </article>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-2xl font-bold text-slate-950">{decoratedPosts.length}+</p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">Active articles</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-2xl font-bold text-slate-950">{categories.length - 1}+</p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">Editorial themes</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-2xl font-bold text-slate-950">Weekly</p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">Fresh publishing</p>
                  </div>
                </div>
              </div>
            </section>
            ) : null}

            <section className="grid gap-4 rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-sm md:grid-cols-[1fr_auto] md:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search articles, topics, or authors"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setActiveCategory(category)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      activeCategory === category
                        ? 'bg-slate-950 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </section>

            {error && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {error} Showing the latest fallback editorial content instead.
              </div>
            )}
            {!error && usingFallback && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Blog posts are still syncing. Published editorial content will appear here once the first articles go live.
              </div>
            )}

            {filteredPosts.length === 0 ? (
              <section className="rounded-[2rem] border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
                <div className="mx-auto max-w-lg space-y-3">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                    <BookOpen size={24} />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-950">
                    {query || activeCategory !== 'All' ? 'No matching articles found' : 'No published articles yet'}
                  </h2>
                  <p className="text-sm leading-7 text-slate-500">
                    {query || activeCategory !== 'All'
                      ? 'Try a broader keyword or switch categories to continue exploring the blog.'
                      : 'Your published marketplace stories, guides, and editorial articles will appear here once the blog goes live.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setActiveCategory('All');
                    }}
                    className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Reset filters
                    <ArrowRight size={17} />
                  </button>
                </div>
              </section>
            ) : (
              <section className="grid gap-6 xl:grid-cols-[1fr_320px]">
                <div className="grid gap-6 md:grid-cols-2">
                  {visiblePosts.map((post, idx) => (
                    <motion.article
                      key={String(post.id)}
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="group flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/60"
                    >
                      <div className="aspect-[16/10] overflow-hidden bg-slate-100">
                        {post.image ? (
                          <img
                            src={post.image}
                            alt={post.title}
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#f1f5f9_0%,#e2e8f0_100%)]">
                            <BookOpen className="h-8 w-8 text-slate-400" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col p-5">
                        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs font-medium text-slate-500">
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-primary">
                            <Tag size={13} />
                            {post.category}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Calendar size={13} />
                            {formatBlogDate(post.created_at)}
                          </span>
                        </div>

                        <h2 className="text-xl font-bold leading-snug text-slate-950 transition-colors group-hover:text-primary">
                          {post.title}
                        </h2>
                        <p className="mt-3 flex-1 text-sm leading-7 text-slate-600">{post.excerpt}</p>

                        <div className="mt-6 flex items-center justify-between gap-4 border-t border-slate-100 pt-5">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{post.author_name || 'LofiMart Team'}</p>
                            <p className="text-xs text-slate-500">{post.minutes} min read</p>
                          </div>
                          <Link
                            to={`/blog/${post.slug || post.id}`}
                            className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-primary transition hover:bg-primary/5"
                          >
                            Read now
                            <ArrowRight size={16} />
                          </Link>
                        </div>
                      </div>
                    </motion.article>
                  ))}
                </div>

                <aside className="space-y-6">
                  <div className="rounded-[1.75rem] border border-slate-200/80 bg-white p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Why read this</p>
                    <h3 className="mt-3 text-2xl font-bold text-slate-950">Built for shoppers, sellers, and growth teams</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      Our blog focuses on marketplace trust, smarter selling, customer experience, and how modern commerce tools improve conversion without feeling gimmicky.
                    </p>
                    <div className="mt-5 space-y-3">
                      {['Commerce strategy', 'Seller growth', 'Product discovery', 'Customer trust'].map((item) => (
                        <div key={item} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Sparkles size={16} />
                          </span>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[1.75rem] border border-slate-200/80 bg-slate-950 p-6 text-white shadow-lg">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">Keep reading</p>
                    <h3 className="mt-3 text-2xl font-bold">Explore more across LofiMart</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-300">
                      Move from ideas to action with our product discovery, marketplace categories, and AI-driven shopping experiences.
                    </p>
                    <div className="mt-5 flex flex-col gap-3">
                      <Link to="/shop" className="inline-flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100">
                        Browse products
                        <ArrowRight size={16} />
                      </Link>
                    </div>
                  </div>
                </aside>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BlogPage;
