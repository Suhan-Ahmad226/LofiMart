'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, Clock3, RefreshCw, TrendingUp, XCircle, Zap } from 'lucide-react';
import { useUser } from '@/features/shared/state/UserContext';
import { SellerPageHeader, SellerStatCard, SellerEmptyState } from '@/features/seller/components/SellerPageHeader';
import { SocialAutomationNav } from '@/features/social-automation/components/SocialAutomationNav';
import toast from '@/lib/toast';

type Activity = { id: string; product_name: string | null; status: string; scheduled_at: string | null; created_at: string };
type Payload = { summary: { published: number; scheduled: number; active_automations: number; failed: number }; recent_activity: Activity[] };

export default function SocialAutomationAnalyticsPage() {
  const { token } = useUser();
  const [payload, setPayload] = useState<Payload | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch('/api/social-automation', { headers: { Authorization: `Bearer ${token}` } });
      const data = (await response.json().catch(() => null)) as Payload | null;
      if (!response.ok || !data) throw new Error('Failed to load analytics.');
      setPayload(data);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Failed to load analytics.'); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const trend = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      return { date, count: 0 };
    });
    for (const item of payload?.recent_activity ?? []) {
      const source = new Date(item.scheduled_at || item.created_at);
      const match = days.find((day) => day.date.toDateString() === new Date(source.getFullYear(), source.getMonth(), source.getDate()).toDateString());
      if (match) match.count += 1;
    }
    return days;
  }, [payload]);

  const max = Math.max(1, ...trend.map((item) => item.count));
  const stats = payload ? [
    { label: 'Published', value: payload.summary.published, tone: 'success' as const },
    { label: 'Scheduled', value: payload.summary.scheduled, tone: 'default' as const },
    { label: 'Active Automations', value: payload.summary.active_automations, tone: 'success' as const },
    { label: 'Failed', value: payload.summary.failed, tone: 'critical' as const },
  ] : [];

  return (
    <div className="space-y-5">
      <SellerPageHeader eyebrow="Social Automation" title="Analytics" description="Monitor publishing health and automation activity." actions={<button type="button" onClick={() => void load()} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold"><RefreshCw size={16} /> Refresh</button>} />
      <SocialAutomationNav active="analytics" />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{stats.map((stat) => <SellerStatCard key={stat.label} {...stat} />)}</div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <section className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><div><p className="text-sm font-bold text-slate-500">Last 7 days</p><h2 className="text-lg font-black text-slate-950">Publishing activity</h2></div><TrendingUp size={19} className="text-slate-400" /></div>
          <div className="mt-6 flex h-48 items-end gap-2 sm:gap-3">
            {trend.map((item) => <div key={item.date.toISOString()} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><div className="flex w-full max-w-12 flex-1 items-end rounded-xl bg-slate-50"><div className="w-full rounded-xl bg-slate-950 transition-all" style={{ height: `${Math.max(8, (item.count / max) * 100)}%` }} /></div><span className="text-[10px] font-bold text-slate-400">{item.date.toLocaleDateString('en-US',{weekday:'short'}).slice(0,2)}</span><span className="text-[10px] font-black text-slate-600">{item.count}</span></div>)}
          </div>
        </section>

        <section className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">Health</h2>
          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-semibold text-slate-600"><CheckCircle2 size={17} className="text-emerald-500" /> Published</span><strong>{payload?.summary.published ?? 0}</strong></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-semibold text-slate-600"><Clock3 size={17} className="text-blue-500" /> Scheduled</span><strong>{payload?.summary.scheduled ?? 0}</strong></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-semibold text-slate-600"><Zap size={17} className="text-violet-500" /> Automation</span><strong>{payload?.summary.active_automations ?? 0}</strong></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-semibold text-slate-600"><XCircle size={17} className="text-rose-500" /> Failed</span><strong>{payload?.summary.failed ?? 0}</strong></div>
          </div>
          <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-xs font-semibold text-slate-500">These metrics reflect LofiMart publishing operations. Engagement and click analytics can be added when platform insights APIs are enabled.</div>
        </section>
      </div>

      <section className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><BarChart3 size={18} /><h2 className="font-black text-slate-950">Top recent products</h2></div>
        {payload?.recent_activity?.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2">{payload.recent_activity.slice(0, 6).map((item) => <div key={item.id} className="rounded-2xl border border-slate-100 p-3"><p className="text-sm font-bold text-slate-950">{item.product_name || 'Product'}</p><p className="mt-1 text-xs text-slate-500">{item.status}</p></div>)}</div> : <div className="mt-4"><SellerEmptyState message="Publish a product to start building activity history." /></div>}
      </section>
    </div>
  );
}
