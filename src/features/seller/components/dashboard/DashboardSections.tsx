import type { ReactNode } from 'react';
import {
  Boxes,
  CircleDollarSign,
  ClipboardList,
  Package,
  PackagePlus,
  ShieldAlert,
  Truck,
  Wallet,
  Warehouse,
} from 'lucide-react';
import { Link } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { formatRelativeTime, formatStatusLabel, toneForOrderStatus, type SellerStatusTone } from './sellerStatus';

/* ==========================================================================
   Seller dashboard section primitives.

   Split out of Dashboard.tsx so each Stitch dashboard region (setup banner,
   quick actions, KPI row, revenue trend, needs-attention, recent orders,
   top products) can be read, tested and restyled on its own. All of them are
   presentational: data fetching and derivation stay in the dashboard screen.
   ========================================================================== */

export type { SellerStatusTone } from './sellerStatus';

/**
 * Icon names rather than elements, so `deriveSellerDashboardView` stays a pure
 * data function with no React dependency.
 */
export type SellerIconName =
  | 'orders'
  | 'earnings'
  | 'products'
  | 'pending'
  | 'add-product'
  | 'stock'
  | 'shipment'
  | 'payout'
  | 'verification'
  | 'out-of-stock';

const iconRegistry: Record<SellerIconName, (props: { size?: number }) => ReactNode> = {
  orders: ClipboardList,
  earnings: CircleDollarSign,
  products: Package,
  pending: Truck,
  'add-product': PackagePlus,
  stock: Boxes,
  shipment: Truck,
  payout: Wallet,
  verification: ShieldAlert,
  'out-of-stock': Warehouse,
};

function SellerIcon({ name, size = 20 }: { name: SellerIconName; size?: number }) {
  const Icon = iconRegistry[name] ?? Package;
  return <Icon size={size} aria-hidden="true" />;
}

const chipToneClass: Record<SellerStatusTone, string> = {
  success: 'lm-chip lm-chip--success',
  warning: 'lm-chip lm-chip--warning',
  danger: 'lm-chip lm-chip--danger',
  info: 'lm-chip lm-chip--info',
  pending: 'lm-chip lm-chip--pending',
  neutral: 'lm-chip lm-chip--neutral',
  primary: 'lm-chip lm-chip--primary',
};

export function SellerStatusChip({ tone, children }: { tone: SellerStatusTone; children: ReactNode }) {
  return <span className={chipToneClass[tone]}>{children}</span>;
}

/* -------------------------------------------------------------------------- */

export type DashboardSectionProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function SellerSectionCard({ title, description, action, children, className }: DashboardSectionProps) {
  return (
    <section className={cn('lm-card', className)}>
      <div className="flex flex-col gap-3 border-b border-lm-border-soft px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="lm-section-title">{title}</h2>
          {description ? <p className="lm-meta mt-0.5">{description}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export type SellerKpiCardProps = {
  label: string;
  value: string;
  icon: SellerIconName;
  /** Trend pill. Omit when there is no comparison period to report. */
  trend?: { value: string; tone: SellerStatusTone };
  hint?: string;
  iconTone?: SellerStatusTone;
};

const iconToneClass: Record<SellerStatusTone, string> = {
  success: 'lm-icon-tile lm-icon-tile--success',
  warning: 'lm-icon-tile lm-icon-tile--warning',
  danger: 'lm-icon-tile lm-icon-tile--danger',
  info: 'lm-icon-tile lm-icon-tile--info',
  pending: 'lm-icon-tile lm-icon-tile--pending',
  neutral: 'lm-icon-tile',
  primary: 'lm-icon-tile lm-icon-tile--primary',
};

export function SellerKpiCard({ label, value, icon, trend, hint, iconTone = 'primary' }: SellerKpiCardProps) {
  return (
    <div className="lm-card lm-card--interactive p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="lm-eyebrow">{label}</p>
        <span className={iconToneClass[iconTone]}>
          <SellerIcon name={icon} />
        </span>
      </div>
      <p className="lm-metric mt-3">{value}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {trend ? <SellerStatusChip tone={trend.tone}>{trend.value}</SellerStatusChip> : null}
        {hint ? <span className="lm-meta">{hint}</span> : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export type SellerQuickAction = {
  title: string;
  description: string;
  to: string;
  icon: SellerIconName;
};

export function SellerQuickActionGrid({ actions }: { actions: SellerQuickAction[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {actions.map((action) => (
        <Link
          key={action.to}
          to={action.to}
          className="lm-card lm-card--interactive flex min-h-[4.5rem] items-center gap-3 p-4"
        >
          <span className="lm-icon-tile lm-icon-tile--primary shrink-0">
            <SellerIcon name={action.icon} size={18} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-lm-heading">{action.title}</span>
            <span className="mt-0.5 block truncate text-xs text-lm-meta">{action.description}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export type SellerSetupBannerProps = {
  completedSteps: number;
  totalSteps: number;
  progressPercent: number;
  nextStepTitle?: string | null;
  nextStepPath: string;
  onDismiss?: () => void;
};

export function SellerSetupBanner({
  completedSteps,
  totalSteps,
  progressPercent,
  nextStepTitle,
  nextStepPath,
  onDismiss,
}: SellerSetupBannerProps) {
  const isComplete = progressPercent >= 100;

  return (
    <section
      className={cn(
        'rounded-lm-md border p-4',
        isComplete ? 'border-lm-success/30 bg-lm-success-soft' : 'border-lm-warning/30 bg-lm-warning-soft',
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-lm-heading">
            {isComplete ? 'Seller setup complete' : 'Complete your seller setup'}
          </p>
          <p className="mt-1 text-sm text-lm-body">
            {isComplete
              ? 'Every onboarding milestone is done. You are ready to scale.'
              : `${completedSteps} of ${totalSteps} milestones completed (${Math.round(progressPercent)}%)`}
            {nextStepTitle ? `. Next: ${nextStepTitle}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onDismiss ? (
            <button type="button" onClick={onDismiss} className="lm-btn lm-btn--ghost">
              Remind later
            </button>
          ) : null}
          <Link to={nextStepPath} className="lm-btn lm-btn--primary">
            {isComplete ? 'Review setup' : 'Complete setup'}
          </Link>
        </div>
      </div>
      <div className="mt-3">
        <div
          className="lm-progress"
          role="progressbar"
          aria-valuenow={Math.round(progressPercent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Seller setup progress"
        >
          <div
            className={cn(
              'lm-progress__fill',
              isComplete ? 'lm-progress__fill--success' : progressPercent > 50 ? '' : 'lm-progress__fill--warning',
            )}
            style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
          />
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export type SellerAttentionItem = {
  id: string;
  title: string;
  description: string;
  ctaLabel: string;
  to: string;
  icon: SellerIconName;
  tone: 'danger' | 'warning' | 'info' | 'pending';
};

const attentionToneClass: Record<SellerAttentionItem['tone'], string> = {
  danger: 'border-lm-danger/30 bg-lm-danger-soft',
  warning: 'border-lm-warning/30 bg-lm-warning-soft',
  info: 'border-lm-info/30 bg-lm-info-soft',
  pending: 'border-lm-pending/30 bg-lm-pending-soft',
};

const attentionIconToneClass: Record<SellerAttentionItem['tone'], string> = {
  danger: 'lm-icon-tile lm-icon-tile--danger',
  warning: 'lm-icon-tile lm-icon-tile--warning',
  info: 'lm-icon-tile lm-icon-tile--info',
  pending: 'lm-icon-tile lm-icon-tile--pending',
};

export function SellerAttentionList({ items }: { items: SellerAttentionItem[] }) {
  if (items.length === 0) {
    return <p className="lm-empty">Nothing needs your attention right now. Operations look stable.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className={cn('rounded-lm-md border p-4', attentionToneClass[item.tone])}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className={cn('shrink-0', attentionIconToneClass[item.tone])}>
                <SellerIcon name={item.icon} size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-lm-heading">{item.title}</p>
                <p className="mt-0.5 text-sm text-lm-body">{item.description}</p>
              </div>
            </div>
            <Link to={item.to} className="lm-btn lm-btn--secondary shrink-0">
              {item.ctaLabel}
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export type SellerRecentOrder = {
  id: string;
  orderId: string;
  createdAt: string;
  total: string;
  status: string;
};

export function SellerRecentOrdersCard({
  orders,
  totalOrders,
}: {
  orders: SellerRecentOrder[];
  totalOrders: number;
}) {
  if (orders.length === 0) {
    return <p className="lm-empty">No recent orders yet. New orders will appear here as they arrive.</p>;
  }

  return (
    <ul className="divide-y divide-lm-border-soft">
      {orders.map((order) => (
        <li key={order.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="lm-numeric truncate text-sm font-semibold text-lm-heading">#{order.orderId}</p>
                <SellerStatusChip tone={toneForOrderStatus(order.status)}>{formatStatusLabel(order.status)}</SellerStatusChip>
              </div>
              <p className="lm-meta mt-1">{formatRelativeTime(order.createdAt)}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <p className="lm-numeric text-base font-bold text-lm-heading">{order.total}</p>
            <Link to="/seller/orders" className="lm-btn lm-btn--secondary">
              View
            </Link>
          </div>
        </li>
      ))}
      {totalOrders > orders.length ? (
        <li className="lm-meta pt-4">Showing {orders.length} of {totalOrders} orders</li>
      ) : null}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */

export type SellerTopProduct = {
  id: string;
  name: string;
  image?: string | null;
  sales: number;
  revenue: number;
  revenueLabel: string;
  maxRevenue: number;
};

export function SellerTopProductsTable({ products }: { products: SellerTopProduct[] }) {
  if (products.length === 0) {
    return <p className="lm-empty">Your best-performing products will appear here once orders start coming in.</p>;
  }

  return (
    <div className="table-responsive">
      <table className="lm-table">
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col" className="lm-table__num">
              Units sold
            </th>
            <th scope="col" className="lm-table__num">
              Revenue
            </th>
            <th scope="col" className="lm-table__num">
              Share
            </th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const share = product.maxRevenue > 0 ? Math.round((product.revenue / product.maxRevenue) * 100) : 0;

            return (
              <tr key={product.id}>
                <td>
                  <Link
                    to={`/seller/products/edit/${encodeURIComponent(product.id)}`}
                    className="font-medium text-lm-heading hover:text-lm-primary"
                  >
                    {product.name}
                  </Link>
                </td>
                <td className="lm-table__num">{product.sales}</td>
                <td className="lm-table__num font-semibold text-lm-heading">{product.revenueLabel}</td>
                <td className="lm-table__num">
                  <div className="flex items-center justify-end gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-lm-border-soft">
                      <div className="h-full rounded-full bg-lm-primary" style={{ width: `${share}%` }} />
                    </div>
                    <span className="lm-numeric text-xs font-semibold text-lm-meta">{share}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
