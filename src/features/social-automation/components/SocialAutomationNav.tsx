'use client';

import { BarChart3, CalendarDays, LayoutDashboard, Link2, ListChecks, Package, Settings2 } from 'lucide-react';
import { Link, useSearchParams } from '@/lib/navigation';

const items = [
  { label: 'Overview', path: '/seller/social-automation', icon: LayoutDashboard },
  { label: 'Accounts', path: '/seller/social-automation/accounts', icon: Link2 },
  { label: 'Products', path: '/seller/social-automation/products', icon: Package },
  { label: 'Calendar', path: '/seller/social-automation/calendar', icon: CalendarDays },
  { label: 'Posts', path: '/seller/social-automation/posts', icon: ListChecks },
  { label: 'Analytics', path: '/seller/social-automation/analytics', icon: BarChart3 },
];

export function SocialAutomationNav({ active }: { active?: string }) {
  const [searchParams] = useSearchParams();
  const current = active ?? (searchParams.get('tab') || 'overview');

  return (
    <nav aria-label="Social automation" className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
      <div className="flex min-w-max gap-1">
        {items.map(({ label, path, icon: Icon }) => {
          const key = label.toLowerCase();
          const selected = current === key;
          return (
            <Link
              key={path}
              to={path}
              className={`inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-bold transition sm:px-4 ${selected ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-950'}`}
            >
              <Icon size={16} />
              <span>{label}</span>
            </Link>
          );
        })}
        <span className="mx-1 hidden h-10 w-px bg-slate-100 sm:block" />
        <Link
          to="/seller/social-automation?settings=1"
          className="inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-950 sm:px-4"
        >
          <Settings2 size={16} />
          <span>Settings</span>
        </Link>
      </div>
    </nav>
  );
}
