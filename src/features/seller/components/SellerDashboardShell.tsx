"use client";

import React from 'react';
import { Link } from '../../../lib/navigation';
import { cn } from '../../../lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/features/shared/ui/tooltip';
import {
  Bell,
  ChevronRight,
  ChevronsUpDown,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Store,
  User,
  X,
} from 'lucide-react';

type SellerMenuItem = {
  icon: React.ReactNode;
  label: string;
  path: string;
};

type SellerMenuSection = {
  title: string;
  items: SellerMenuItem[];
};

type SellerMobileHeaderAction = {
  label: string;
  path: string;
  icon: React.ReactNode;
};

interface SellerDashboardShellProps {
  children: React.ReactNode;
  collapsed: boolean;
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  mobileOpen: boolean;
  setMobileOpen: React.Dispatch<React.SetStateAction<boolean>>;
  pageLabel: string;
  sellerSearch: string;
  setSellerSearch: React.Dispatch<React.SetStateAction<string>>;
  onSearchSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  quickAccessBadgeCount: number;
  sellerWorkspaceName: string;
  sellerWorkspaceSubtitle: string;
  sellerInitials: string;
  avatarUrl?: string | null;
  currentSections: SellerMenuSection[];
  pathname: string;
  badges: Record<string, number>;
  sectionBadgeTotals: Record<string, number>;
  activeSectionTitles: string[];
  collapsedSections: string[];
  toggleSection: (title: string) => void;
  sellerFooterOpen: boolean;
  setSellerFooterOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sellerFooterRef: React.RefObject<HTMLDivElement | null>;
  mobileHeaderActions: SellerMobileHeaderAction[];
  onNavigate: (path: string) => void;
  onLogout: () => void;
}

export function SellerDashboardShell({
  children,
  collapsed,
  setCollapsed,
  mobileOpen,
  setMobileOpen,
  pageLabel,
  sellerSearch,
  setSellerSearch,
  onSearchSubmit,
  quickAccessBadgeCount,
  sellerWorkspaceName,
  sellerWorkspaceSubtitle,
  sellerInitials,
  avatarUrl,
  currentSections,
  pathname,
  badges,
  sectionBadgeTotals,
  activeSectionTitles,
  collapsedSections,
  toggleSection,
  sellerFooterOpen,
  setSellerFooterOpen,
  sellerFooterRef,
  mobileHeaderActions,
  onNavigate,
  onLogout,
}: SellerDashboardShellProps) {
  const [dashboardManageMode, setDashboardManageMode] = React.useState(true);

  const renderBrandMark = (compact = false) => (
    <Link to="/seller/dashboard" className={cn('flex min-w-0 items-center gap-2.5', compact ? 'justify-center' : '')}>
      <span className="flex aspect-square size-8 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
        <Package size={15} />
      </span>
      {!compact ? (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-black tracking-tight text-slate-950">{sellerWorkspaceName}</span>
          <span className="block truncate text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
            Seller Dashboard
          </span>
        </span>
      ) : null}
    </Link>
  );

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncDashboardMode = () => {
      setDashboardManageMode(window.localStorage.getItem('amarshop_seller_dashboard_manage_mode') === 'true');
    };

    syncDashboardMode();
    window.addEventListener('seller-dashboard-mode-change', syncDashboardMode);
    window.addEventListener('storage', syncDashboardMode);

    return () => {
      window.removeEventListener('seller-dashboard-mode-change', syncDashboardMode);
      window.removeEventListener('storage', syncDashboardMode);
    };
  }, []);

  const switchDashboardMode = React.useCallback(
    (nextManageMode: boolean) => {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('amarshop_seller_dashboard_manage_mode', nextManageMode ? 'true' : 'false');
        window.dispatchEvent(new Event('seller-dashboard-mode-change'));
      }
      setDashboardManageMode(nextManageMode);
      if (pathname !== '/seller/dashboard') {
        onNavigate('/seller/dashboard');
      }
    },
    [onNavigate, pathname],
  );

  const renderCollapsedSellerLink = (item: SellerMenuItem, isActive: boolean, badgeCount: number) => (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            to={item.path}
            className={cn(
              'seller-nav-link seller-nav-link--collapsed group relative flex w-full items-center justify-center rounded-md px-2 py-2 text-xs font-medium transition-all',
              isActive ? 'seller-nav-link--active text-slate-950' : 'text-muted-foreground',
            )}
          >
            <span className="dashboard-nav-link__icon h-8 w-8 shrink-0">{item.icon}</span>
            {badgeCount > 0 ? (
              <span className="absolute right-2 top-2 inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
            ) : null}
          </Link>
        }
      />
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );

  const renderCollapsedSellerSectionButton = (
    section: SellerMenuSection,
    isActive: boolean,
    badgeCount: number,
  ) => (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={() => {
              if (!collapsed) toggleSection(section.title);
            }}
            className={cn(
              'seller-nav-link seller-nav-link--collapsed group relative flex w-full items-center justify-center rounded-md px-2 py-2 text-xs font-medium transition-all',
              isActive ? 'seller-nav-link--active text-slate-950' : 'text-muted-foreground',
            )}
          >
            <span className="dashboard-nav-link__icon h-8 w-8 shrink-0">{section.items[0]?.icon ?? <Store size={14} />}</span>
            {badgeCount > 0 ? (
              <span className="absolute right-2 top-2 inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
            ) : null}
          </button>
        }
      />
      <TooltipContent side="right">{section.title}</TooltipContent>
    </Tooltip>
  );

  const renderSellerSidebar = () => (
    <div className="seller-sidebar-shell flex h-full max-h-[calc(100vh-56px)] min-h-0 flex-col overflow-hidden py-0">
      <div className="flex h-[56px] shrink-0 items-center border-b border-slate-200 px-4">
        {!collapsed ? renderBrandMark(false) : renderBrandMark(true)}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 pb-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-200">
        <div className="space-y-2.5">
          {currentSections.map((section) => (
            <div key={section.title} className="space-y-1.5">
              {section.items.length === 1 ? (
                (() => {
                  const item = section.items[0];
                  const isActive = pathname === item.path;
                  const badgeCount = Number(badges[item.path] || 0);
                  return (
                    collapsed ? renderCollapsedSellerLink(item, isActive, badgeCount) : (
                      <Link
                        to={item.path}
                        className={cn(
                          'seller-nav-link seller-nav-link--row group relative flex h-8 w-full items-center gap-2 rounded-md px-3 text-xs font-medium transition-all',
                          isActive ? 'seller-nav-link--active text-slate-950' : 'text-muted-foreground',
                        )}
                      >
                        <span className="dashboard-nav-link__icon h-8 w-8 shrink-0">{item.icon}</span>
                        <span className="dashboard-nav-link__label flex-1">{item.label}</span>
                        {badgeCount > 0 ? (
                          <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                            {badgeCount > 99 ? '99+' : badgeCount}
                          </span>
                        ) : null}
                      </Link>
                    )
                  );
                })()
              ) : (
                <>
                  {collapsed ? renderCollapsedSellerSectionButton(
                    section,
                    activeSectionTitles.includes(section.title),
                    Number(sectionBadgeTotals[section.title] || 0),
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (!collapsed) toggleSection(section.title);
                      }}
                      className={cn(
                        'seller-nav-link seller-nav-link--row group relative flex h-8 w-full items-center gap-2 rounded-md px-3 text-left text-xs font-medium transition-all',
                        activeSectionTitles.includes(section.title) ? 'seller-nav-link--active text-slate-950' : 'text-muted-foreground',
                      )}
                    >
                      <span className="dashboard-nav-link__icon h-8 w-8 shrink-0">{section.items[0]?.icon ?? <Store size={14} />}</span>
                      <span className="dashboard-nav-link__label flex-1">{section.title}</span>
                      {Number(sectionBadgeTotals[section.title] || 0) > 0 ? (
                        <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                          {sectionBadgeTotals[section.title] > 99 ? '99+' : sectionBadgeTotals[section.title]}
                        </span>
                      ) : null}
                      <ChevronRight
                        size={12}
                        className={cn(
                          'ml-auto transition-transform duration-200',
                          collapsedSections.includes(section.title) ? '' : 'rotate-90',
                        )}
                      />
                    </button>
                  )}

                  {!collapsed && !collapsedSections.includes(section.title) ? (
                    <div className="ml-4 pl-2">
                      {section.items.map((item) => {
                        const itemActive = pathname === item.path;
                        const badgeCount = Number(badges[item.path] || 0);
                        return (
                          <Link
                            key={`${section.title}-${item.label}-${item.path}`}
                            to={item.path}
                            className={cn(
                              'seller-sub-nav-link flex h-7 items-center gap-2 rounded-md px-2 text-[11px] transition',
                              itemActive ? 'bg-slate-100 font-semibold text-slate-950' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900',
                            )}
                          >
                            <span className="flex-1 truncate">{item.label}</span>
                            {badgeCount > 0 ? (
                              <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                                {badgeCount > 99 ? '99+' : badgeCount}
                              </span>
                            ) : null}
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div ref={sellerFooterRef} className="relative border-t border-slate-200 px-2 py-2">
        {!collapsed ? (
          <div className="rounded-lg">
            <button
              type="button"
              onClick={() => setSellerFooterOpen((current) => !current)}
              className={cn(
                'seller-footer-trigger flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition',
                sellerFooterOpen ? 'bg-slate-100 text-slate-950' : 'hover:bg-slate-100',
              )}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={sellerWorkspaceName}
                  className="h-8 w-8 rounded-lg border border-slate-200 object-cover"
                  loading="eager"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-bold text-slate-700">
                  {sellerInitials}
                </div>
              )}
              <div className="min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="block truncate font-semibold text-slate-900">{sellerWorkspaceName}</span>
                <span className="block truncate text-xs text-slate-500">{sellerWorkspaceSubtitle}</span>
              </div>
              <ChevronsUpDown size={16} className="text-slate-400" />
            </button>

            {sellerFooterOpen ? (
              <div className="seller-footer-menu absolute inset-x-2 bottom-[calc(100%+0.5rem)] z-30 rounded-lg border border-slate-200 bg-white p-1 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.28)]">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={sellerWorkspaceName}
                      className="h-8 w-8 rounded-lg border border-slate-200 object-cover"
                      loading="eager"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-bold text-slate-700">
                      {sellerInitials}
                    </div>
                  )}
                  <div className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate font-semibold text-slate-900">{sellerWorkspaceName}</span>
                    <span className="block truncate text-xs text-slate-500">{sellerWorkspaceSubtitle}</span>
                  </div>
                </div>
                <div className="my-1 border-t border-slate-200" />
                <button
                  type="button"
                  onClick={() => onNavigate('/seller/settings')}
                  className="seller-footer-menu__item flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  <User size={16} />
                  <span>Account</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('/seller/settings')}
                  className="seller-footer-menu__item flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  <Settings size={16} />
                  <span>Settings</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('/seller/notifications')}
                  className="seller-footer-menu__item flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  <Bell size={16} />
                  <span>Notifications</span>
                </button>
                <button
                  type="button"
                  onClick={onLogout}
                  className="seller-footer-menu__item flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-rose-600"
                >
                  <LogOut size={16} />
                  <span>Log out</span>
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onNavigate('/seller/settings')}
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
            aria-label="Seller account"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={sellerWorkspaceName}
                className="h-8 w-8 rounded-lg border border-slate-200 object-cover"
                loading="eager"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-bold text-slate-700">
                {sellerInitials}
              </div>
            )}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <TooltipProvider>
      <div className="dashboard-shell seller-app-shell">
      <div className="seller-topbar-shell">
        <div className="seller-topbar-shell__row flex h-[56px] items-center gap-2 bg-white">
          <div className="flex w-full items-center gap-2 px-4 md:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="seller-mobile-trigger inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-700 transition hover:bg-slate-100 lg:hidden"
              aria-label="Open seller dashboard menu"
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
            <div className="mr-2 hidden h-4 w-px bg-slate-200 lg:block" />
            <div className="hidden lg:block">{renderBrandMark(false)}</div>
            <div className="ml-2 hidden h-4 w-px bg-slate-200 lg:block" />

            <form onSubmit={onSearchSubmit} className="hidden max-w-[300px] min-w-0 flex-1 md:block">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" size={14} />
                <input
                  type="search"
                  value={sellerSearch}
                  onChange={(event) => setSellerSearch(event.target.value)}
                  placeholder="Search products, orders or customers..."
                  className="h-9 w-full rounded-lg border-none bg-[#f4f4f4] pl-9 pr-4 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:ring-1 focus:ring-primary/30"
                />
              </label>
            </form>

            <div className="ml-auto flex items-center gap-3 md:gap-4">
              <p className="hidden h-8 items-center rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-bold uppercase tracking-wide text-slate-600 lg:inline-flex">
                Dashboard
              </p>
            <div className="hidden items-center rounded-full border border-slate-200 bg-slate-50 p-1 md:inline-flex">
                <button
                  type="button"
                  onClick={() => switchDashboardMode(false)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition',
                    !dashboardManageMode ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  <Store size={14} />
                  Storefront Mode
                </button>
                <button
                  type="button"
                  onClick={() => switchDashboardMode(true)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition',
                    dashboardManageMode ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  <Package size={14} />
                  Manage Mode
                </button>
              </div>
              <Link
                to="/seller/notifications"
                className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100 hover:text-primary"
                title="Notifications"
              >
                <Bell size={16} />
                {quickAccessBadgeCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-w-[1rem] items-center justify-center rounded-full border border-white bg-red-500 px-1 py-0.5 text-[10px] font-bold leading-none text-white">
                    {quickAccessBadgeCount > 99 ? '99+' : quickAccessBadgeCount}
                  </span>
                ) : null}
              </Link>
              <div className="flex items-center gap-2.5 border-l border-slate-200 pl-3 md:gap-3 md:pl-4">
                <div className="hidden text-right sm:block">
                  <div className="text-[11px] font-bold leading-none text-slate-950">{sellerWorkspaceName}</div>
                  <div className="mt-1 text-[10px] leading-none text-slate-500">Premium Seller</div>
                </div>
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={sellerWorkspaceName}
                    className="h-7 w-7 rounded-lg border border-slate-200 object-cover"
                    loading="eager"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-700">
                    {sellerInitials}
                  </span>
                )}
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
                value={sellerSearch}
                onChange={(event) => setSellerSearch(event.target.value)}
                placeholder="Search products, orders or customers..."
                className="h-9 w-full rounded-md border-none bg-[#f4f4f4] pl-9 pr-4 text-xs text-slate-700 outline-none transition focus:ring-1 focus:ring-primary/30"
              />
            </label>
          </form>
          <div className="dashboard-chip-scroll flex gap-2 overflow-x-auto pb-1">
            {mobileHeaderActions.map((action) => {
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

      <div className="seller-app-frame">
        <aside className={cn('seller-sidebar-wrap hidden h-[calc(100vh-56px)] self-start transition-all duration-300 lg:sticky lg:top-0 lg:block lg:overflow-hidden', collapsed ? 'lg:w-[72px]' : 'lg:w-[220px]')}>
          <div className="h-full">{renderSellerSidebar()}</div>
        </aside>

        <main className="seller-main-content">{children}</main>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close dashboard menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
          />
          <div className="absolute inset-y-0 left-0 w-[18rem] max-w-[88vw] p-0">
            <div className="seller-sidebar-shell flex h-full flex-col rounded-none shadow-none">
              <div className="flex h-[56px] items-center justify-between border-b border-slate-200 bg-white px-4">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-black text-slate-950">LofiMart</h2>
                  <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Seller Dashboard</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-700 transition hover:bg-slate-100"
                  aria-label="Close dashboard menu"
                >
                  <X size={17} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto bg-white p-0">{renderSellerSidebar()}</div>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </TooltipProvider>
  );
}
