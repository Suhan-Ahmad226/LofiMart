"use client";

import React from 'react';
import { Link } from '../../../lib/navigation';
import { cn } from '../../../lib/utils';
import { SellerSidebar } from '@/features/seller/components/SellerSidebar';
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
  // The seller workspace renders the Stitch-aligned rail; every other role
  // keeps the legacy DashboardSidebar.
  const isSeller = config.role === 'seller';

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

      <div className={cn('seller-app-frame', isSeller && 'seller-app-frame--rail')}>
        {isSeller ? (
          <SellerSidebar
            collapsed={collapsed}
            currentSections={config.sections}
            pathname={pathname}
            badges={badges}
            sectionBadgeTotals={sectionBadgeTotals}
            activeSectionTitles={activeSectionTitles}
            collapsedSections={collapsedSections}
            toggleSection={toggleSection}
            mobileOpen={mobileOpen}
            setMobileOpen={setMobileOpen}
            subtitle={config.subtitle}
            morePath={config.moreHubPath}
            moreLabel="More"
          />
        ) : (
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
        )}

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
            <div
              className={cn(
                'flex items-stretch justify-around border-t bg-white/95 px-1 pb-[env(safe-area-inset-bottom)]',
                isSeller ? 'border-lm-border backdrop-blur-xl' : 'border-border px-2 pt-1 backdrop-blur',
              )}
            >
              {config.bottomNav.map((item) => {
                const active = activeMenuEntryPath === item.path || pathname.startsWith(`${item.path}/`);

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      isSeller
                        ? 'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 transition'
                        : 'flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-semibold transition',
                      isSeller
                        ? active
                          ? 'text-lm-primary-active'
                          : 'text-lm-meta'
                        : active
                          ? 'text-primary'
                          : 'text-slate-400',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex h-8 w-8 items-center justify-center transition',
                        isSeller ? 'rounded-lm-md' : 'rounded-xl',
                        isSeller
                          ? active
                            ? 'bg-lm-primary-soft'
                            : ''
                          : active
                            ? 'bg-primary/10 text-primary'
                            : '',
                      )}
                    >
                      {item.icon}
                    </span>
                    {isSeller ? (
                      <span className="max-w-full truncate text-[11px] font-semibold leading-4">{item.label}</span>
                    ) : (
                      item.label
                    )}
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