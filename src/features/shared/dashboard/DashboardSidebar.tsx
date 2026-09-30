"use client";

import React from 'react';
import { Link } from '../../../lib/navigation';
import { cn } from '../../../lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/features/shared/ui/tooltip';
import { ChevronRight, Store, X } from 'lucide-react';
import type { DashboardMenuItem, DashboardMenuSection } from './dashboard.types';

interface DashboardSidebarProps {
  collapsed: boolean;
  currentSections: DashboardMenuSection[];
  footerMenu: DashboardMenuItem[];
  pathname: string;
  badges: Record<string, number>;
  sectionBadgeTotals: Record<string, number>;
  activeSectionTitles: string[];
  collapsedSections: string[];
  toggleSection: (title: string) => void;
  mobileOpen: boolean;
  setMobileOpen: React.Dispatch<React.SetStateAction<boolean>>;
  subtitle: string;
}

export function DashboardSidebar({
  collapsed,
  currentSections,
  footerMenu,
  pathname,
  badges,
  sectionBadgeTotals,
  activeSectionTitles,
  collapsedSections,
  toggleSection,
  mobileOpen,
  setMobileOpen,
  subtitle,
}: DashboardSidebarProps) {
  const drawerCloseRef = React.useRef<HTMLButtonElement | null>(null);

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
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen, setMobileOpen]);

  const renderCollapsedLink = (item: DashboardMenuItem, isActive: boolean, badgeCount: number) => (
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

  const renderCollapsedSectionButton = (
    section: DashboardMenuSection,
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

  const renderNavContent = () => (
    <div className="space-y-2.5">
      {currentSections.map((section) => (
        <div key={section.title} className="space-y-1.5">
          {section.items.length === 1 ? (
            (() => {
              const item = section.items[0];
              const isActive = pathname === item.path;
              const badgeCount = Number(badges[item.path] || 0);
              return (
                collapsed ? renderCollapsedLink(item, isActive, badgeCount) : (
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
              {collapsed ? renderCollapsedSectionButton(
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
                          'flex h-7 items-center gap-2 rounded-md px-2 text-[11px] transition',
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
  );

  const renderFooter = () => {
    if (footerMenu.length === 0) return null;
    return (
      <div className={cn('space-y-1 border-t border-slate-100 px-2 py-2', collapsed ? 'flex flex-col items-center' : '')}>
        {footerMenu.map((item) => {
        const isActive = pathname === item.path;
        return collapsed ? (
          <Tooltip key={item.path}>
            <TooltipTrigger
              render={
                <Link
                  to={item.path}
                  className={cn(
                    'seller-nav-link seller-nav-link--collapsed group relative flex w-full items-center justify-center rounded-md px-2 py-2 text-xs font-medium transition-all',
                    isActive
                      ? 'seller-nav-link--active text-slate-950'
                      : 'text-muted-foreground',
                  )}
                >
                  <span className="dashboard-nav-link__icon h-8 w-8 shrink-0">
                    {item.icon}
                  </span>
                </Link>
              }
            />
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        ) : (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              'seller-nav-link seller-nav-link--row group relative flex h-8 w-full items-center gap-2 rounded-md px-3 text-xs font-medium transition-all',
              isActive
                ? 'seller-nav-link--active text-slate-950'
                : 'text-muted-foreground',
            )}
          >
            <span className="dashboard-nav-link__icon h-8 w-8 shrink-0">
              {item.icon}
            </span>
            <span className="dashboard-nav-link__label flex-1">
              {item.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
};

  return (
    <TooltipProvider>
      <aside
        className={cn(
          'seller-sidebar-wrap hidden h-[calc(100vh-64px)] self-start transition-all duration-300 lg:sticky lg:top-0 lg:block lg:overflow-hidden',
          collapsed ? 'lg:w-[72px]' : 'lg:w-[220px]',
        )}
      >
        <div className="h-full">
          <div className="seller-sidebar-shell flex h-full max-h-[calc(100vh-56px)] min-h-0 flex-col overflow-hidden py-0">
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pt-4 px-2 pb-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-200">
              {renderNavContent()}
            </div>
            {renderFooter()}
          </div>
        </div>
      </aside>

      {mobileOpen ? (
        <div
          id="dashboard-mobile-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dashboard-drawer-title"
          className="fixed inset-0 z-50 lg:hidden"
        >
          <button
            type="button"
            aria-label="Close dashboard menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
          />
          <div className="absolute inset-y-0 left-0 w-[18rem] max-w-[88vw] p-0">
            <div className="seller-sidebar-shell seller-sidebar-shell--mobile flex h-full flex-col rounded-none shadow-none">
              <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#ece6ee] bg-[#fdfbff] px-4">
                <div className="min-w-0">
                  <h2 id="dashboard-drawer-title" className="truncate text-base font-bold text-[#1d1b20]">LofiMart</h2>
                  <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.18em] text-[#63597c]">{subtitle}</p>
                </div>
                <button
                  ref={drawerCloseRef}
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-700 transition hover:bg-slate-100"
                  aria-label="Close dashboard menu"
                >
                  <X size={17} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto bg-white p-0">
                {renderNavContent()}
              </div>
              {renderFooter()}
            </div>
          </div>
        </div>
      ) : null}
    </TooltipProvider>
  );
}