'use client';

import React from 'react';
import { Link } from '../../../lib/navigation';
import { cn } from '../../../lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/features/shared/ui/tooltip';
import { ChevronDown, HelpCircle, LayoutGrid, X } from 'lucide-react';
import type { DashboardMenuSection } from '@/features/shared/dashboard/dashboard.types';

interface SellerSidebarProps {
  collapsed: boolean;
  currentSections: DashboardMenuSection[];
  pathname: string;
  badges: Record<string, number>;
  sectionBadgeTotals: Record<string, number>;
  activeSectionTitles: string[];
  collapsedSections: string[];
  toggleSection: (title: string) => void;
  mobileOpen: boolean;
  setMobileOpen: React.Dispatch<React.SetStateAction<boolean>>;
  subtitle: string;
  morePath?: string;
  moreBadgeCount?: number;
  moreLabel?: string;
}

/** Seller Center navigation with compact section icons, nested guide rails, badges and accessible mobile drawer. */
export function SellerSidebar({
  collapsed,
  currentSections,
  pathname,
  badges,
  sectionBadgeTotals,
  activeSectionTitles,
  collapsedSections,
  toggleSection,
  mobileOpen,
  setMobileOpen,
  subtitle,
  morePath,
  moreBadgeCount = 0,
  moreLabel = 'More',
}: SellerSidebarProps) {
  const drawerCloseRef = React.useRef<HTMLButtonElement | null>(null);
  const drawerPanelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (mobileOpen) drawerCloseRef.current?.focus();
  }, [mobileOpen]);

  React.useEffect(() => {
    if (!mobileOpen || typeof window === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = drawerPanelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen, setMobileOpen]);

  const isActivePath = (itemPath: string) => itemPath === pathname || pathname.startsWith(`${itemPath}/`);

  const renderBadge = (count: number, compact = false) => {
    if (count <= 0) return null;
    return (
      <span
        className={cn(
          'lm-numeric inline-flex shrink-0 items-center justify-center rounded-full font-bold',
          compact ? 'h-1.5 w-1.5 bg-lm-primary p-0' : 'min-w-6 bg-lm-canvas px-2 py-0.5 text-[11px] text-lm-meta',
        )}
        aria-label={`${count} items`}
      >
        {!compact && (count > 99 ? '99+' : count)}
      </span>
    );
  };

  const renderNavContent = () => (
    <div className="space-y-1.5">
      {currentSections.map((section) => {
        const sectionBadgeTotal = Number(sectionBadgeTotals[section.title] || 0);
        const sectionActive = activeSectionTitles.includes(section.title);
        const isOpen = !collapsedSections.includes(section.title);
        const firstItem = section.items[0];
        if (!firstItem) return null;

        if (collapsed) {
          return (
            <Tooltip key={section.title}>
              <TooltipTrigger
                render={
                  <Link
                    to={firstItem.path}
                    aria-label={section.title}
                    className={cn(
                      'relative mx-auto flex h-10 w-10 items-center justify-center rounded-xl text-lm-meta transition-colors',
                      sectionActive ? 'bg-lm-primary-soft text-lm-primary-active' : 'hover:bg-slate-100 hover:text-lm-heading',
                    )}
                  >
                    <span aria-hidden="true">{firstItem.icon}</span>
                    {sectionBadgeTotal > 0 ? <span className="absolute right-1 top-1">{renderBadge(sectionBadgeTotal, true)}</span> : null}
                  </Link>
                }
              />
              <TooltipContent side="right">{section.title}</TooltipContent>
            </Tooltip>
          );
        }

        return (
          <div key={section.title} className="space-y-1">
            <button
              type="button"
              onClick={() => toggleSection(section.title)}
              aria-expanded={isOpen}
              className={cn(
                'group flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-[13px] font-medium transition-colors',
                sectionActive ? 'text-lm-heading' : 'text-lm-meta hover:bg-lm-canvas hover:text-lm-heading',
              )}
            >
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors', sectionActive ? 'bg-lm-primary-soft text-lm-primary-active' : 'bg-lm-canvas text-lm-primary')}>
                {firstItem.icon ?? <LayoutGrid size={18} />}
              </span>
              <span className="flex-1 truncate font-semibold">{section.title}</span>
              {sectionBadgeTotal > 0 ? renderBadge(sectionBadgeTotal) : null}
              <ChevronDown size={15} aria-hidden="true" className={cn('shrink-0 text-slate-400 transition-transform duration-200', !isOpen && '-rotate-90')} />
            </button>

            {isOpen ? (
              <div className="ml-[1.15rem] border-l border-slate-200 pl-3 pr-1">
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const itemActive = isActivePath(item.path);
                    const badgeCount = Number(badges[item.path] || 0);
                    return (
                      <Link
                        key={`${section.title}-${item.label}-${item.path}`}
                        to={item.path}
                        aria-current={itemActive ? 'page' : undefined}
                        className={cn(
                          'flex min-h-10 items-center justify-between gap-2 rounded-lg px-3 text-[13px] transition-colors',
                          itemActive ? 'bg-lm-primary-soft font-semibold text-lm-primary-active' : 'text-lm-meta hover:bg-lm-canvas hover:text-lm-heading',
                        )}
                      >
                        <span className="truncate">{item.label}</span>
                        {badgeCount > 0 ? renderBadge(badgeCount) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      {morePath ? (
        <Link
          to={morePath}
          aria-current={isActivePath(morePath) ? 'page' : undefined}
          className={cn(
            'mt-2 flex min-h-10 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold transition-colors',
            isActivePath(morePath) ? 'bg-lm-primary-soft text-lm-primary-active' : 'text-lm-meta hover:bg-lm-canvas hover:text-lm-heading',
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-lm-canvas text-lm-primary"><LayoutGrid size={18} /></span>
          <span className="flex-1 truncate">{moreLabel}</span>
          {moreBadgeCount > 0 ? renderBadge(moreBadgeCount) : null}
        </Link>
      ) : null}
    </div>
  );

  return (
    <TooltipProvider>
      <aside className={cn('seller-sidebar-wrap sticky top-16 hidden h-[calc(100vh-4rem)] self-start overflow-hidden transition-[width] duration-300 lg:block', collapsed ? 'lg:w-[var(--lm-rail-width-collapsed)]' : 'lg:w-[var(--lm-rail-width)]')}>
        <div className="seller-sidebar-shell flex h-full min-h-0 flex-col overflow-hidden">
          {!collapsed ? (
            <div className="shrink-0 border-b border-slate-200 px-4 py-3">
              <div className="text-sm font-bold tracking-tight text-lm-heading">LofiMart</div>
              <div className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-lm-meta">Seller Center</div>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-200">{renderNavContent()}</div>
          <div className="shrink-0 border-t border-slate-200 bg-white/70 p-3">
            <Link to="/help" className="flex min-h-9 items-center gap-2 rounded-lg px-2 py-2 text-lm-meta transition hover:bg-lm-canvas hover:text-lm-heading">
              <HelpCircle size={17} />
              {!collapsed ? <span className="truncate text-[12px] font-semibold">Help Center</span> : null}
            </Link>
          </div>
        </div>
      </aside>

      {mobileOpen ? (
        <div id="seller-mobile-drawer" role="dialog" aria-modal="true" aria-labelledby="seller-drawer-title" className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close seller menu" onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" />
          <div className="absolute inset-y-0 left-0 w-[19rem] max-w-[88vw]">
            <div ref={drawerPanelRef} className="seller-sidebar-shell seller-sidebar-shell--mobile flex h-full flex-col bg-white shadow-2xl">
              <div className="flex h-[4.25rem] shrink-0 items-center justify-between border-b border-slate-200 px-4">
                <div className="min-w-0">
                  <h2 id="seller-drawer-title" className="truncate text-base font-bold tracking-tight text-lm-heading">LofiMart</h2>
                  <p className="mt-0.5 truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-lm-meta">Seller Center · {subtitle}</p>
                </div>
                <button ref={drawerCloseRef} type="button" onClick={() => setMobileOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-xl text-lm-meta transition hover:bg-lm-canvas hover:text-lm-heading" aria-label="Close seller menu">
                  <X size={19} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">{renderNavContent()}</div>
              <div className="border-t border-slate-200 bg-slate-50/70 p-3">
                <Link to="/help" className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-lm-meta hover:bg-white hover:text-lm-heading"><HelpCircle size={18} />Help Center</Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </TooltipProvider>
  );
}
