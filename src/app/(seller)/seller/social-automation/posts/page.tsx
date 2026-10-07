'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, ListChecks, RefreshCw, RotateCcw, XCircle } from 'lucide-react';
import { useUser } from '@/features/shared/state/UserContext';
import { SellerEmptyState, SellerPageHeader } from '@/features/seller/components/SellerPageHeader';
import { SocialAutomationNav } from '@/features/social-automation/components/SocialAutomationNav';
import { Link } from '@/lib/navigation';
import toast from '@/lib/toast';

type Activity = { id: string; product_name: string | null; status: string; scheduled_at: string | null; published_at?: string | null; created_at: string; error_message?: string | null };

export default function SocialAutomationPostsPage() {
  const { token } = useUser();
  const [items, setItems] = useState<Activity[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await fetch('/api/social-automation', { headers: { Authorization: `Bearer ${token}` } });
      const data = (await response.json().catch(() => null)) as { recent_activity?: Activity[] } | null;
      if (!response.ok) throw new Error('Failed to load posts.');
      setItems(data?.recent_activity ?? []);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Failed to load posts.'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => filter === 'ALL' ? items : items.filter((item) => item.status === filter), [filter, items]);

  const status = (value: string) => {
    if (value === 'PUBLISHED') return <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700"><CheckCircle2 size={13} /> Published</span>;
    if (value === 'FAILED') return <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-black text-rose-700"><XCircle size={13} /> Failed</span>;
    return <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700"><Clock3 size={13} /> {value.replace('_', ' ')}</span>;
  };

  return (
    <div className="space-y-5">
      <SellerPageHeader eyebrow="Social Automation" title="Posts" description="Review scheduled, published and failed social posts." actions={<button type="button" onClick={() => void load()} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold"><RefreshCw size={16} /> Refresh</button>} />
      <SocialAutomationNav active="posts" />

      <section className="rounded-3xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap gap-2">
          {['ALL','SCHEDULED','PUBLISHED','FAILED'].map((value) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-xl px-3.5 py-2 text-xs font-black ${filter === value ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`}>{value === 'ALL' ? 'All' : value[0] + value.slice(1).toLowerCase()}</button>)}
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm">
        {loading ? <div className="space-y-3 p-5">{Array.from({length:5}).map((_,i)=><div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />)}</div> : filtered.length === 0 ? <div className="p-6"><SellerEmptyState message="No posts match this filter yet." /></div> : (
          <div className="divide-y divide-slate-100">
            {filtered.map((item) => <article key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.status === 'FAILED' ? 'bg-rose-50 text-rose-600' : item.status === 'PUBLISHED' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}><ListChecks size={18} /></div>
                <div><p className="font-black text-slate-950">{item.product_name || 'Product'}</p><p className="mt-1 text-xs text-slate-500">{new Date(item.scheduled_at || item.created_at).toLocaleString('en-US', { dateStyle:'medium', timeStyle:'short' })}</p>{item.error_message ? <p className="mt-1 text-xs font-semibold text-rose-600">{item.error_message}</p> : null}</div>
              </div>
              <div className="flex items-center gap-2">{status(item.status)}{item.status === 'FAILED' ? <Link to="/seller/social-automation/products" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700"><RotateCcw size={13} /> Retry</Link> : null}</div>
            </article>)}
          </div>
        )}
      </section>

      <div className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs font-semibold text-slate-500"><AlertCircle size={15} /> History currently shows the latest activity available from the social automation service.</div>
    </div>
  );
}
