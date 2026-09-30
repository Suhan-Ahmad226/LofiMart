'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  ArrowRight,
  Clock3,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Search,
  Share2,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Link } from '../../../lib/navigation';
import { Skeleton } from '@/features/shared/ui/Skeleton';
import { useUser } from '../../../features/shared/state/UserContext';
import { getCachedClientValue } from '../../../lib/client-cache';
import toast from '@/lib/toast';
const SocialShare = dynamic(
  () => import('@/features/shared/components/SocialShare').then((module) => module.SocialShare),
  {
    ssr: false,
    loading: () => <div className="h-10 w-full animate-pulse rounded-2xl bg-slate-100" />,
  },
);
const CloudinaryUpload = dynamic(() => import('@/features/shared/media/CloudinaryUpload'), {
  ssr: false,
  loading: () => <div className="h-28 animate-pulse rounded-[1.5rem] bg-slate-100" />,
});

type FeedTab = 'All' | 'Trending' | 'Reviews' | 'Reseller Picks';

type FeedItem = {
  id: string | number;
  user: {
    id?: string | null;
    name: string;
    avatar: string;
    role: string;
    badge: string;
    storefront_slug?: string | null;
    reseller_code?: string | null;
  };
  image: string;
  caption: string;
  likes: number;
  comments: number;
  saves: number;
  tab: FeedTab;
  topic: string;
  created_at: string;
  product: {
    name: string;
    price: string;
    category: string;
    slug: string;
  };
  liked_by_me?: boolean;
  title?: string;
  status?: string;
};

type CommunityTopic = {
  label: string;
  note: string;
};

type CommunityContributor = {
  id?: string;
  name: string;
  role: string;
  stat: string;
  storefront_slug?: string | null;
  reseller_code?: string | null;
  reseller_role?: boolean;
};

type CommunityStats = {
  weekly_interactions: number;
  average_rating: number;
  fresh_updates_label: string;
  verified_partners?: number;
};

type CommunityFeedResponse = {
  items?: FeedItem[];
  trending_topics?: CommunityTopic[];
  top_contributors?: CommunityContributor[];
  stats?: CommunityStats;
};

type CommunityComment = {
  id: string;
  content: string;
  status: string;
  created_at: string;
  user: {
    id?: string | null;
    name: string;
    avatar: string;
    role: string;
  };
};

type ReportDraft = {
  postId: string | number;
  reason: string;
  details: string;
};

const feedTabs: FeedTab[] = ['All', 'Trending', 'Reviews', 'Reseller Picks'];

const fallbackFeedItems: FeedItem[] = [];

const fallbackTopics: CommunityTopic[] = [];

const fallbackContributors: CommunityContributor[] = [];

const fallbackStats: CommunityStats = {
  weekly_interactions: 12048,
  average_rating: 4.8,
  fresh_updates_label: 'Daily',
  verified_partners: 500,
};

const trustSignals = [
  {
    icon: <ShieldCheck size={18} />,
    title: 'Social proof that feels trustworthy',
    body: 'Real photos, honest reviews, and visible community engagement help people decide with confidence.',
  },
  {
    icon: <Store size={18} />,
    title: 'Discovery beyond standard browsing',
    body: 'Buyers find products through stories, creator picks, and reseller recommendations that feel relevant.',
  },
  {
    icon: <Clock3 size={18} />,
    title: 'Shorter path to checkout',
    body: 'Useful context and product proof reduce hesitation, especially for fashion, beauty, and home purchases.',
  },
];

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatRelativeTime(value: string) {
  const target = new Date(value);
  const diffMs = target.getTime() - Date.now();
  const absMinutes = Math.round(Math.abs(diffMs) / 60000);

  if (absMinutes < 1) return 'just now';
  if (absMinutes < 60) return `${absMinutes}m ago`;
  if (absMinutes < 1440) return `${Math.round(absMinutes / 60)}h ago`;
  return `${Math.round(absMinutes / 1440)}d ago`;
}

function normalizeFeedItem(item: FeedItem): FeedItem {
  return {
    ...item,
    user: {
      ...item.user,
      avatar: item.user.avatar || item.user.name.charAt(0).toUpperCase() || 'A',
    },
    product: {
      ...item.product,
      price: item.product.price || 'BDT 0',
    },
    created_at: item.created_at || new Date().toISOString(),
  };
}

function getSellerProfilePath(role?: string, storefrontSlug?: string | null, resellerCode?: string | null) {
  const normalizedRole = role?.toLowerCase() ?? '';
  if (normalizedRole.includes('reseller')) {
    return resellerCode ? `/r/${resellerCode}` : null;
  }
  if (normalizedRole.includes('seller')) {
    return storefrontSlug ? `/store/${storefrontSlug}` : null;
  }
  return null;
}

function CommunitySkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Skeleton className="h-[360px] w-full rounded-[2rem]" />
        <Skeleton className="h-[360px] w-full rounded-[2rem]" />
      </div>
      <Skeleton className="h-24 w-full rounded-[1.75rem]" />
      <div className="grid gap-8 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-2xl" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="h-10 w-24 rounded-xl" />
              </div>
              <Skeleton className="mt-6 h-[360px] w-full rounded-[1.5rem]" />
              <div className="mt-6 space-y-3">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-6">
          <Skeleton className="h-64 w-full rounded-[2rem]" />
          <Skeleton className="h-72 w-full rounded-[2rem]" />
          <Skeleton className="h-48 w-full rounded-[2rem]" />
        </div>
      </div>
    </div>
  );
}

export const CommunityFeedPage = () => {
  const { token, isAuthenticated, user, isReady } = useUser();
  const [activeShare, setActiveShare] = useState<number | string | null>(null);
  const [activeTab, setActiveTab] = useState<FeedTab>('All');
  const [query, setQuery] = useState('');
  const [activeTopic, setActiveTopic] = useState<string>('All topics');
  const [likedPosts, setLikedPosts] = useState<Array<string | number>>([]);
  const [loading, setLoading] = useState(true);
  const [composerContent, setComposerContent] = useState('');
  const [composerTopic, setComposerTopic] = useState('');
  const [composerImageUrl, setComposerImageUrl] = useState('');
  const [composerProductSlug, setComposerProductSlug] = useState('');
  const [posting, setPosting] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | number | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | number | null>(null);
  const [activeCommentsPost, setActiveCommentsPost] = useState<FeedItem | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [feedItems, setFeedItems] = useState<FeedItem[]>(fallbackFeedItems);
  const [topicChips, setTopicChips] = useState<CommunityTopic[]>(fallbackTopics);
  const [topContributors, setTopContributors] = useState<CommunityContributor[]>(fallbackContributors);
  const [stats, setStats] = useState<CommunityStats>(fallbackStats);
  const [feedNotice, setFeedNotice] = useState('');
  const [usingFallback, setUsingFallback] = useState(false);
  const [composerInteracted, setComposerInteracted] = useState(false);
  const [showSecondaryPanels, setShowSecondaryPanels] = useState(false);
  const secondaryPanelsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;

    const loadFeed = async () => {
      try {
        setFeedNotice('');
        const data: CommunityFeedResponse = token
          ? await fetch('/api/community/feed', {
              cache: 'no-store',
              headers: { Authorization: `Bearer ${token}` },
            }).then(async (response) => {
              if (!response.ok) {
                throw new Error('Unable to load community feed');
              }
              return response.json();
            })
          : await getCachedClientValue('community-feed:public:v1', 3 * 60 * 1000, async () => {
              const response = await fetch('/api/community/feed', { cache: 'no-store' });
              if (!response.ok) {
                throw new Error('Unable to load community feed');
              }
              return response.json() as Promise<CommunityFeedResponse>;
            });
        if (!active) return;

        if (Array.isArray(data.items) && data.items.length > 0) {
          const normalized = data.items.map(normalizeFeedItem);
          setFeedItems(normalized);
          setLikedPosts(normalized.filter((item) => item.liked_by_me).map((item) => item.id));
          setUsingFallback(false);
        } else {
          setFeedItems([]);
          setTopicChips([]);
          setTopContributors([]);
          setLikedPosts([]);
          setUsingFallback(true);
          setFeedNotice('Community posts are still syncing. New verified reviews and seller updates will appear here soon.');
        }
        if (Array.isArray(data.trending_topics) && data.trending_topics.length > 0) {
          setTopicChips(data.trending_topics);
        }
        if (Array.isArray(data.top_contributors) && data.top_contributors.length > 0) {
          setTopContributors(data.top_contributors);
        }
        if (data.stats) {
          setStats({
            weekly_interactions: data.stats.weekly_interactions ?? fallbackStats.weekly_interactions,
            average_rating: data.stats.average_rating ?? fallbackStats.average_rating,
            fresh_updates_label: data.stats.fresh_updates_label || fallbackStats.fresh_updates_label,
            verified_partners: data.stats.verified_partners ?? fallbackStats.verified_partners,
          });
        }
      } catch {
        if (!active) return;
        setFeedItems([]);
        setTopicChips([]);
        setTopContributors([]);
        setStats(fallbackStats);
        setLikedPosts([]);
        setUsingFallback(true);
        setFeedNotice('Live community activity is temporarily unavailable. Please check back in a moment.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadFeed();

    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (showSecondaryPanels) return;

    const target = secondaryPanelsRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') {
      const timeoutId = window.setTimeout(() => setShowSecondaryPanels(true), 250);
      return () => window.clearTimeout(timeoutId);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShowSecondaryPanels(true);
          observer.disconnect();
        }
      },
      { rootMargin: '420px 0px' },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [showSecondaryPanels]);

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase();

    return feedItems.filter((item) => {
      const matchesTab = activeTab === 'All' ? true : item.tab === activeTab;
      const matchesTopic = activeTopic === 'All topics' ? true : item.topic === activeTopic;
      const source = `${item.user.name} ${item.user.role} ${item.caption} ${item.product.name} ${item.product.category} ${item.topic}`.toLowerCase();
      const matchesQuery = !term || source.includes(term);
      return matchesTab && matchesTopic && matchesQuery;
    });
  }, [activeTab, activeTopic, feedItems, query]);

  const toggleLike = (postId: string | number) => {
    setLikedPosts((current) => (current.includes(postId) ? current.filter((id) => id !== postId) : [...current, postId]));
  };

  const resetComposer = () => {
    setComposerContent('');
    setComposerTopic('');
    setComposerImageUrl('');
    setComposerProductSlug('');
    setEditingPostId(null);
    setComposerInteracted(false);
  };

  const handleCreatePost = async () => {
    if (!token) {
      toast.error('Please log in to share with the community.');
      return;
    }

    if (composerContent.trim().length < 12) {
      toast.error('Write a bit more before posting.');
      return;
    }

    try {
      setPosting(true);
      const response = await fetch(editingPostId ? `/api/community/posts/${editingPostId}` : '/api/community/posts', {
        method: editingPostId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: composerContent,
          topic: composerTopic,
          image_url: composerImageUrl,
          product_slug: composerProductSlug,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to create post');
      }

      if (data.post) {
        const created = normalizeFeedItem(data.post as FeedItem);
        setFeedItems((current) =>
          editingPostId
            ? current.map((post) => (post.id === created.id ? created : post))
            : [created, ...current],
        );
      }

      resetComposer();
      toast.success(editingPostId ? 'Your community post has been updated.' : 'Your community post is now live.');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save your post.');
    } finally {
      setPosting(false);
    }
  };

  const handleEditPost = (item: FeedItem) => {
    setEditingPostId(item.id);
    setComposerContent(item.caption);
    setComposerTopic(item.topic);
    setComposerImageUrl(item.image || '');
    setComposerProductSlug(item.product.slug || '');
    setComposerInteracted(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeletePost = async (postId: string | number) => {
    if (!token) {
      toast.error('Please log in first.');
      return;
    }
    if (deletingPostId !== postId) {
      setDeletingPostId(postId);
      return;
    }

    try {
      const response = await fetch(`/api/community/posts/${postId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to delete post');
      }

      setFeedItems((current) => current.filter((post) => post.id !== postId));
      if (editingPostId === postId) {
        resetComposer();
      }
      toast.success('Post deleted.');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete post.');
    } finally {
      setDeletingPostId(null);
    }
  };

  const handleLikePersist = async (item: FeedItem) => {
    if (!token) {
      toast.error('Please log in to like community posts.');
      return;
    }

    const wasLiked = likedPosts.includes(item.id);
    toggleLike(item.id);
    setFeedItems((current) =>
      current.map((post) =>
        post.id === item.id ? { ...post, likes: Math.max(0, post.likes + (wasLiked ? -1 : 1)) } : post,
      ),
    );

    try {
      const response = await fetch(`/api/community/posts/${item.id}/like`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to update like');
      }

      setFeedItems((current) =>
        current.map((post) =>
          post.id === item.id ? { ...post, likes: Number(data.likesCount ?? post.likes) } : post,
        ),
      );
    } catch (error: any) {
      toggleLike(item.id);
      setFeedItems((current) =>
        current.map((post) =>
          post.id === item.id ? { ...post, likes: Math.max(0, post.likes + (wasLiked ? 1 : -1)) } : post,
        ),
      );
      toast.error(error?.message || 'Failed to update like.');
    }
  };

  const loadComments = async (post: FeedItem) => {
    try {
      setCommentsLoading(true);
      setActiveCommentsPost(post);
      const response = await fetch(`/api/community/posts/${post.id}/comments`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to load comments');
      }
      setComments(Array.isArray(data) ? data : []);
    } catch (error: any) {
      setComments([]);
      toast.error(error?.message || 'Failed to load comments.');
    } finally {
      setCommentsLoading(false);
    }
  };

  const submitComment = async () => {
    if (!token || !activeCommentsPost) {
      toast.error('Please log in to comment.');
      return;
    }

    if (commentDraft.trim().length < 2) {
      toast.error('Write a short comment first.');
      return;
    }

    try {
      setCommentSubmitting(true);
      const response = await fetch(
        editingCommentId ? `/api/community/comments/${editingCommentId}` : `/api/community/posts/${activeCommentsPost.id}/comments`,
        {
          method: editingCommentId ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: commentDraft }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to post comment');
      }

      if (data.comment) {
        if (editingCommentId) {
          setComments((current) => current.map((comment) => (comment.id === editingCommentId ? (data.comment as CommunityComment) : comment)));
        } else {
          setComments((current) => [...current, data.comment as CommunityComment]);
          setFeedItems((current) =>
            current.map((post) =>
              post.id === activeCommentsPost.id ? { ...post, comments: post.comments + 1 } : post,
            ),
          );
          setActiveCommentsPost((current) => (current ? { ...current, comments: current.comments + 1 } : current));
        }
      }
      setCommentDraft('');
      setEditingCommentId(null);
      toast.success(editingCommentId ? 'Comment updated.' : 'Comment posted.');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to post comment.');
    } finally {
      setCommentSubmitting(false);
    }
  };

  const beginEditComment = (comment: CommunityComment) => {
    setEditingCommentId(comment.id);
    setCommentDraft(comment.content);
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!token || !activeCommentsPost) return;
    if (deletingCommentId !== commentId) {
      setDeletingCommentId(commentId);
      return;
    }

    try {
      const response = await fetch(`/api/community/comments/${commentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to delete comment');
      }
      setComments((current) => current.filter((comment) => comment.id !== commentId));
      setFeedItems((current) =>
        current.map((post) =>
          post.id === activeCommentsPost.id ? { ...post, comments: Math.max(0, post.comments - 1) } : post,
        ),
      );
      setActiveCommentsPost((current) => (current ? { ...current, comments: Math.max(0, current.comments - 1) } : current));
      if (editingCommentId === commentId) {
        setEditingCommentId(null);
        setCommentDraft('');
      }
      toast.success('Comment deleted.');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete comment.');
    } finally {
      setDeletingCommentId(null);
    }
  };

  const submitReport = async () => {
    if (!token || !reportDraft) {
      toast.error('Please log in to report a post.');
      return;
    }
    if (reportDraft.reason.trim().length < 3) {
      toast.error('Select a report reason first.');
      return;
    }

    try {
      setReportSubmitting(true);
      const response = await fetch(`/api/community/posts/${reportDraft.postId}/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          reason: reportDraft.reason,
          details: reportDraft.details,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to submit report');
      }
      setReportDraft(null);
      toast.success('Report submitted for review.');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to submit report.');
    } finally {
      setReportSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-14">
        <CommunitySkeleton />
      </div>
    );
  }

  return (
    <div className="bg-[radial-gradient(circle_at_top,#dcfce7_0%,rgba(255,255,255,0)_30%),linear-gradient(180deg,#f8fafc_0%,#ffffff_48%,#f8fafc_100%)]">
      <div className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-14">
        <div className="space-y-8">
          {feedNotice ? (
            <div className={`rounded-2xl px-4 py-3 text-sm ${usingFallback ? 'border border-amber-200 bg-amber-50 text-amber-800' : 'border border-slate-200 bg-slate-50 text-slate-600'}`}>
              {feedNotice}
            </div>
          ) : null}
          <section className="grid gap-6 overflow-hidden rounded-[2rem] border border-white/70 bg-white/95 shadow-[0_28px_80px_-48px_rgba(15,23,42,0.55)] xl:grid-cols-[1.15fr_0.85fr]">
            <div className="relative overflow-hidden p-6 sm:p-8 lg:p-10">
              <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.1),transparent_60%)]" />
              <div className="relative space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                  <Sparkles size={14} />
                  Community commerce
                </div>
                <div className="space-y-4">
                  <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                    Discover products through real people, real reviews, and trusted reseller moments
                  </h1>
                  <p className="max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                    LofiMart Community turns product discovery into a more confident experience. Shoppers can browse feedback, styling ideas, and purchase stories before they commit to checkout.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-2xl font-bold text-slate-950">{formatCompactNumber(stats.weekly_interactions)}+</p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">Weekly community interactions</p>
                  </div>
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-2xl font-bold text-slate-950">{stats.average_rating.toFixed(1)}/5</p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">Average shared satisfaction</p>
                  </div>
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-2xl font-bold text-slate-950">{stats.fresh_updates_label}</p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">Fresh posts and seller updates</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link
                    to="/shop"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Explore products
                    <ArrowRight size={16} />
                  </Link>
                  <Link
                    to="/register"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-primary/30 hover:text-primary"
                  >
                    Become a seller
                    <Store size={16} />
                  </Link>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 sm:p-8 xl:border-l xl:border-t-0">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Why community content converts
                </div>
                {trustSignals.map((item) => (
                  <div key={item.title} className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        {item.icon}
                      </span>
                      <div>
                        <h2 className="text-sm font-bold text-slate-950">{item.title}</h2>
                        <p className="mt-1 text-sm leading-6 text-slate-500">{item.body}</p>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Best use case</p>
                  <p className="mt-2 text-sm leading-6 text-emerald-900">
                    Especially powerful for fashion, beauty, electronics, and home categories where visuals and social proof matter most.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Share with the community</p>
                  <h2 className="mt-2 text-2xl font-bold text-slate-950">
                    {editingPostId ? 'Update your community post' : 'Post a product win, review, or styling moment'}
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    Help other shoppers make smarter decisions with honest feedback, real photos, and useful purchase context.
                  </p>
                </div>
                <textarea
                  value={composerContent}
                  onChange={(event) => {
                    setComposerContent(event.target.value);
                    setComposerInteracted(true);
                  }}
                  onFocus={() => setComposerInteracted(true)}
                  placeholder={isAuthenticated ? 'What did you buy, review, or recommend today?' : 'Log in to share a community post'}
                  disabled={!isReady || !isAuthenticated}
                  className="min-h-[140px] w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-70"
                />
              </div>
              <div className="space-y-4">
                <input
                  value={composerTopic}
                  onChange={(event) => {
                    setComposerTopic(event.target.value);
                    setComposerInteracted(true);
                  }}
                  onFocus={() => setComposerInteracted(true)}
                  placeholder="Topic tag, for example #StyleMatch"
                  disabled={!isReady || !isAuthenticated}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-70"
                />
                <input
                  value={composerProductSlug}
                  onChange={(event) => {
                    setComposerProductSlug(event.target.value);
                    setComposerInteracted(true);
                  }}
                  onFocus={() => setComposerInteracted(true)}
                  placeholder="Optional product slug to connect the post"
                  disabled={!isReady || !isAuthenticated}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-70"
                />
                <input
                  value={composerImageUrl}
                  onChange={(event) => {
                    setComposerImageUrl(event.target.value);
                    setComposerInteracted(true);
                  }}
                  onFocus={() => setComposerInteracted(true)}
                  placeholder="Optional image URL"
                  disabled={!isReady || !isAuthenticated}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-70"
                />
                {composerInteracted ? (
                  <CloudinaryUpload
                    label="Upload post image"
                    helper="Use a real product photo, setup shot, or customer moment for stronger trust."
                    onUploaded={(url) => setComposerImageUrl(url)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setComposerInteracted(true)}
                    disabled={!isReady || !isAuthenticated}
                    className="flex h-28 w-full items-center justify-center rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm font-semibold text-slate-600 transition hover:border-primary/30 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Prepare image upload
                  </button>
                )}
                {composerImageUrl ? (
                  <img
                    src={composerImageUrl}
                    alt="Community post preview"
                    className="h-40 w-full rounded-[1.5rem] object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : null}
                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-950">{isAuthenticated ? `Posting as ${user?.name || 'Community member'}` : 'Login required'}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Keep it useful, product-focused, and respectful. Community posts are designed to help others buy with confidence.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleCreatePost}
                    disabled={!isAuthenticated || posting}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {posting ? 'Saving...' : editingPostId ? 'Save changes' : 'Publish post'}
                    <ArrowRight size={16} />
                  </button>
                  {editingPostId ? (
                    <button
                      type="button"
                      onClick={resetComposer}
                      className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Cancel edit
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="grid gap-4 xl:grid-cols-[1.1fr_auto] xl:items-center">
              <div className="space-y-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search people, products, captions, or community topics"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {topicChips.map((topic) => {
                    const selected = activeTopic === topic.label;
                    return (
                      <button
                        key={topic.label}
                        type="button"
                        onClick={() => setActiveTopic(selected ? 'All topics' : topic.label)}
                        className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                          selected
                            ? 'bg-slate-950 text-white'
                            : 'border border-slate-200 bg-slate-50 text-slate-600 hover:border-primary/20 hover:text-primary'
                        }`}
                      >
                        {topic.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {feedTabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      activeTab === tab
                        ? 'bg-slate-950 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <div className="grid gap-8 xl:grid-cols-[1fr_340px]">
            <div className="space-y-6">
              {filteredItems.length === 0 ? (
                <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
                  <div className="mx-auto max-w-lg space-y-3">
                    <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                      <Search size={24} />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-950">
                      {query || activeTab !== 'All' || activeTopic !== 'All topics'
                        ? 'No community posts matched your filters'
                        : 'Community posts will appear here soon'}
                    </h2>
                    <p className="text-sm leading-7 text-slate-500">
                      {query || activeTab !== 'All' || activeTopic !== 'All topics'
                        ? 'Try a broader keyword, switch the feed tab, or clear the topic filter to continue exploring product stories.'
                        : 'Verified buyers, sellers, and resellers will see their approved product stories, reviews, and community updates here.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setQuery('');
                        setActiveTab('All');
                        setActiveTopic('All topics');
                      }}
                      className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      {query || activeTab !== 'All' || activeTopic !== 'All topics' ? 'Reset filters' : 'Refresh feed'}
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                filteredItems.map((item, idx) => {
                  const isLiked = likedPosts.includes(item.id);
                  const sellerProfilePath = getSellerProfilePath(item.user.role, item.user.storefront_slug, item.user.reseller_code);
                  const isOwnPost = user?.id && item.user.id === user.id;
                  const shareUrl =
                    typeof window !== 'undefined'
                      ? `${window.location.origin}/community?post=${item.id}`
                      : `/community?post=${item.id}`;

                  return (
                    <article
                      key={String(item.id)}
                      className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_28px_60px_-42px_rgba(15,23,42,0.5)]"
                    >
                      <div className="flex flex-col gap-5 p-5 sm:p-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex min-w-0 items-center gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-lg font-bold text-primary">
                              {item.user.avatar}
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                {sellerProfilePath ? (
                                  <Link to={sellerProfilePath} className="truncate font-bold text-slate-950 transition hover:text-primary">
                                    {item.user.name}
                                  </Link>
                                ) : (
                                  <h3 className="truncate font-bold text-slate-950">{item.user.name}</h3>
                                )}
                                <span className="dashboard-stat-chip bg-emerald-50 text-emerald-700 uppercase tracking-wide">
                                  {item.user.badge}
                                </span>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span className="font-medium text-primary">{item.user.role}</span>
                                <span>&bull;</span>
                                <span>{formatRelativeTime(item.created_at)}</span>
                                <span>&bull;</span>
                                <span>{item.topic}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isOwnPost ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleEditPost(item)}
                                  className="inline-flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-xs font-bold text-primary transition hover:bg-primary/15"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeletePost(item.id)}
                                  disabled={deletingPostId === item.id}
                                  className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  {deletingPostId === item.id ? 'Confirm delete' : 'Delete'}
                                </button>
                                {deletingPostId === item.id ? (
                                  <button
                                    type="button"
                                    onClick={() => setDeletingPostId(null)}
                                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                                  >
                                    Cancel
                                  </button>
                                ) : null}
                              </>
                            ) : sellerProfilePath ? (
                              <div className="flex items-center gap-2">
                                <Link
                                  to={sellerProfilePath}
                                  className="inline-flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-xs font-bold text-primary transition hover:bg-primary/15"
                                >
                                  <UserPlus className="h-3.5 w-3.5" />
                                  View profile
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => setReportDraft({ postId: item.id, reason: 'Misleading content', details: '' })}
                                  className="inline-flex items-center gap-2 rounded-xl border border-amber-200 px-3 py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-50"
                                >
                                  Report
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-xs font-bold text-primary transition hover:bg-primary/15"
                                >
                                  <UserPlus className="h-3.5 w-3.5" />
                                  Follow
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setReportDraft({ postId: item.id, reason: 'Misleading content', details: '' })}
                                  className="inline-flex items-center gap-2 rounded-xl border border-amber-200 px-3 py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-50"
                                >
                                  Report
                                </button>
                              </div>
                            )}
                            <button
                              type="button"
                              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
                            >
                              <MoreHorizontal className="h-5 w-5" />
                            </button>
                          </div>
                        </div>

                        <div className="overflow-hidden rounded-[1.5rem] bg-slate-100">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={`${item.user.name} shared ${item.product.name}`}
                              className="aspect-[4/4.5] w-full object-cover sm:aspect-[4/3.25]"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="flex aspect-[4/4.5] w-full items-center justify-center bg-[linear-gradient(135deg,#ecfeff_0%,#f8fafc_45%,#eef2ff_100%)] sm:aspect-[4/3.25]">
                              <div className="space-y-2 text-center">
                                <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm">
                                  <ShoppingBag className="h-5 w-5" />
                                </div>
                                <p className="text-sm font-semibold text-slate-700">{item.product.name}</p>
                                <p className="text-xs text-slate-500">Community image not available</p>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="space-y-5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                              <Sparkles size={12} />
                              {item.tab}
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                              <Star size={12} />
                              Community favorite
                            </span>
                          </div>

                          <p className="text-sm leading-7 text-slate-700 sm:text-[15px]">
                            <span className="mr-2 font-bold text-slate-950">{item.user.name}</span>
                            {item.caption}
                          </p>
                          {item.title ? <p className="text-sm font-semibold text-slate-950">{item.title}</p> : null}

                          <div className="flex flex-wrap items-center gap-5 border-t border-slate-100 pt-4">
                            <button
                              type="button"
                              onClick={() => void handleLikePersist(item)}
                              className={`inline-flex items-center gap-2 text-sm font-bold transition-colors ${
                                isLiked ? 'text-rose-500' : 'text-slate-600 hover:text-rose-500'
                              }`}
                            >
                              <Heart className={`h-5 w-5 ${isLiked ? 'fill-current' : ''}`} />
                              <span>{item.likes}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void loadComments(item)}
                              className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 transition-colors hover:text-primary"
                            >
                              <MessageCircle className="h-5 w-5" />
                              <span>{item.comments}</span>
                            </button>
                            <div className="inline-flex items-center gap-2 text-sm font-bold text-slate-600">
                              <ShoppingBag className="h-5 w-5" />
                              <span>{item.saves} saves</span>
                            </div>
                            <div className="relative ml-auto">
                              <button
                                type="button"
                                onClick={() => setActiveShare(activeShare === item.id ? null : item.id)}
                                className={`inline-flex items-center gap-2 text-sm font-bold transition-colors ${
                                  activeShare === item.id ? 'text-primary' : 'text-slate-600 hover:text-primary'
                                }`}
                              >
                                <Share2 className="h-5 w-5" />
                                <span>Share</span>
                              </button>
                              {activeShare === item.id && (
                                <div className="absolute right-0 top-full z-50 mt-3 w-[260px] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
                                  <div className="mb-3 flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Share post</span>
                                    <button
                                      type="button"
                                      onClick={() => setActiveShare(null)}
                                      className="text-slate-400 hover:text-slate-600"
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                  <SocialShare
                                    url={shareUrl}
                                    title={`Check out this community post by ${item.user.name} on LofiMart.`}
                                  />
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                              <div className="flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-primary shadow-sm">
                                  <ShoppingCart size={18} />
                                </div>
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.product.category}</p>
                                  <p className="text-sm font-bold text-slate-950">{item.product.name}</p>
                                  <p className="text-sm font-semibold text-slate-600">{item.product.price}</p>
                                </div>
                              </div>
                              <Link
                                to={item.product.slug ? `/product/${item.product.slug}` : '/shop'}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-primary shadow-sm transition hover:bg-slate-100"
                              >
                                {item.product.slug ? 'View product' : 'Browse shop'}
                                <ArrowRight size={15} />
                              </Link>
                            </div>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            <aside ref={secondaryPanelsRef} className="space-y-6">
              {showSecondaryPanels ? (
                <>
                  <div className="rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-sm">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      <h3 className="font-bold text-slate-950">Trending topics</h3>
                    </div>
                    <div className="mt-5 space-y-3">
                      {topicChips.map((topic) => (
                        <button
                          key={topic.label}
                          type="button"
                          onClick={() => {
                            setActiveTopic(topic.label);
                            setQuery(topic.label.replace('#', ''));
                          }}
                          className="block w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:bg-white hover:shadow-sm"
                        >
                          <p className="text-sm font-bold text-slate-950">{topic.label}</p>
                          <p className="mt-1 text-xs text-slate-500">{topic.note}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      <h3 className="font-bold text-slate-950">Top contributors</h3>
                    </div>
                    <div className="mt-5 space-y-4">
                      {topContributors.map((user, index) => (
                        <div key={user.id ?? user.name} className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white font-bold text-primary shadow-sm">
                              {index + 1}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-950">{user.name}</p>
                              <p className="text-xs text-slate-500">{user.role}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-semibold text-emerald-600">{user.stat}</p>
                            {user.id ? (
                              ((user.reseller_role || user.role === 'Verified Reseller') && user.reseller_code)
                                ? (
                                    <Link to={`/r/${user.reseller_code}`} className="mt-1 inline-block text-xs font-semibold text-primary hover:underline">
                                      View
                                    </Link>
                                  )
                                : user.storefront_slug ? (
                                    <Link to={`/store/${user.storefront_slug}`} className="mt-1 inline-block text-xs font-semibold text-primary hover:underline">
                                      View
                                    </Link>
                                  ) : (
                                    <button type="button" className="mt-1 text-xs font-semibold text-primary hover:underline">
                                      View
                                    </button>
                                  )
                            ) : (
                              <button type="button" className="mt-1 text-xs font-semibold text-primary hover:underline">
                                View
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[2rem] border border-slate-200/80 bg-slate-950 p-6 text-white shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Seller opportunity</p>
                    <h3 className="mt-3 text-2xl font-bold">Turn community trust into more conversions</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-300">
                      Publish real product moments, highlight verified reviews, and give shoppers the confidence they need before checkout.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <Link
                        to="/register"
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
                      >
                        Start selling
                        <ArrowRight size={15} />
                      </Link>
                      <Link
                        to="/help"
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/8"
                      >
                        Learn more
                      </Link>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <Skeleton className="h-64 w-full rounded-[2rem]" />
                  <Skeleton className="h-72 w-full rounded-[2rem]" />
                  <Skeleton className="h-48 w-full rounded-[2rem]" />
                </>
              )}
            </aside>
          </div>
        </div>
      </div>

      {activeCommentsPost && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 p-4 sm:items-center">
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Community discussion</p>
                  <p className="text-xs text-slate-500">{activeCommentsPost.user.name} - {activeCommentsPost.product.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveCommentsPost(null);
                    setComments([]);
                    setCommentDraft('');
                  }}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
                <p className="text-sm leading-7 text-slate-700">{activeCommentsPost.caption}</p>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                {commentsLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={index} className="rounded-2xl border border-slate-200 p-4">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="mt-3 h-4 w-full" />
                        <Skeleton className="mt-2 h-4 w-4/5" />
                      </div>
                    ))}
                  </div>
                ) : comments.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-slate-300 px-6 py-12 text-center">
                    <p className="text-sm font-semibold text-slate-950">No comments yet</p>
                    <p className="mt-2 text-sm text-slate-500">Start the conversation with a useful buying tip or product insight.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {comments.map((comment) => (
                      <div key={comment.id} className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 font-bold text-primary">
                            {comment.user.avatar}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-950">{comment.user.name}</p>
                            <p className="text-xs text-slate-500">{comment.user.role} - {formatRelativeTime(comment.created_at)}</p>
                          </div>
                        </div>
                        <p className="mt-3 text-sm leading-7 text-slate-700">{comment.content}</p>
                        {comment.user.id === user?.id ? (
                          <div className="mt-3 flex gap-3">
                            <button
                              type="button"
                              onClick={() => beginEditComment(comment)}
                              className="text-xs font-semibold text-primary hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteComment(comment.id)}
                              disabled={deletingCommentId === comment.id}
                              className="text-xs font-semibold text-rose-600 hover:underline disabled:opacity-60"
                            >
                              {deletingCommentId === comment.id ? 'Confirm delete' : 'Delete'}
                            </button>
                            {deletingCommentId === comment.id ? (
                              <button
                                type="button"
                                onClick={() => setDeletingCommentId(null)}
                                className="text-xs font-semibold text-slate-500 hover:underline"
                              >
                                Cancel
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 px-5 py-4">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <textarea
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    placeholder={isAuthenticated ? 'Add a helpful comment' : 'Log in to join the discussion'}
                    disabled={!isAuthenticated}
                    className="min-h-[88px] flex-1 rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-70"
                  />
                  <button
                    type="button"
                    onClick={() => void submitComment()}
                    disabled={!isAuthenticated || commentSubmitting}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:self-end"
                  >
                    {commentSubmitting ? 'Saving...' : editingCommentId ? 'Save comment' : 'Post comment'}
                  </button>
                </div>
                {editingCommentId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCommentId(null);
                      setCommentDraft('');
                    }}
                    className="mt-3 text-xs font-semibold text-slate-500 hover:text-slate-700"
                  >
                    Cancel comment edit
                  </button>
                ) : null}
              </div>
          </div>
        </div>
      )}

      {reportDraft && (
        <div className="fixed inset-0 z-[85] flex items-end justify-center bg-slate-950/45 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Report community post</p>
                  <p className="mt-1 text-sm text-slate-500">Help keep the community useful, respectful, and trustworthy.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReportDraft(null)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="mt-5 space-y-4">
                <select
                  value={reportDraft.reason}
                  onChange={(event) => setReportDraft((current) => (current ? { ...current, reason: event.target.value } : current))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10"
                >
                  <option>Misleading content</option>
                  <option>Spam</option>
                  <option>Abusive language</option>
                  <option>Wrong product claim</option>
                  <option>Other</option>
                </select>
                <textarea
                  value={reportDraft.details}
                  onChange={(event) => setReportDraft((current) => (current ? { ...current, details: event.target.value } : current))}
                  placeholder="Optional extra details"
                  className="min-h-[120px] w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10"
                />
                <button
                  type="button"
                  onClick={() => void submitReport()}
                  disabled={reportSubmitting}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {reportSubmitting ? 'Submitting...' : 'Submit report'}
                </button>
              </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommunityFeedPage;

