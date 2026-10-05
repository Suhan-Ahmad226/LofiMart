'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowRight, BadgeCheck, Eye, PackagePlus } from 'lucide-react';
import { Link } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { useUser } from '@/features/shared/state/UserContext';
import { DashboardStatsSkeleton, ListCardSkeleton } from '@/features/shared/ui/DataSkeletons';
import {
  SellerAttentionList,
  SellerKpiCard,
  SellerQuickActionGrid,
  SellerRecentOrdersCard,
  SellerSectionCard,
  SellerSetupBanner,
  SellerStatusChip,
  SellerTopProductsTable,
} from '@/features/seller/components/dashboard/DashboardSections';
import { deriveSellerDashboardView } from '@/features/seller/components/dashboard/deriveSellerDashboardView';
import { useSellerDashboardData } from '@/features/seller/components/dashboard/useSellerDashboardData';

const SalesPerformanceChart = dynamic(
  () => import('@/features/seller/components/SalesPerformanceChart'),
  {
    ssr: false,
    loading: () => <div className="h-[300px] w-full animate-pulse rounded-lm-md bg-lm-canvas" />,
  },
);

const SETUP_BANNER_DISMISSED_KEY = 'amarshop_seller_dashboard_setup_dismissed';

function greetingForHour(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function SellerGreeting({ storeName, verified }: { storeName: string; verified: boolean }) {
  const greeting = useMemo(() => greetingForHour(new Date().getHours()), []);

  return (
    <section className="lm-card p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="lm-title">
              {greeting}, {storeName}
            </h1>
            {verified ? (
              <SellerStatusChip tone="success">
                <BadgeCheck size={13} aria-hidden="true" />
                Verified
              </SellerStatusChip>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link to="/seller/products/add" className="lm-btn lm-btn--primary">
            <PackagePlus size={16} aria-hidden="true" />
            Add product
          </Link>
        </div>
      </div>
    </section>
  );
}

const approvalAccentClass: Record<string, string> = {
  success: 'border-l-lm-success',
  danger: 'border-l-lm-danger',
  info: 'border-l-lm-info',
};

function SellerApprovalNotice({
  status,
  missingRequirements,
  rejectionReason,
  suspensionReason,
  canSubmitForReview,
}: {
  status: string;
  missingRequirements: Array<{ id: string; label: string }>;
  rejectionReason: string | null;
  suspensionReason: string | null;
  canSubmitForReview: boolean;
}) {
  const tone = status === 'approved' ? 'success' : status === 'suspended' || status === 'rejected' ? 'danger' : 'info';

  const description =
    status === 'approved'
      ? 'Your seller account is approved. Publishing, orders, courier booking and payouts are unlocked.'
      : status === 'rejected'
        ? rejectionReason || 'Your seller account needs updates before it can be approved again.'
        : status === 'suspended'
          ? suspensionReason || 'Your live seller privileges are suspended right now.'
          : canSubmitForReview
            ? 'Everything required for review is ready. Submit your seller account to move into the review queue.'
            : 'You can keep setting up your store and drafting products, but selling stays locked until admin approval.';

  return (
    <section className={cn('lm-card border-l-4 p-5', approvalAccentClass[tone] ?? approvalAccentClass.info)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="lm-eyebrow">Approval status</p>
          <h2 className="lm-section-title mt-1">{status.replaceAll('_', ' ')}</h2>
          <p className="lm-body mt-2 max-w-2xl">{description}</p>
        </div>
        <div className="lm-card lm-card--flat shrink-0 p-4 lg:max-w-xs">
          <p className="lm-label">Outstanding requirements</p>
          <p className="lm-meta mt-1">
            {missingRequirements.length > 0
              ? missingRequirements.map((item) => item.label).join(', ')
              : 'No missing requirements right now.'}
          </p>
          <Link to="/seller/onboarding" className="lm-btn lm-btn--ghost mt-3 px-0">
            Open onboarding
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export const SellerDashboard = () => {
  const { user } = useUser();
  const { stats, insights, onboarding, loading, error } = useSellerDashboardData();

  const storeName = user?.store_name || user?.name || 'Your storefront';
  const storefrontSlug = user?.storefront_slug ?? null;
  const isVerified = user?.seller_status === 'approved';

  const view = useMemo(
    () => deriveSellerDashboardView({ stats, insights, onboarding, storeName }),
    [insights, onboarding, stats, storeName],
  );

  const [setupDismissed, setSetupDismissed] = useState<boolean | null>(null);
  const showSetupBanner =
    view.setup.progressPercent > 0 &&
    view.setup.progressPercent < 100 &&
    setupDismissed !== true;

  const handleDismissSetup = () => {
    setSetupDismissed(true);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(SETUP_BANNER_DISMISSED_KEY, 'true');
    } catch {
      // Storage can be unavailable in private mode; the banner simply stays dismissed in memory.
    }
  };

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      setSetupDismissed(window.localStorage.getItem(SETUP_BANNER_DISMISSED_KEY) === 'true');
    } catch {
      setSetupDismissed(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading seller dashboard">
        <DashboardStatsSkeleton cards={4} />
        <ListCardSkeleton rows={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-lm-md border border-lm-danger/30 bg-lm-danger-soft p-4 text-sm text-lm-danger-text">
          {error}
        </div>
      ) : null}

      <SellerGreeting storeName={storeName} verified={isVerified} />

      {onboarding?.approval?.status && onboarding.approval.status !== 'approved' ? (
        <SellerApprovalNotice
          status={String(onboarding.approval.status)}
          missingRequirements={onboarding.approval.missing_requirements ?? []}
          rejectionReason={onboarding.approval.rejection_reason ?? null}
          suspensionReason={onboarding.approval.suspension_reason ?? null}
          canSubmitForReview={Boolean(onboarding.approval.can_submit_for_review)}
        />
      ) : null}

      {showSetupBanner ? (
        <SellerSetupBanner
          completedSteps={view.setup.completedSteps}
          totalSteps={view.setup.totalSteps}
          progressPercent={view.setup.progressPercent}
          nextStepTitle={view.setup.nextStepTitle}
          nextStepPath={view.setup.nextStepPath}
          onDismiss={handleDismissSetup}
        />
      ) : null}

      <SellerQuickActionGrid actions={view.quickActions} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {view.kpis.map((kpi) => (
          <SellerKpiCard
            key={kpi.key}
            label={kpi.label}
            value={kpi.value}
            icon={kpi.icon}
            trend={kpi.trend}
            hint={kpi.hint}
            iconTone={kpi.iconTone}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <SellerSectionCard
          title="Revenue trend"
          description={view.revenueSummary.subline}
          action={
            <Link to="/seller/earnings" className="lm-btn lm-btn--ghost">
              Open earnings
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          }
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="lm-label">{view.revenueSummary.headline}</p>
            <SellerStatusChip tone="primary">{view.revenueSummary.peakLabel}</SellerStatusChip>
          </div>
          <SalesPerformanceChart data={insights.salesSeries} />
        </SellerSectionCard>

        <SellerSectionCard
          title="Needs attention"
          description={view.summary}
          action={
            <Link to="/seller/more" className="lm-btn lm-btn--ghost">
              All tools
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          }
        >
          <SellerAttentionList items={view.attention} />
        </SellerSectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <SellerSectionCard
          title="Recent orders"
          description="Latest fulfilment activity across your storefront"
          action={
            <Link to="/seller/orders" className="lm-btn lm-btn--secondary">
              View all
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          }
        >
          <SellerRecentOrdersCard orders={view.recentOrders} totalOrders={stats.totalOrders} />
        </SellerSectionCard>

        <SellerSectionCard
          title="Top selling products"
          description="Best performing items by gross revenue"
          action={
            storefrontSlug ? (
              <Link to={`/store/${storefrontSlug}`} className="lm-btn lm-btn--secondary">
                <Eye size={14} aria-hidden="true" />
                Storefront
              </Link>
            ) : null
          }
        >
          <SellerTopProductsTable products={view.topProducts} />
        </SellerSectionCard>
      </div>
    </div>
  );
};

export default SellerDashboard;
