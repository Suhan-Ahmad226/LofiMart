'use client';

import React from 'react';
import { Link } from '../../../lib/navigation';
import { cn } from '../../../lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/features/shared/ui/tooltip';
import { ChevronRight, LayoutGrid, X } from 'lucide-react';
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
  /** Badge count for the "More" destination, resolved by the layout. */
  morePath?: string;
  moreBadgeCount?: number;
  moreLabel?: string;
}

/**
 * Seller-specific left rail.
 *
 * The shared DashboardSidebar keeps the legacy platform look for admin,
 * customer and reseller. This rail implements the Stitch Seller Center
 * navigation instead: a 260px desktop rail (64px when collapsed) built from
 * `lm-*` primitives, with 44px touch targets and a primary-teal active state.
 */
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
    if (mobileOpen) {
      drawerCloseRef.current?.focus();
    }
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

      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

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

  const isActivePath = (itemPath: string) => {
    if (itemPath === pathname) return true;
    return pathname.startsWith(`${itemPath}/`);
  };

  const renderBadge = (count: number, tone: 'chip' | 'dot') => {
    if (count <= 0) return null;

    if (tone === 'dot') {
      return <span aria-hidden="true" className="absolute right-2 top-2 h-2 w-2 rounded-full bg-lm-primary" />;
    }

    return (
      <span className="lm-numeric inline-flex min-w-[1.5rem] shrink-0 items-center justify-center rounded-full bg-lm-canvas px-2 py-0.5 text-[11px] font-bold text-lm-meta">
        {count > 99 ? '99+' : count}
      </span>
    );
  };

  const renderNavContent = () => (
    <div className="space-y-1">
      {currentSections.map((section) => {
        const sectionBadgeTotal = Number(sectionBadgeTotals[section.title] || 0);
        const sectionActive = activeSectionTitles.includes(section.title);
        const isOpen = !collapsedSections.includes(section.title);

        if (collapsed) {
          const firstItem = section.items[0];
          if (!firstItem) return null;

          return (
            <Tooltip key={section.title}>
              <TooltipTrigger
                render={
                  <Link
                    to={firstItem.path}
                    className="relative flex w-full items-center justify-center rounded-lm py-2 text-lm-meta transition hover:bg-slate-100 hover:text-lm-heading"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lm-md">
                      {firstItem.icon}
                    </span>
                    {sectionBadgeTotal > 0 ? (
                      <span aria-hidden="true" className="absolute right-2 top-2 h-2 w-2 rounded-full bg-lm-primary" />
                    ) : null}
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
                'lm-rail-link w-full text-left',
                sectionActive && 'text-lm-heading',
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lm-md bg-lm-canvas text-lm-primary">
                {section.items[0]?.icon ?? <LayoutGrid size={18} />}
              </span>
              <span className="flex-1 truncate">{section.title}</span>
              {sectionBadgeTotal > 0 ? renderBadge(sectionBadgeTotal, 'chip') : null}
              <ChevronRight
                size={14}
                aria-hidden="true"
                className={cn('shrink-0 transition-transform duration-200', isOpen ? 'rotate-90' : '')}
              />
            </button>

            {isOpen ? (
              <div className="ml-5 flex flex-col gap-0.5 border-l border-slate-100 pl-3">
                {section.items.map((item) => {
                  const itemActive = isActivePath(item.path);
                  const badgeCount = Number(badges[item.path] || 0);

                  return (
                    <Link
                      key={`${section.title}-${item.label}-${item.path}`}
                      to={item.path}
                      aria-current={itemActive ? 'page' : undefined}
                      className={cn(
                        'flex min-h-10 items-center justify-between gap-2 rounded-lm px-3 text-[13px] transition',
                        itemActive
                          ? 'bg-lm-primary-soft font-semibold text-lm-primary-active'
                          : 'text-lm-meta hover:bg-slate-50 hover:text-lm-heading',
                      )}
                    >
                      <span className="truncate">{item.label}</span>
                      {badgeCount > 0 ? renderBadge(badgeCount, 'chip') : null}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}

      {morePath ? (
        <Link
          to={morePath}
          aria-current={isActivePath(morePath) ? 'page' : undefined}
          className={cn('lm-rail-link', isActivePath(morePath) && 'lm-rail-link--active')}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lm-md bg-lm-canvas text-lm-primary">
            <LayoutGrid size={18} />
          </span>
          <span className="flex-1 truncate">{moreLabel}</span>
          {moreBadgeCount > 0 ? renderBadge(moreBadgeCount, 'chip') : null}
        </Link>
      ) : null}
    </div>
  );

  return (
    <TooltipProvider>
      <aside
        className={cn(
          'seller-sidebar-wrap sticky top-16 hidden h-[calc(100vh-4rem)] self-start overflow-hidden transition-[width] duration-300 lg:block',
          collapsed ? 'lg:w-[var(--lm-rail-width-collapsed)]' : 'lg:w-[var(--lm-rail-width)]',
        )}
      >
        <div className="seller-sidebar-shell flex h-full min-h-0 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-200">
            {renderNavContent()}
          </div>
        </div>
      </aside>

      {mobileOpen ? (
        <div
          id="seller-mobile-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="seller-drawer-title"
          className="fixed inset-0 z-50 lg:hidden"
        >
          <button
            type="button"
            aria-label="Close seller menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
          />
          <div className="absolute inset-y-0 left-0 w-[18rem] max-w-[88vw]">
            <div
              ref={drawerPanelRef}
              className="seller-sidebar-shell seller-sidebar-shell--mobile flex h-full flex-col bg-white shadow-none"
            >
              <div className="flex h-16 shrink-0 items-center justify-between border-b border-lm-border px-4">
                <div className="min-w-0">
                  <h2 id="seller-drawer-title" className="truncate text-base font-bold text-lm-heading">
                    LofiMart
                  </h2>
                  <p className="lm-label-sm mt-0.5 truncate">{subtitle}</p>
                </div>
                <button
                  ref={drawerCloseRef}
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="lm-icon-btn"
                  aria-label="Close seller menu"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">{renderNavContent()}</div>
            </div>
          </div>
        </div>
      ) : null}
    </TooltipProvider>
  );
}
