"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuthModal } from '@/features/auth/context/AuthModalContext';
import { useLocation, useNavigate } from '../../../lib/navigation';
import { useUser } from '../../../features/shared/state/UserContext';
import { DashboardShell } from '@/features/shared/dashboard/DashboardShell';
import { DASHBOARD_CONFIG } from '@/features/shared/dashboard/dashboard.config';
import type {
  DashboardMenuItem,
  DashboardMenuSection,
  DashboardRole,
} from '@/features/shared/dashboard/dashboard.types';

interface DashboardLayoutProps {
  children: React.ReactNode;
  type: DashboardRole;
}

type MenuEntry = {
  item: DashboardMenuItem;
  section: DashboardMenuSection;
  depth: number;
};

type BadgeMap = Record<string, number>;

type NotificationDto = { read_at?: string | null };
type ManualOrderDto = { status?: string | null };
type OperationsSummaryDto = { items?: Array<{ key?: string; count?: number }> };
type SellerInsightsDto = {
  lowStockProducts?: unknown[];
  activeShipments?: number;
};

const layoutPrefsKey = 'amarshop_dashboard_sidebar_collapsed';
const sectionPrefsPrefix = 'amarshop_dashboard_sections';

const ORDER_SEARCH_TOKEN_RE = /\b(order|orders|track|tracking|ship|shipment|shipping|courier)\b/i;

function roleHomeForRole(role: Exclude<DashboardRole, 'customer'> | DashboardRole): string {
  switch (role) {
    case 'admin':
      return '/admin/dashboard';
    case 'seller':
      return '/seller/dashboard';
    case 'reseller':
      return '/reseller-dashboard/overview';
    default:
      return '/account/dashboard';
  }
}

/**
 * Route matching. An item is considered a match when its path is either an
 * exact match or a segment-aligned prefix of the current pathname:
 *
 *   /seller/products      -> matches /seller/products
 *   /seller/products/add  -> matches /seller/products/add AND /seller/products
 *   /seller/products      -> does NOT match /seller/products-archive
 *
 * This keeps nested detail pages highlighted under their parent while avoiding
 * substring false positives.
 */
function toSegmentArray(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function isRouteMatch(itemPath: string, pathname: string): boolean {
  const itemSegments = toSegmentArray(itemPath);
  const pathSegments = toSegmentArray(pathname);

  if (itemSegments.length === 0) return pathSegments.length === 0;
  if (itemSegments.length > pathSegments.length) return false;

  return itemSegments.every((segment, index) => segment === pathSegments[index]);
}

function findBestMenuEntry(pathname: string, sections: DashboardMenuSection[]): MenuEntry | null {
  let best: MenuEntry | null = null;

  for (const section of sections) {
    for (const item of section.items) {
      if (!isRouteMatch(item.path, pathname)) continue;
      const depth = toSegmentArray(item.path).length;
      if (!best || depth > best.depth) {
        best = { item, section, depth };
      }
    }
  }

  return best;
}

function countUnreadNotifications(payload: unknown): number {
  if (!Array.isArray(payload)) return 0;
  return payload.reduce<number>((total, raw) => {
    const item = raw as NotificationDto | null;
    return total + (item && item.read_at ? 0 : 1);
  }, 0);
}

function countPendingManualOrders(payload: unknown): number {
  if (!Array.isArray(payload)) return 0;
  return payload.reduce<number>((total, raw) => {
    const status = String((raw as ManualOrderDto | null)?.status || '').toLowerCase();
    return total + (status === 'cancelled' || status === 'delivered' ? 0 : 1);
  }, 0);
}

async function fetchDashboardJson(path: string, token: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    console.warn(`Dashboard badge endpoint ${path} responded with ${response.status}`);
    return null;
  }

  return payload;
}

async function fetchAdminBadges(token: string, signal: AbortSignal): Promise<BadgeMap> {
  const payload = (await fetchDashboardJson('/api/admin/operations-summary', token, signal)) as
    | OperationsSummaryDto
    | null;
  if (!payload || typeof payload !== 'object') return {};

  const items = Array.isArray(payload.items) ? payload.items : [];
  const findCount = (key: string) =>
    items.reduce<number>((total, item) => total + (item?.key === key ? Number(item?.count) || 0 : 0), 0);

  return {
    '/admin/orders': findCount('delivery_exceptions'),
    '/admin/logistics': findCount('delivery_exceptions'),
    '/admin/payments': findCount('payout_reviews'),
    '/admin/returns': findCount('return_requests'),
    '/admin/support': findCount('support_inbox'),
    '/admin/users': findCount('kyc_reviews') + findCount('account_requests'),
    '/admin/flash-sale': findCount('flash_sale_entries'),
  };
}

async function fetchSellerBadges(token: string, signal: AbortSignal): Promise<BadgeMap> {
  const [insights, manualOrders, notifications] = await Promise.all([
    fetchDashboardJson('/api/seller/dashboard-insights', token, signal),
    fetchDashboardJson('/api/seller/manual-orders', token, signal),
    fetchDashboardJson('/api/notifications', token, signal),
  ]);

  const insightsPayload = insights as SellerInsightsDto | null;

  const lowStockCount =
    insightsPayload && Array.isArray(insightsPayload.lowStockProducts)
      ? insightsPayload.lowStockProducts.length
      : null;

  const rawActiveShipments = insightsPayload?.activeShipments;
  const activeShipments =
    typeof rawActiveShipments === 'number' && Number.isFinite(rawActiveShipments) ? rawActiveShipments : null;

  const manualOrdersCount = manualOrders !== null ? countPendingManualOrders(manualOrders) : null;
  const unreadNotifications = notifications !== null ? countUnreadNotifications(notifications) : null;

  const badges: BadgeMap = {};

  if (unreadNotifications !== null) badges['/seller/notifications'] = unreadNotifications;
  if (activeShipments !== null) {
    badges['/seller/orders'] = activeShipments;
    badges['/seller/courier'] = activeShipments;
  }
  if (manualOrdersCount !== null) badges['/seller/manual-orders'] = manualOrdersCount;
  if (lowStockCount !== null) {
    badges['/seller/products'] = lowStockCount;
    badges['/seller/inventory'] = lowStockCount;
  }

  return badges;
}

async function fetchResellerBadges(token: string, signal: AbortSignal): Promise<BadgeMap> {
  const manualOrders = await fetchDashboardJson('/api/reseller/manual-orders', token, signal);

  const badges: BadgeMap = {};
  if (manualOrders !== null) {
    badges['/reseller-dashboard/manual-orders'] = countPendingManualOrders(manualOrders);
  }
  return badges;
}

async function fetchCustomerBadges(token: string, signal: AbortSignal): Promise<BadgeMap> {
  const notifications = await fetchDashboardJson('/api/notifications', token, signal);

  const badges: BadgeMap = {};
  if (notifications !== null) {
    badges['/account/notifications'] = countUnreadNotifications(notifications);
  }
  return badges;
}

async function loadAllBadges(type: DashboardRole, token: string, signal: AbortSignal): Promise<BadgeMap> {
  switch (type) {
    case 'admin':
      return fetchAdminBadges(token, signal);
    case 'seller':
      return fetchSellerBadges(token, signal);
    case 'reseller':
      return fetchResellerBadges(token, signal);
    default:
      return fetchCustomerBadges(token, signal);
  }
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, type }) => {
  const location = useLocation();
  const { user, logout, token, isAuthenticated, isReady } = useUser();
  const navigate = useNavigate();

  // ============================================================
  // ALL HOOKS MUST BE DECLARED BEFORE ANY CONDITIONAL RETURNS
  // ============================================================

  const config = DASHBOARD_CONFIG[type];

  // --- State ---
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [badges, setBadges] = useState<BadgeMap>({});
  const [collapsedSections, setCollapsedSections] = useState<string[]>([]);
  const [searchValue, setSearchValue] = useState('');

  // --- Refs ---
  const suppressAuthRedirectRef = useRef(false);
  const activeSectionRef = useRef<string | null>(null);

  // --- Derived values ---
  const currentSections = config.sections;
  const roleMatches = user !== null && user.role === type;

  const activeMenuEntry = useMemo(
    () => findBestMenuEntry(location.pathname, currentSections),
    [currentSections, location.pathname],
  );

  const activeMenuEntryPath = activeMenuEntry?.item.path ?? null;

  const activeSectionTitles = useMemo(
    () => (activeMenuEntry ? [activeMenuEntry.section.title] : []),
    [activeMenuEntry],
  );

  const sectionBadgeTotals = useMemo(() => {
    return currentSections.reduce<Record<string, number>>((acc, section) => {
      acc[section.title] = section.items.reduce(
        (sum, item) => sum + Number(badges[item.path] || 0),
        0,
      );
      return acc;
    }, {});
  }, [badges, currentSections]);

  const quickAccessPath = config.quickAccessPath;
  const quickAccessBadgeCount = Number(badges[quickAccessPath] || 0);

  const workspaceName =
    type === 'seller'
      ? user?.store_name || user?.storefront_slug || user?.name || 'MerchantOS'
      : user?.name || 'LofiMart member';

  const workspaceSubtitle =
    type === 'seller'
      ? user?.storefront_headline ||
        (user?.storefront_slug ? `/store/${user.storefront_slug}` : null) ||
        'Store information'
      : user?.email || 'LofiMart member';

  const initials = useMemo(() => {
    const source =
      type === 'seller'
        ? String(user?.store_name || user?.name || 'Seller')
        : String(user?.name || user?.email || 'Member');

    return (
      source
        .split(' ')
        .map((part) => part.trim())
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || '')
        .join('') || (type === 'seller' ? 'SL' : 'LM')
    );
  }, [type, user]);

  // --- Effects ---

  // Auth guard. Never redirects while the session is still hydrating; preserves
  // the intended destination; bounces to the role home when the requested
  // workspace does not match the signed-in role.
  useEffect(() => {
    if (!isReady) return;

    // A logout initiated from this layout already navigated home; skip the
    // guard redirect so the two navigations cannot race each other.
    if (suppressAuthRedirectRef.current) {
      suppressAuthRedirectRef.current = false;
      return;
    }

    if (!token || !user) {
      const destination = `/login?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`;
      navigate(destination, { replace: true });
      return;
    }

    if (!roleMatches) {
      navigate(roleHomeForRole(user.role), { replace: true });
    }
  }, [isReady, location.pathname, location.search, navigate, roleMatches, token, type, user]);

  // Sidebar collapse persistence
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(layoutPrefsKey);
    if (saved === 'true') {
      setCollapsed(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(layoutPrefsKey, collapsed ? 'true' : 'false');
  }, [collapsed]);

  // Section collapse persistence (per role)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(`${sectionPrefsPrefix}:${type}`);
    if (!saved) {
      setCollapsedSections([]);
      return;
    }

    try {
      const parsed: unknown = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        setCollapsedSections(parsed.filter((value): value is string => typeof value === 'string'));
        return;
      }
    } catch {
      // Corrupted saved state is ignored; the reset below keeps stored values clean.
    }

    setCollapsedSections([]);
  }, [type]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(`${sectionPrefsPrefix}:${type}`, JSON.stringify(collapsedSections));
  }, [collapsedSections, type]);

  // Close the mobile drawer on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Badge loading with per-endpoint degradation, in-flight dedupe and abort.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!token) {
      setBadges({});
      return;
    }

    if (!isReady || !roleMatches) return;

    const controller = new AbortController();
    let active = true;
    let inFlight = false;
    let rerunRequested = false;
    let sequence = 0;

    const run = async () => {
      if (inFlight) {
        rerunRequested = true;
        return;
      }

      inFlight = true;
      const requestId = ++sequence;

      try {
        const next = await loadAllBadges(type, token, controller.signal);
        if (active && requestId === sequence && !controller.signal.aborted) {
          setBadges(next);
        }
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        console.warn('Failed to refresh dashboard badges', error);
      } finally {
        inFlight = false;
        if (rerunRequested && active && !controller.signal.aborted) {
          rerunRequested = false;
          void run();
        }
      }
    };

    void run();

    const handleBadgeRefresh = () => {
      void run();
    };
    window.addEventListener('dashboard-badges:refresh', handleBadgeRefresh);

    return () => {
      active = false;
      sequence += 1;
      controller.abort();
      window.removeEventListener('dashboard-badges:refresh', handleBadgeRefresh);
    };
  }, [isReady, roleMatches, token, type]);

  // Auto-expand the active section when navigating to a different one, but do
  // not fight a manual collapse of the section that is already active.
  useEffect(() => {
    const activeTitle = activeSectionTitles[0];

    if (activeTitle && activeSectionRef.current !== activeTitle) {
      activeSectionRef.current = activeTitle;
      setCollapsedSections((current) => current.filter((title) => title !== activeTitle));
    }
  }, [activeSectionTitles]);

  // --- Handlers ---
  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchValue.trim();

    if (!query) {
      if (type === 'seller') {
        navigate('/seller/products');
      }
      return;
    }

    if (type === 'seller') {
      const normalized = query.toLowerCase();
      const isOrderQuery =
        normalized.startsWith('#') ||
        /^ord[\s-]?\d+/.test(normalized) ||
        /^\d{4,}$/.test(normalized) ||
        ORDER_SEARCH_TOKEN_RE.test(normalized);

      const targetPath = isOrderQuery ? '/seller/orders' : '/seller/products';
      navigate(`${targetPath}?search=${encodeURIComponent(query)}`);
    } else {
      const targetPath =
        type === 'admin'
          ? '/admin/products'
          : type === 'reseller'
            ? '/reseller-dashboard/catalog'
            : '/shop';

      navigate(`${targetPath}?search=${encodeURIComponent(query)}`);
    }

    setSearchValue('');
  };

  const handleLogout = () => {
    setMobileOpen(false);
    suppressAuthRedirectRef.current = true;
    logout();
    navigate('/', { replace: true });
  };

  const toggleSection = (title: string) => {
    setCollapsedSections((current) =>
      current.includes(title) ? current.filter((entry) => entry !== title) : [...current, title],
    );
  };

  // ============================================================
  // CONDITIONAL RETURN (after ALL hooks are declared)
  // ============================================================

  // Loading gate: also blocks rendering a mismatched role workspace until the
  // auth effect has redirected the user to the correct dashboard.
  if (!isReady || !isAuthenticated || !token || !user || !roleMatches) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 lg:px-6" aria-busy="true" aria-label="Loading dashboard">
        <div className="space-y-5">
          <div className="surface-card animate-pulse p-5">
            <div className="h-6 w-48 rounded-md bg-slate-200" />
            <div className="mt-3 h-4 w-72 max-w-full rounded-md bg-slate-100" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="surface-card animate-pulse p-5">
                <div className="h-3 w-24 rounded bg-slate-200" />
                <div className="mt-4 h-8 w-32 rounded bg-slate-100" />
                <div className="mt-6 h-2 w-full rounded bg-slate-100" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {Array.from({ length: 2 }, (_, index) => (
              <div key={index} className="surface-card animate-pulse p-5">
                <div className="h-5 w-40 rounded bg-slate-200" />
                <div className="mt-5 space-y-3">
                  <div className="h-12 w-full rounded bg-slate-100" />
                  <div className="h-12 w-full rounded bg-slate-100" />
                  <div className="h-12 w-5/6 rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell
      config={config}
      collapsed={collapsed}
      setCollapsed={setCollapsed}
      mobileOpen={mobileOpen}
      setMobileOpen={setMobileOpen}
      searchValue={searchValue}
      setSearchValue={setSearchValue}
      onSearchSubmit={handleSearchSubmit}
      quickAccessBadgeCount={quickAccessBadgeCount}
      workspaceName={workspaceName}
      workspaceSubtitle={workspaceSubtitle}
      initials={initials}
      avatarUrl={user.avatar_url}
      pathname={location.pathname}
      badges={badges}
      sectionBadgeTotals={sectionBadgeTotals}
      activeSectionTitles={activeSectionTitles}
      collapsedSections={collapsedSections}
      toggleSection={toggleSection}
      activeMenuEntryPath={activeMenuEntryPath}
      onLogout={handleLogout}
    >
      {children}
    </DashboardShell>
  );
};