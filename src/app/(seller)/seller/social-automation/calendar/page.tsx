'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus, Zap } from 'lucide-react';
import { useUser } from '@/features/shared/state/UserContext';
import { SellerEmptyState, SellerPageHeader } from '@/features/seller/components/SellerPageHeader';
import { SocialAutomationNav } from '@/features/social-automation/components/SocialAutomationNav';
import { Link } from '@/lib/navigation';
import toast from '@/lib/toast';

type Activity = { id: string; product_name: string | null; status: string; scheduled_at: string | null; created_at: string };
type Automation = { id: string; product_name: string | null; schedule_label: string; next_run_at: string; status: string };

type Payload = { recent_activity: Activity[]; active_automations: Automation[] };

function sameDay(value: string, year: number, month: number, day: number) {
  const date = new Date(value);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
}

export default function SocialAutomationCalendarPage() {
  const { token } = useUser();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [month, setMonth] = useState(() => new Date());

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch('/api/social-automation', { headers: { Authorization: `Bearer ${token}` } });
      const data = (await response.json().catch(() => null)) as Payload | null;
      if (!response.ok || !data) throw new Error('Failed to load content calendar.');
      setPayload(data);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Failed to load content calendar.'); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const cells = useMemo(() => {
    const year = month.getFullYear();
    const currentMonth = month.getMonth();
    const first = new Date(year, currentMonth, 1);
    const days = new Date(year, currentMonth + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    return Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, index) => {
      const day = index - offset + 1;
      return day < 1 || day > days ? null : day;
    });
  }, [month]);

  const itemsForDay = (day: number) => {
    const values = [
      ...(payload?.recent_activity ?? []).map((item) => ({ ...item, date: item.scheduled_at || item.created_at, kind: 'post' })),
      ...(payload?.active_automations ?? []).map((item) => ({ ...item, date: item.next_run_at, kind: 'automation' })),
    ];
    return values.filter((item) => sameDay(item.date, month.getFullYear(), month.getMonth(), day)).slice(0, 2);
  };

  return (
    <div className="space-y-5">
      <SellerPageHeader eyebrow="Social Automation" title="Content Calendar" description="See upcoming product posts and recurring automation runs at a glance." actions={<Link to="/seller/social-automation/products" className="btn-primary inline-flex h-11 items-center gap-2"><Plus size={17} /> Schedule Post</Link>} />
      <SocialAutomationNav active="calendar" />

      <section className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5">
          <div><p className="text-sm font-bold text-slate-500">Planning view</p><h2 className="text-lg font-black text-slate-950">{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2></div>
          <div className="flex gap-1">
            <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="h-9 w-9 rounded-lg border border-slate-200" aria-label="Previous month"><ChevronLeft size={17} className="mx-auto" /></button>
            <button type="button" onClick={() => setMonth(new Date())} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold">Today</button>
            <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="h-9 w-9 rounded-lg border border-slate-200" aria-label="Next month"><ChevronRight size={17} className="mx-auto" /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-[11px] font-black uppercase tracking-wide text-slate-500">
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day) => <div key={day} className="py-3">{day}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, index) => {
            const entries = day ? itemsForDay(day) : [];
            return (
              <div key={index} className="min-h-24 border-b border-r border-slate-100 p-1.5 sm:min-h-32 sm:p-2">
                {day ? <div className={`mb-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${day === new Date().getDate() && month.getMonth() === new Date().getMonth() && month.getFullYear() === new Date().getFullYear() ? 'bg-slate-950 text-white' : 'text-slate-600'}`}>{day}</div> : null}
                <div className="space-y-1">
                  {entries.map((entry) => <div key={entry.id} className={`truncate rounded-lg px-1.5 py-1 text-[10px] font-bold ${entry.kind === 'automation' ? 'bg-violet-50 text-violet-700' : entry.status === 'FAILED' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`} title={entry.product_name || 'Product'}>{entry.kind === 'automation' ? <Zap size={10} className="mr-0.5 inline" /> : <Clock3 size={10} className="mr-0.5 inline" />}{entry.product_name || 'Product'}</div>)}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2"><CalendarDays size={18} /><h2 className="font-black text-slate-950">Upcoming automation</h2></div>
        {payload?.active_automations?.length ? <div className="space-y-2">{payload.active_automations.slice(0, 6).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 p-3"><div><p className="text-sm font-bold text-slate-950">{item.product_name || 'Product'}</p><p className="text-xs text-slate-500">{item.schedule_label}</p></div><p className="text-xs font-bold text-slate-600">{new Date(item.next_run_at).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })}</p></div>)}</div> : <SellerEmptyState message="No recurring automation is scheduled." />}
      </section>
    </div>
  );
}
