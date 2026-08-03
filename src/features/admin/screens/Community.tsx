'use client';

import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, EyeOff, Loader2, MessageSquare, Search, ShieldCheck, SquarePen, XCircle } from 'lucide-react';
import { useUser } from '../../../features/shared/state/UserContext';

type AdminCommunityPost = {
  id: string;
  caption: string;
  topic: string;
  likes: number;
  comments: number;
  created_at: string;
  status: string;
  moderation_note?: string | null;
  user: {
    name: string;
    role: string;
  };
  product: {
    name: string;
    category: string;
  };
};

type AdminCommunityComment = {
  id: string;
  content: string;
  status: string;
  created_at: string;
  moderation_note?: string | null;
  post_id: string;
  post_excerpt: string;
  user: {
    name: string;
    role: string;
  };
};

type AdminCommunityReport = {
  id: string;
  post_id: string;
  reason: string;
  details?: string | null;
  status: string;
  created_at: string;
  post_excerpt: string;
  user: {
    name: string;
    role: string;
  };
};

export const AdminCommunityPage = () => {
  const { token } = useUser();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<AdminCommunityPost[]>([]);
  const [comments, setComments] = useState<AdminCommunityComment[]>([]);
  const [reports, setReports] = useState<AdminCommunityReport[]>([]);
  const [query, setQuery] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [focusedReportId, setFocusedReportId] = useState('');

  const loadModeration = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const response = await fetch('/api/admin/community/posts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load community moderation');
      }
      setPosts(Array.isArray(data.posts) ? data.posts : []);
      setComments(Array.isArray(data.comments) ? data.comments : []);
      setReports(Array.isArray(data.reports) ? data.reports : []);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load community moderation.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadModeration();
  }, [token]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const nextReport = params.get('report');
    if (nextReport) {
      setFocusedReportId(nextReport);
    }
  }, []);

  const filteredPosts = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return posts;
    return posts.filter((post) =>
      `${post.user.name} ${post.user.role} ${post.caption} ${post.topic} ${post.product.name}`.toLowerCase().includes(term),
    );
  }, [posts, query]);

  const filteredComments = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return comments;
    return comments.filter((comment) =>
      `${comment.user.name} ${comment.user.role} ${comment.content} ${comment.post_excerpt}`.toLowerCase().includes(term),
    );
  }, [comments, query]);

  const filteredReports = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return reports;
    return reports.filter((report) =>
      `${report.user.name} ${report.user.role} ${report.reason} ${report.details ?? ''} ${report.post_excerpt}`.toLowerCase().includes(term),
    );
  }, [reports, query]);

  useEffect(() => {
    if (!focusedReportId || typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      document.getElementById(`admin-community-report-${focusedReportId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [filteredReports.length, focusedReportId]);

  const moderatePost = async (postId: string, status: 'approved' | 'hidden' | 'rejected') => {
    if (!token) return;
    try {
      setBusyKey(`post-${postId}-${status}`);
      const response = await fetch(`/api/admin/community/posts/${postId}/moderate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update post');
      }
      setPosts((current) => current.map((post) => (post.id === postId ? { ...post, status } : post)));
      toast.success(`Post marked as ${status}.`);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to moderate post.');
    } finally {
      setBusyKey(null);
    }
  };

  const moderateComment = async (commentId: string, status: 'visible' | 'hidden') => {
    if (!token) return;
    try {
      setBusyKey(`comment-${commentId}-${status}`);
      const response = await fetch(`/api/admin/community/comments/${commentId}/moderate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update comment');
      }
      setComments((current) => current.map((comment) => (comment.id === commentId ? { ...comment, status } : comment)));
      toast.success(`Comment marked as ${status}.`);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to moderate comment.');
    } finally {
      setBusyKey(null);
    }
  };

  const reviewReport = async (reportId: string, status: 'open' | 'reviewed' | 'dismissed') => {
    if (!token) return;
    try {
      setBusyKey(`report-${reportId}-${status}`);
      const response = await fetch(`/api/admin/community/reports/${reportId}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update report');
      }
      setReports((current) => current.map((report) => (report.id === reportId ? { ...report, status } : report)));
      toast.success(`Report marked as ${status}.`);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to review report.');
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Community moderation</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">Manage posts and discussions</h1>
          <p className="mt-2 text-sm leading-7 text-slate-500">
            Review community content, keep feed quality high, and hide anything that does not meet marketplace standards.
          </p>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search posts or comments"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10"
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <SquarePen className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold text-slate-950">Posts</h2>
          </div>
          <div className="space-y-4">
            {filteredPosts.map((post) => (
              <div key={post.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-950">{post.user.name}</p>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {post.user.role}
                      </span>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        {post.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{post.topic} â€¢ {post.product.name} â€¢ {new Date(post.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void moderatePost(post.id, 'approved')}
                      disabled={busyKey === `post-${post.id}-approved`}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                    >
                      <CheckCircle2 size={14} />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => void moderatePost(post.id, 'hidden')}
                      disabled={busyKey === `post-${post.id}-hidden`}
                      className="inline-flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60"
                    >
                      <EyeOff size={14} />
                      Hide
                    </button>
                    <button
                      type="button"
                      onClick={() => void moderatePost(post.id, 'rejected')}
                      disabled={busyKey === `post-${post.id}-rejected`}
                      className="inline-flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                    >
                      <XCircle size={14} />
                      Reject
                    </button>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-700">{post.caption}</p>
                <div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold text-slate-500">
                  <span>{post.likes} likes</span>
                  <span>{post.comments} comments</span>
                  <span>{post.product.category}</span>
                </div>
              </div>
            ))}
            {filteredPosts.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-slate-300 px-6 py-12 text-center text-sm text-slate-500">
                No community posts matched your search.
              </div>
            ) : null}
          </div>
        </section>

        <div className="space-y-6">
          <section className="space-y-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-bold text-slate-950">Comments</h2>
            </div>
            <div className="space-y-4">
              {filteredComments.map((comment) => (
                <div key={comment.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-slate-950">{comment.user.name}</p>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {comment.user.role}
                    </span>
                    <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                      {comment.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-700">{comment.content}</p>
                  <p className="mt-3 text-xs text-slate-500">On post: {comment.post_excerpt || 'Community discussion'} </p>
                  <p className="mt-1 text-[11px] text-slate-400">{new Date(comment.created_at).toLocaleString()}</p>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void moderateComment(comment.id, 'visible')}
                      disabled={busyKey === `comment-${comment.id}-visible`}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                    >
                      <ShieldCheck size={14} />
                      Show
                    </button>
                    <button
                      type="button"
                      onClick={() => void moderateComment(comment.id, 'hidden')}
                      disabled={busyKey === `comment-${comment.id}-hidden`}
                      className="inline-flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60"
                    >
                      <EyeOff size={14} />
                      Hide
                    </button>
                  </div>
                </div>
              ))}
              {filteredComments.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-slate-300 px-6 py-12 text-center text-sm text-slate-500">
                  No comments matched your search.
                </div>
              ) : null}
            </div>
          </section>

          <section className="space-y-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-bold text-slate-950">Reports</h2>
            </div>
            <div className="space-y-4">
              {filteredReports.map((report) => (
                <div
                  id={`admin-community-report-${report.id}`}
                  key={report.id}
                  className={`rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 ${
                    report.id === focusedReportId ? 'border-indigo-300 ring-2 ring-indigo-200 bg-indigo-50/30' : ''
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-slate-950">{report.user.name}</p>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {report.user.role}
                    </span>
                    <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-rose-700">
                      {report.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-900">Reason: {report.reason}</p>
                  {report.details ? <p className="mt-2 text-sm leading-7 text-slate-700">{report.details}</p> : null}
                  <p className="mt-3 text-xs text-slate-500">Reported post: {report.post_excerpt || 'Community discussion'}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{new Date(report.created_at).toLocaleString()}</p>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void reviewReport(report.id, 'reviewed')}
                      disabled={busyKey === `report-${report.id}-reviewed`}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                    >
                      Review
                    </button>
                    <button
                      type="button"
                      onClick={() => void reviewReport(report.id, 'dismissed')}
                      disabled={busyKey === `report-${report.id}-dismissed`}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-60"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
              {filteredReports.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-slate-300 px-6 py-12 text-center text-sm text-slate-500">
                  No reports matched your search.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
