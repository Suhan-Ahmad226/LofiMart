'use client';

import React from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Link } from '@/lib/navigation';
import { useUser } from '@/features/shared/state/UserContext';
import { DASHBOARD_CONFIG } from '@/features/shared/dashboard/dashboard.config';
import type { DashboardMoreGroup } from '@/features/shared/dashboard/dashboard.types';

const config = DASHBOARD_CONFIG.seller;

/**
 * Seller "More" hub.
 *
 * The Stitch Seller Center shell exposes four mobile tab-bar destinations
 * (Home / Orders / Products / More). Everything else a merchant needs lives
 * here, grouped exactly as the Stitch More Hub groups it. The destination list
 * is derived from the same `dashboard.config` source of truth that drives the
 * rail, so adding a seller route updates both surfaces at once.
 */
export function SellerMoreHub() {
  const { user } = useUser();
  const groups: DashboardMoreGroup[] = config.moreHubGroups ?? [];

  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.path !== config.moreHubPath),
    }))
    .filter((group) => group.items.length > 0);

  const storeSlug = user?.storefront_slug;
  const sellerStatus = user?.seller_status ?? null;

  return (
    <div className="lm-content mx-auto w-full max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to={config.brandHome}
          className="lm-icon-btn"
          aria-label="Back to seller dashboard"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0">
          <p className="lm-eyebrow">Seller Center</p>
          <h1 className="lm-title mt-0.5 truncate">More</h1>
        </div>
      </div>

      <section className="lm-card overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="lm-section-title truncate">{user?.store_name || 'Your storefront'}</h2>
            <p className="lm-meta mt-1">
              {sellerStatus
                ? `Account status: ${sellerStatus.replaceAll('_', ' ')}`
                : 'Account status unavailable'}
            </p>
          </div>
          {storeSlug ? (
            <Link to={`/store/${storeSlug}`} className="lm-btn lm-btn--secondary shrink-0">
              View Storefront
              <ExternalLink size={15} />
            </Link>
          ) : null}
        </div>
      </section>

      {visibleGroups.map((group) => (
        <section key={group.title} className="space-y-3">
          <h2 className="lm-eyebrow">{group.title}</h2>
          <div className="lm-card divide-y divide-slate-100 overflow-hidden">
            {group.items.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="flex min-h-[3.5rem] items-center gap-3 px-4 py-3 transition hover:bg-lm-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-lm-primary"
              >
                <span className="lm-icon-tile h-9 w-9 shrink-0 rounded-lm text-lm-primary">
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-lm-heading">
                  {item.label}
                </span>
                <span aria-hidden="true" className="shrink-0 text-lm-placeholder">
                  ›
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default SellerMoreHub;
