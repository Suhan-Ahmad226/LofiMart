"use client";

import React from 'react';
import { Link } from '../../../lib/navigation';
import { cn } from '../../../lib/utils';
import { DashboardHeader } from './DashboardHeader';
import { DashboardSidebar } from './DashboardSidebar';
import type { DashboardConfig } from './dashboard.types';

interface DashboardShellProps {
  children: React.ReactNode;
  config: DashboardConfig;
  collapsed: boolean;
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  mobileOpen: boolean;
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
  badges: Record<string, number>;
  sectionBadgeTotals: Record<string, number>;
  activeSectionTitles: string[];
  collapsedSections: string[];
  toggleSection: (title: string) => void;
  activeMenuEntryPath: string | null;
  onLogout: () => void;
}

export function DashboardShell({
  children,
  config,
  collapsed,
  setCollapsed,
  mobileOpen,
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
  badges,
  sectionBadgeTotals,
  activeSectionTitles,
  collapsedSections,
  toggleSection,
  activeMenuEntryPath,
  onLogout,
}: DashboardShellProps) {
  const hasBottomNav = config.bottomNav.length > 0;

  return (
    <div className="dashboard-shell seller-app-shell">
      <DashboardHeader
        config={config}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        setMobileOpen={setMobileOpen}
        searchValue={searchValue}
        setSearchValue={setSearchValue}
        onSearchSubmit={onSearchSubmit}
        quickAccessBadgeCount={quickAccessBadgeCount}
        workspaceName={workspaceName}
        workspaceSubtitle={workspaceSubtitle}
        initials={initials}
        avatarUrl={avatarUrl}
        pathname={pathname}
        onLogout={onLogout}
      />

      <div className="seller-app-frame">
        <DashboardSidebar
          collapsed={collapsed}
          currentSections={config.sections}
          footerMenu={config.footerMenu}
          pathname={pathname}
          badges={badges}
          sectionBadgeTotals={sectionBadgeTotals}
          activeSectionTitles={activeSectionTitles}
          collapsedSections={collapsedSections}
          toggleSection={toggleSection}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
          subtitle={config.subtitle}
        />

        <main
          className={cn(
            'seller-main-content',
            hasBottomNav ? 'pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] md:pb-0' : '',
          )}
        >
          {children}
        </main>
      </div>

      {hasBottomNav ? (
        <nav className="app-bottom-nav fixed inset-x-0 bottom-0 z-40 md:hidden" aria-label="Mobile dashboard navigation">
          <div className="mx-auto max-w-lg">
            <div className="flex items-center justify-around border-t border-border bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur">
              {config.bottomNav.map((item) => {
                const active = activeMenuEntryPath === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-semibold transition',
                      active ? 'text-primary' : 'text-slate-400',
                    )}
                  >
                    <span className={cn('flex h-8 w-8 items-center justify-center rounded-xl', active ? 'bg-primary/10 text-primary' : '')}>
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>
      ) : null}
    </div>
  );
}