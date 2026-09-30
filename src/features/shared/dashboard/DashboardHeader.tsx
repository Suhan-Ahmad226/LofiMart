"use client";

import React from 'react';
import { Link } from '../../../lib/navigation';
import { cn } from '../../../lib/utils';
import {
  Bell,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  HelpCircle,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Store,
  MessageCircle,
} from 'lucide-react';
import type { DashboardConfig } from './dashboard.types';

interface DashboardHeaderProps {
  config: DashboardConfig;
  collapsed: boolean;
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  setMobileOpen: React.Dispatch<React.SetStateAction<boolean>>;
  searchValue: string;
  setSearchValue: React.Dispatch<React.SetStateAction<string>>;
  onSearchSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  quickAccessBadgeCount: number;
  workspaceName: string;
  workspaceSubtitle: string;
  initials: string;
  avatarUrl?: string | null;
  pathname: string;
  onLogout: () => void;
}

export function DashboardHeader({
  config,
  collapsed,
  setCollapsed,
  setMobileOpen,
  searchValue,
  setSearchValue,
  onSearchSubmit,
  quickAccessBadgeCount,
  workspaceName,
  workspaceSubtitle,
  initials,
  avatarUrl,
  pathname,
  onLogout,
}: DashboardHeaderProps) {
  const [headerProfileOpen, setHeaderProfileOpen] = React.useState(false);

  return (
    <div className="seller-topbar-shell">
      <div className="seller-topbar-shell__row flex h-16 items-center gap-2 border-b border-[#ece6ee] bg-[#fdfbff]">
        <div className="flex w-full items-center gap-3 px-4 md:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="seller-mobile-trigger inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-700 transition hover:bg-slate-100 lg:hidden"
            aria-label="Open dashboard menu"
          >
            <Menu size={17} />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((current) => !current)}
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-slate-700 transition hover:bg-slate-100 lg:inline-flex"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <div className="mr-1 hidden h-5 w-px bg-[#e6e0e9] lg:block" />
          <Link to={config.brandHome} className="hidden min-w-[150px] items-center gap-2 lg:flex">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4f378a] text-white shadow-sm">
              <Store size={19} />
            </span>
            <span className="min-w-0 leading-none">
              <span className="block truncate text-base font-bold tracking-tight text-[#1d1b20]">LofiMart</span>
              <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-[0.16em] text-[#63597c]">{config.subtitle}</span>
            </span>
          </Link>

          <form onSubmit={onSearchSubmit} className="hidden min-w-0 max-w-xl flex-1 md:block lg:mx-auto">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7a7582]" size={14} />
              <input
                type="search"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder={config.searchPlaceholder}
                className="h-10 w-full rounded-lg border border-[#cbc4d2]/60 bg-[#f8f2fa] pl-10 pr-24 text-sm text-[#1d1b20] outline-none transition placeholder:text-[#7a7582] focus:border-[#4f378a] focus:bg-white focus:ring-2 focus:ring-[#4f378a]/15"
              />
              <button type="submit" className="absolute right-1.5 top-1/2 inline-flex h-7 -translate-y-1/2 items-center gap-1 rounded bg-[#4f378a] px-3 text-[11px] font-bold uppercase tracking-wide text-white transition hover:bg-[#6750a4]">
                <Search size={13} /> Search
              </button>
            </label>
          </form>

          <div className="ml-auto flex items-center gap-1.5 md:gap-2">
            <button type="button" className="hidden h-9 w-9 items-center justify-center rounded-lg text-[#63597c] transition hover:bg-[#f2ecf4] hover:text-[#1d1b20] sm:inline-flex" aria-label="Messages">
              <MessageCircle size={20} />
            </button>
            <Link
              to={config.quickAccessPath}
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#63597c] transition hover:bg-[#f2ecf4] hover:text-[#1d1b20]"
              title="Notifications"
            >
              <Bell size={20} />
              {quickAccessBadgeCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-w-[1rem] items-center justify-center rounded-full border border-white bg-red-500 px-1 py-0.5 text-[10px] font-bold leading-none text-white">
                  {quickAccessBadgeCount > 99 ? '99+' : quickAccessBadgeCount}
                </span>
              ) : null}
            </Link>
            <div className="relative ml-1 border-l border-[#e6e0e9] pl-2 md:pl-3">
              <button
                type="button"
                onClick={() => setHeaderProfileOpen((current) => !current)}
                className="flex items-center gap-2 rounded-full bg-[#f2ecf4] py-1 pl-1 pr-2 transition hover:bg-[#e6e0e9]"
                aria-expanded={headerProfileOpen}
                aria-haspopup="menu"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt={workspaceName} className="h-8 w-8 rounded-full object-cover" loading="eager" referrerPolicy="no-referrer" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4f378a] text-[11px] font-bold text-white">{initials}</span>
                )}
                <span className="hidden text-left sm:block">
                  <span className="block max-w-[110px] truncate text-[13px] font-bold leading-tight text-[#1d1b20]">{workspaceName}</span>
                  <span className="block text-[11px] leading-tight text-[#63597c]">{config.profileRoleLabel}</span>
                </span>
                <ChevronDown size={16} className={cn('text-[#63597c] transition-transform', headerProfileOpen ? 'rotate-180' : '')} />
              </button>
              {headerProfileOpen ? (
                <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-[#cbc4d2]/60 bg-white p-2 shadow-2xl">
                  <div className="mb-1.5 flex items-center gap-3 rounded-lg bg-[#f8f2fa] px-3 py-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#4f378a] text-sm font-bold text-white">{initials}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#1d1b20]">{workspaceName}</p>
                      <p className="truncate text-xs text-[#63597c]">{workspaceSubtitle}</p>
                      {config.verifiedBadge ? (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#e9ddff] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#4f378a]">{config.verifiedBadge}</span>
                      ) : null}
                    </div>
                  </div>
                  {config.profileMenu.map((item) => (
                    <Link key={item.label} to={item.path} onClick={() => setHeaderProfileOpen(false)} className="group flex items-center gap-3 rounded-lg px-2 py-2 text-[#1d1b20] transition hover:bg-[#f8f2fa]">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f2ecf4] text-[#63597c] group-hover:bg-[#e9ddff] group-hover:text-[#4f378a]">{item.icon}</span>
                      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold leading-tight">{item.label}</span><span className="block truncate text-[11px] text-[#7a7582]">{item.detail}</span></span>
                      <ChevronRight size={15} className="text-[#7a7582]" />
                    </Link>
                  ))}
                  <div className="my-1 border-t border-[#ece6ee]" />
                  <Link to={config.helpPath} onClick={() => setHeaderProfileOpen(false)} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-semibold hover:bg-[#f8f2fa]"><HelpCircle size={18} className="text-[#63597c]" /> Help &amp; Support <ExternalLink size={14} className="ml-auto text-[#7a7582]" /></Link>
                  <button type="button" onClick={onLogout} className="mt-1 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm font-semibold text-[#ba1a1a] hover:bg-[#ffdad6]/40"><LogOut size={18} /> Logout</button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="seller-mobile-toolbar border-t border-slate-200 px-4 py-3 md:hidden">
        <form onSubmit={onSearchSubmit} className="mb-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" size={14} />
            <input
              type="search"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder={config.mobileSearchPlaceholder}
              className="h-9 w-full rounded-md border-none bg-[#f4f4f4] pl-9 pr-4 text-xs text-slate-700 outline-none transition focus:ring-1 focus:ring-primary/30"
            />
          </label>
        </form>
        <div className="dashboard-chip-scroll flex gap-2 overflow-x-auto pb-1">
          {config.mobileActions.map((action) => {
            const active = pathname === action.path;
            return (
              <Link
                key={action.path}
                to={action.path}
                className={cn('mobile-action-chip shrink-0', active ? 'mobile-action-chip--active' : '')}
              >
                {action.icon}
                <span>{action.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}