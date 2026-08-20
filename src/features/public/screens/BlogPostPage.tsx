'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Calendar, Loader2, Tag, User } from 'lucide-react';
import { Link, useParams } from '../../../lib/navigation';
import { Skeleton } from '@/features/shared/ui/Skeleton';
import { decorateBlogPost, formatBlogDate, type BlogPost, type DecoratedBlogPost } from '../../../lib/blog';

function BlogPostSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-6 w-32 rounded-full" />
      <Skeleton className="h-[360px] w-full rounded-[2rem]" />
      <div className="space-y-4">
        <Skeleton className="h-5 w-40 rounded-full" />
        <Skeleton className="h-12 w-full max-w-3xl" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-11/12" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-5 w-full" />
        ))}
      </div>
    </div>
  );
}

export const BlogPostPage = () => {
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const [post, setPost] = useState<DecoratedBlogPost | null>(null);
  const [relatedPosts, setRelatedPosts] = useState<DecoratedBlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const loadPost = async () => {
      try {
        const [postResponse, listResponse] = await Promise.all([
          fetch(`/api/blog/${slug}`),
          fetch('/api/blog'),
        ]);

        const listData = listResponse.ok ? ((await listResponse.json()) as BlogPost[]) : [];
        const normalizedList = (Array.isArray(listData) ? listData : []).map((item) =>
          decorateBlogPost(item),
        );

        let resolvedPost: DecoratedBlogPost | null = null;

        if (postResponse.ok) {
          const data = (await postResponse.json()) as BlogPost;
          resolvedPost = decorateBlogPost(data);
        }

        if (!active) return;

        if (!resolvedPost) {
          setError('Article not found.');
          setPost(null);
          setRelatedPosts(normalizedList.slice(0, 3));
          return;
        }

        setPost(resolvedPost);
        setRelatedPosts(
          normalizedList
            .filter((item) => String(item.slug || item.id) !== String(resolvedPost?.slug || resolvedPost?.id))
            .slice(0, 3),
        );
      } catch (fetchError: any) {
        if (!active) return;
        setError(fetchError?.message || 'Unable to load this article right now.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    if (slug) {
      void loadPost();
    }

    return () => {
      active = false;
    };
  }, [slug]);

  const paragraphs = useMemo(() => post?.content.split(/\n+/).filter(Boolean) ?? [], [post]);

  return (
    <div className="bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_38%,#f8fafc_100%)]">
      <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14">
        {loading ? (
          <BlogPostSkeleton />
        ) : !post ? (
          <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
            <div className="mx-auto max-w-lg space-y-4">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                <BookOpen size={24} />
              </div>
              <h1 className="text-3xl font-bold text-slate-950">Article unavailable</h1>
              <p className="text-sm leading-7 text-slate-500">{error || 'This article could not be found.'}</p>
              <Link
                to="/blog"
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Back to blog
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <Link to="/blog" className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">
              <ArrowLeft size={16} />
              Back to blog
            </Link>

            <div className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-xl shadow-slate-200/40">
              <div className="relative aspect-[16/7] overflow-hidden bg-slate-100">
                {post.image ? (
                  <img
                    src={post.image}
                    alt={post.title}
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#dbeafe_0%,#eef2ff_48%,#f8fafc_100%)]">
                    <BookOpen className="h-10 w-10 text-slate-400" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
                  <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-white/85">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-white">
                      <Tag size={13} />
                      {post.category}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={13} />
                      {formatBlogDate(post.created_at)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <User size={13} />
                      {post.author_name || 'LofiMart Team'}
                    </span>
                  </div>
                  <h1 className="mt-4 max-w-4xl text-3xl font-bold leading-tight sm:text-4xl">{post.title}</h1>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-white/80">
                    {post.minutes} min read
                  </p>
                </div>
              </div>

              <div className="grid gap-8 p-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:p-8">
                <article className="min-w-0 space-y-5 text-[15px] leading-8 text-slate-700">
                  {paragraphs.map((paragraph, index) => (
                    <p key={`${post.id}-${index}`}>{paragraph}</p>
                  ))}
                </article>

                <aside className="space-y-5">
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Article summary</p>
                    <p className="mt-3 text-sm leading-7 text-slate-600">{post.excerpt}</p>
                  </div>

                  <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Continue exploring</p>
                    <div className="mt-4 flex flex-col gap-3">
                      <Link to="/shop" className="inline-flex items-center justify-between rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
                        Browse products
                        <ArrowRight size={16} />
                      </Link>
                      <Link to="/ai-features" className="inline-flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                        Explore AI features
                        <ArrowRight size={16} />
                      </Link>
                    </div>
                  </div>
                </aside>
              </div>
            </div>

            {relatedPosts.length > 0 && (
              <section className="space-y-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Related reads</p>
                  <h2 className="mt-2 text-2xl font-bold text-slate-950">More from the blog</h2>
                </div>
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {relatedPosts.map((item) => (
                    <article key={String(item.id)} className="overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                      <div className="aspect-[16/10] overflow-hidden bg-slate-100">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.title}
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#f1f5f9_0%,#e2e8f0_100%)]">
                            <BookOpen className="h-8 w-8 text-slate-400" />
                          </div>
                        )}
                      </div>
                      <div className="space-y-3 p-5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                          <Tag size={12} />
                          {item.category}
                        </span>
                        <h3 className="text-lg font-bold text-slate-950">{item.title}</h3>
                        <p className="text-sm leading-7 text-slate-600">{item.excerpt}</p>
                        <Link to={`/blog/${item.slug || item.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition hover:gap-3">
                          Read article
                          <ArrowRight size={15} />
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BlogPostPage;
