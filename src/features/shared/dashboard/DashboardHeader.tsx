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

  // The seller workspace renders the Stitch-aligned teal palette; every other
  // role keeps the existing purple dashboard header untouched.
  const isSeller = config.role === 'seller';
  const t = {
    rowBorder: isSeller ? 'border-lm-border' : 'border-[#ece6ee]',
    rowBg: isSeller ? 'bg-white' : 'bg-[#fdfbff]',
    divider: isSeller ? 'bg-lm-border' : 'bg-[#e6e0e9]',
    dividerBorder: isSeller ? 'border-lm-border' : 'border-[#e6e0e9]',
    brand: isSeller ? 'bg-lm-primary' : 'bg-[#4f378a]',
    heading: isSeller ? 'text-lm-heading' : 'text-[#1d1b20]',
    subtle: isSeller ? 'text-lm-meta' : 'text-[#63597c]',
    faint: isSeller ? 'text-lm-placeholder' : 'text-[#7a7582]',
    canvas: isSeller ? 'bg-lm-canvas' : 'bg-[#f8f2fa]',
    menuBorder: isSeller ? 'border-lm-border' : 'border-[#cbc4d2]/60',
    menuShadow: isSeller ? 'shadow-lm-3' : 'shadow-2xl',
    searchField: isSeller
      ? 'border-lm-border bg-lm-canvas text-lm-heading placeholder:text-lm-placeholder focus:border-lm-primary focus:bg-white focus:ring-lm-primary/15'
      : 'border-[#cbc4d2]/60 bg-[#f8f2fa] text-[#1d1b20] placeholder:text-[#7a7582] focus:border-[#4f378a] focus:bg-white focus:ring-[#4f378a]/15',
    searchSubmit: isSeller ? 'bg-lm-primary hover:bg-lm-primary-hover' : 'bg-[#4f378a] hover:bg-[#6750a4]',
    iconButton: isSeller ? 'text-lm-meta hover:bg-lm-canvas hover:text-lm-heading' : 'text-[#63597c] hover:bg-[#f2ecf4] hover:text-[#1d1b20]',
    badge: isSeller ? 'border-lm-surface bg-lm-danger' : 'border-white bg-red-500',
    profileTrigger: isSeller ? 'bg-lm-canvas hover:bg-lm-border-soft' : 'bg-[#f2ecf4] hover:bg-[#e6e0e9]',
    verified: isSeller ? 'bg-lm-primary-soft text-lm-primary-active' : 'bg-[#e9ddff] text-[#4f378a]',
    menuItemIcon: isSeller
      ? 'bg-lm-border-soft text-lm-meta group-hover:bg-lm-primary-soft group-hover:text-lm-primary-active'
      : 'bg-[#f2ecf4] text-[#63597c] group-hover:bg-[#e9ddff] group-hover:text-[#4f378a]',
    dangerText: isSeller ? 'text-lm-danger-text hover:bg-lm-danger-soft/40' : 'text-[#ba1a1a] hover:bg-[#ffdad6]/40',
    mobileField: isSeller
      ? 'bg-lm-canvas text-lm-heading focus:ring-lm-primary/30'
      : 'bg-[#f4f4f4] text-slate-700 focus:ring-primary/30',
    rowHover: isSeller ? 'hover:bg-lm-canvas' : 'hover:bg-[#f8f2fa]',
  };

  return (
    <div className="seller-topbar-shell">
      <div className={cn('seller-topbar-shell__row flex h-16 items-center gap-2 border-b', t.rowBorder, t.rowBg)}>
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
          <div className={cn('mr-1 hidden h-5 w-px lg:block', t.divider)} />
          <Link to={config.brandHome} className="hidden min-w-[150px] items-center gap-2 lg:flex">
            <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg text-white shadow-sm', t.brand)}>
              <Store size={19} />
            </span>
            <span className="min-w-0 leading-none">
              <span className={cn('block truncate text-base font-bold tracking-tight', t.heading)}>LofiMart</span>
              <span className={cn('mt-1 block truncate text-[10px] font-bold uppercase tracking-[0.16em]', t.subtle)}>{config.subtitle}</span>
            </span>
          </Link>

          <form onSubmit={onSearchSubmit} className="hidden min-w-0 max-w-xl flex-1 md:block lg:mx-auto">
            <label className="relative block">
              <Search className={cn('pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2', t.faint)} size={14} />
              <input
                type="search"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder={config.searchPlaceholder}
                className={cn('h-10 w-full rounded-lg border pl-10 pr-24 text-sm outline-none transition focus:ring-2', t.searchField)}
              />
              <button type="submit" className={cn('absolute right-1.5 top-1/2 inline-flex h-7 -translate-y-1/2 items-center gap-1 rounded px-3 text-[11px] font-bold uppercase tracking-wide text-white transition', t.searchSubmit)}>
                <Search size={13} /> Search
              </button>
            </label>
          </form>

          <div className="ml-auto flex items-center gap-1.5 md:gap-2">
            <button type="button" className={cn('hidden h-9 w-9 items-center justify-center rounded-lg transition sm:inline-flex', t.iconButton)} aria-label="Messages">
              <MessageCircle size={20} />
            </button>
            <Link
              to={config.quickAccessPath}
              className={cn('relative inline-flex h-9 w-9 items-center justify-center rounded-lg transition', t.iconButton)}
              title="Notifications"
            >
              <Bell size={20} />
              {quickAccessBadgeCount > 0 ? (
                <span className={cn('absolute -right-1 -top-1 inline-flex min-w-[1rem] items-center justify-center rounded-full border px-1 py-0.5 text-[10px] font-bold leading-none text-white', t.badge)}>
                  {quickAccessBadgeCount > 99 ? '99+' : quickAccessBadgeCount}
                </span>
              ) : null}
            </Link>
            <div className={cn('relative ml-1 border-l pl-2 md:pl-3', t.dividerBorder)}>
              <button
                type="button"
                onClick={() => setHeaderProfileOpen((current) => !current)}
                className={cn('flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition', t.profileTrigger)}
                aria-expanded={headerProfileOpen}
                aria-haspopup="menu"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt={workspaceName} className="h-8 w-8 rounded-full object-cover" loading="eager" referrerPolicy="no-referrer" />
                ) : (
                  <span className={cn('flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold text-white', t.brand)}>{initials}</span>
                )}
                <span className="hidden text-left sm:block">
                  <span className={cn('block max-w-[110px] truncate text-[13px] font-bold leading-tight', t.heading)}>{workspaceName}</span>
                  <span className={cn('block text-[11px] leading-tight', t.subtle)}>{config.profileRoleLabel}</span>
                </span>
                <ChevronDown size={16} className={cn('transition-transform', t.subtle, headerProfileOpen && 'rotate-180')} />
              </button>
              {headerProfileOpen ? (
                <div className={cn('absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border bg-white p-2', t.menuBorder, t.menuShadow)}>
                  <div className={cn('mb-1.5 flex items-center gap-3 rounded-lg px-3 py-3', t.canvas)}>
                    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white', t.brand)}>{initials}</span>
                    <div className="min-w-0">
                      <p className={cn('truncate text-sm font-bold', t.heading)}>{workspaceName}</p>
                      <p className={cn('truncate text-xs', t.subtle)}>{workspaceSubtitle}</p>
                      {config.verifiedBadge ? (
                        <span className={cn('mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', t.verified)}>{config.verifiedBadge}</span>
                      ) : null}
                    </div>
                  </div>
                  {config.profileMenu.map((item) => (
                    <Link key={item.label} to={item.path} onClick={() => setHeaderProfileOpen(false)} className={cn('group flex items-center gap-3 rounded-lg px-2 py-2 transition', t.rowHover, t.heading)}>
                      <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', t.menuItemIcon)}>{item.icon}</span>
                      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold leading-tight">{item.label}</span><span className={cn('block truncate text-[11px]', t.faint)}>{item.detail}</span></span>
                      <ChevronRight size={15} className={t.faint} />
                    </Link>
                  ))}
                  <div className={cn('my-1 border-t', t.rowBorder)} />
                  <Link to={config.helpPath} onClick={() => setHeaderProfileOpen(false)} className={cn('flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-semibold', t.rowHover)}><HelpCircle size={18} className={t.subtle} /> Help &amp; Support <ExternalLink size={14} className={cn('ml-auto', t.faint)} /></Link>
                  <button type="button" onClick={onLogout} className={cn('mt-1 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm font-semibold', t.dangerText)}><LogOut size={18} /> Logout</button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className={cn('seller-mobile-toolbar border-t px-4 py-3 md:hidden', isSeller ? 'border-lm-border bg-white' : 'border-slate-200')}>
        <form onSubmit={onSearchSubmit} className="mb-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" size={14} />
            <input
              type="search"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder={config.mobileSearchPlaceholder}
              className={cn('h-9 w-full rounded-md border-none pl-9 pr-4 text-xs outline-none transition focus:ring-1', t.mobileField)}
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