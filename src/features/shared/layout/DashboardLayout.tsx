"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from '../../../lib/navigation';
import { useUser } from '../../../features/shared/state/UserContext';
import {
  LayoutDashboard,
  ShoppingBag,
  Heart,
  MapPin,
  Settings,
  LogOut,
  Bell,
  Search,
  CreditCard,
  User,
  Store,
  Coins,
  Zap,
  Wallet,
  Megaphone,
  Crown,
  Users2,
  Sparkles,
  Truck,
  Tag,
  FileText,
  BookText,
  Image as ImageIcon,
  Mail,
  Gauge,
  Undo2,
  Menu,
  X,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { SellerDashboardShell } from '@/features/seller/components/SellerDashboardShell';

interface DashboardLayoutProps {
  children: React.ReactNode;
  type: 'customer' | 'seller' | 'admin' | 'reseller';
}

type MenuItem = {
  icon: React.ReactNode;
  label: string;
  path: string;
};

type MenuSection = {
  title: string;
  items: MenuItem[];
};

const layoutPrefsKey = 'amarshop_dashboard_sidebar_collapsed';
const sectionPrefsPrefix = 'amarshop_dashboard_sections';

type BadgeMap = Record<string, number>;

const roleAccentMap: Record<
  DashboardLayoutProps['type'],
  {
    chip: string;
    glow: string;
    soft: string;
    dot: string;
  }
> = {
  customer: {
    chip: 'from-sky-500 to-cyan-500',
    glow: 'shadow-[0_18px_38px_-24px_rgba(14,165,233,0.55)]',
    soft: 'bg-sky-50 text-sky-700',
    dot: 'bg-sky-500',
  },
  seller: {
    chip: 'from-emerald-600 to-green-500',
    glow: 'shadow-[0_18px_38px_-24px_rgba(34,197,94,0.55)]',
    soft: 'bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
  },
  admin: {
    chip: 'from-slate-900 to-slate-700',
    glow: 'shadow-[0_18px_38px_-24px_rgba(15,23,42,0.6)]',
    soft: 'bg-slate-100 text-slate-700',
    dot: 'bg-slate-700',
  },
  reseller: {
    chip: 'from-fuchsia-600 to-pink-500',
    glow: 'shadow-[0_18px_38px_-24px_rgba(217,70,239,0.55)]',
    soft: 'bg-fuchsia-50 text-fuchsia-700',
    dot: 'bg-fuchsia-500',
  },
};

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, type }) => {
  const location = useLocation();
  const { user, logout, token, isAuthenticated, isReady } = useUser();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [badges, setBadges] = useState<BadgeMap>({});
  const [collapsedSections, setCollapsedSections] = useState<string[]>([]);
  const [sellerSearch, setSellerSearch] = useState('');
  const [sellerFooterOpen, setSellerFooterOpen] = useState(false);
  const customerQuickLinksRef = useRef<HTMLDivElement | null>(null);
  const sellerFooterRef = useRef<HTMLDivElement | null>(null);
  const [customerToolbarScrollState, setCustomerToolbarScrollState] = useState({
    canScrollLeft: false,
    canScrollRight: false,
  });

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (!isAuthenticated || !token || !user) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`, { replace: true });
      return;
    }

    const roleMatches =
      (type === 'customer' && user.role === 'customer') ||
      (type === 'seller' && user.role === 'seller') ||
      (type === 'admin' && user.role === 'admin') ||
      (type === 'reseller' && user.role === 'reseller');

    if (!roleMatches) {
      const fallbackPath =
        user.role === 'admin'
          ? '/admin/dashboard'
          : user.role === 'seller'
            ? '/seller/dashboard'
            : user.role === 'reseller'
              ? '/reseller-dashboard/overview'
              : '/account/dashboard';
      navigate(fallbackPath, { replace: true });
    }
  }, [isAuthenticated, isReady, location.pathname, navigate, token, type, user]);

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(`${sectionPrefsPrefix}:${type}`);
    if (!saved) {
      setCollapsedSections([]);
      return;
    }

    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        setCollapsedSections(parsed.filter((value): value is string => typeof value === 'string'));
        return;
      }
    } catch {
      // Ignore invalid saved state and reset below.
    }

    setCollapsedSections([]);
  }, [type]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(`${sectionPrefsPrefix}:${type}`, JSON.stringify(collapsedSections));
  }, [collapsedSections, type]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    setSellerFooterOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen || typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    if (!sellerFooterOpen || typeof window === 'undefined') return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!sellerFooterRef.current?.contains(event.target as Node)) {
        setSellerFooterOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSellerFooterOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [sellerFooterOpen]);

  useEffect(() => {
    if (!token) {
      setBadges({});
      return;
    }

    let isMounted = true;

    const setSafeBadges = (next: BadgeMap) => {
      if (!isMounted) return;
      setBadges(next);
    };

    const loadBadges = async () => {
      try {
        if (type === 'admin') {
          const response = await fetch('/api/admin/operations-summary', {
            headers: { Authorization: `Bearer ${token}` },
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(payload?.error || 'Failed to load admin navigation badges');
          }

          const items = Array.isArray(payload?.items) ? payload.items : [];
          const findCount = (key: string) => Number(items.find((item: any) => item?.key === key)?.count || 0);

          setSafeBadges({
            '/admin/orders': findCount('delivery_exceptions'),
            '/admin/payments': findCount('payout_reviews'),
            '/admin/returns': findCount('return_requests'),
            '/admin/logistics': findCount('delivery_exceptions'),
            '/admin/support': findCount('support_inbox'),
            '/admin/users': findCount('kyc_reviews') + findCount('account_requests'),
            '/admin/flash-sale': findCount('flash_sale_entries'),
          });
          return;
        }

        if (type === 'seller') {
          const [insightsResponse, manualOrdersResponse, notificationsResponse] = await Promise.all([
            fetch('/api/seller/dashboard-insights', {
              headers: { Authorization: `Bearer ${token}` },
            }),
            fetch('/api/seller/manual-orders', {
              headers: { Authorization: `Bearer ${token}` },
            }),
            fetch('/api/notifications', {
              headers: { Authorization: `Bearer ${token}` },
            }),
          ]);

          const insightsPayload = await insightsResponse.json().catch(() => null);
          const manualOrdersPayload = await manualOrdersResponse.json().catch(() => null);
          const notificationsPayload = await notificationsResponse.json().catch(() => null);

          if (!insightsResponse.ok) {
            throw new Error(insightsPayload?.error || 'Failed to load seller navigation badges');
          }

          const lowStockCount = Array.isArray(insightsPayload?.lowStockProducts)
            ? insightsPayload.lowStockProducts.length
            : 0;
          const activeShipments = Number(insightsPayload?.activeShipments || 0);
          const manualOrdersCount = Array.isArray(manualOrdersPayload)
            ? manualOrdersPayload.filter((order: any) => !['cancelled', 'delivered'].includes(String(order?.status || '').toLowerCase())).length
            : 0;
          const unreadNotifications = Array.isArray(notificationsPayload)
            ? notificationsPayload.filter((item: any) => !item?.read_at).length
            : 0;

          setSafeBadges({
            '/seller/notifications': unreadNotifications,
            '/seller/orders': activeShipments,
            '/seller/manual-orders': manualOrdersCount,
            '/seller/courier': activeShipments,
            '/seller/pickup-locations': lowStockCount,
            '/seller/products': lowStockCount,
            '/seller/inventory': lowStockCount,
            '/seller/support/returns': activeShipments,
          });
          return;
        }

        if (type === 'reseller') {
          const [notificationsResponse, manualOrdersResponse] = await Promise.all([
            fetch('/api/notifications', {
              headers: { Authorization: `Bearer ${token}` },
            }),
            fetch('/api/reseller/manual-orders', {
              headers: { Authorization: `Bearer ${token}` },
            }),
          ]);

          const notificationsPayload = await notificationsResponse.json().catch(() => null);
          const manualOrdersPayload = await manualOrdersResponse.json().catch(() => null);

          const unreadNotifications = Array.isArray(notificationsPayload)
            ? notificationsPayload.filter((item: any) => !item?.read_at).length
            : 0;
          const manualOrdersCount = Array.isArray(manualOrdersPayload)
            ? manualOrdersPayload.filter((order: any) => !['cancelled', 'delivered'].includes(String(order?.status || '').toLowerCase())).length
            : 0;

          setSafeBadges({
            '/reseller-dashboard/manual-orders': manualOrdersCount,
            '/reseller-dashboard/earnings': unreadNotifications,
            '/reseller-dashboard/promotions': unreadNotifications,
          });
          return;
        }

        const response = await fetch('/api/notifications', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load notification badges');
        }

        const unreadNotifications = Array.isArray(payload)
          ? payload.filter((item: any) => !item?.read_at).length
          : 0;

        setSafeBadges({
          '/account/notifications': unreadNotifications,
        });
      } catch {
        setSafeBadges({});
      }
    };

    void loadBadges();

    const handleBadgeRefresh = () => {
      void loadBadges();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('dashboard-badges:refresh', handleBadgeRefresh);
    }

    return () => {
      isMounted = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener('dashboard-badges:refresh', handleBadgeRefresh);
      }
    };
  }, [token, type]);

  const menuSections: Record<DashboardLayoutProps['type'], MenuSection[]> = {
    customer: [
      {
        title: 'Overview',
        items: [
          { icon: <LayoutDashboard size={20} />, label: 'Dashboard', path: '/account/dashboard' },
        ],
      },
      {
        title: 'Shopping',
        items: [
          { icon: <ShoppingBag size={20} />, label: 'My Orders', path: '/account/orders' },
          { icon: <Heart size={20} />, label: 'Wishlist', path: '/account/wishlist' },
        ],
      },
      {
        title: 'Wallet & Rewards',
        items: [
          { icon: <Wallet size={20} />, label: 'My Wallet', path: '/account/wallet' },
        ],
      },
      {
        title: 'Discover',
        items: [
        ],
      },
      {
        title: 'Preferences',
        items: [
          { icon: <Bell size={20} />, label: 'Notifications', path: '/account/notifications' },
          { icon: <Settings size={20} />, label: 'Settings', path: '/account/settings' },
        ],
      },
    ],
    seller: [
      {
        title: 'Overview',
        items: [
          { icon: <LayoutDashboard size={20} />, label: 'Overview', path: '/seller/dashboard' },
        ],
      },
      {
        title: 'Orders',
        items: [
          { icon: <ShoppingBag size={20} />, label: 'All Orders', path: '/seller/orders' },
          { icon: <FileText size={20} />, label: 'Manual Orders', path: '/seller/manual-orders' },
        ],
      },
      {
        title: 'Products',
        items: [
          { icon: <ShoppingBag size={20} />, label: 'All Products', path: '/seller/products' },
          { icon: <Package size={20} />, label: 'Add Product', path: '/seller/products/add' },
          { icon: <FileText size={20} />, label: 'Bulk Upload', path: '/seller/products/bulk' },
        ],
      },
      {
        title: 'Inventory',
        items: [
          { icon: <Package size={20} />, label: 'Stock Control', path: '/seller/inventory' },
        ],
      },
      {
        title: 'Courier',
        items: [
          { icon: <Truck size={20} />, label: 'Courier Center', path: '/seller/courier' },
          { icon: <MapPin size={20} />, label: 'Pickup Locations', path: '/seller/pickup-locations' },
        ],
      },
      {
        title: 'Customers',
        items: [
          { icon: <Bell size={20} />, label: 'Notifications', path: '/seller/notifications' },
          { icon: <Bell size={20} />, label: 'Reviews', path: '/seller/support/reviews' },
          { icon: <Mail size={20} />, label: 'Support Tickets', path: '/seller/support/tickets' },
          { icon: <Undo2 size={20} />, label: 'Returns', path: '/seller/support/returns' },
        ],
      },
      {
        title: 'Finance',
        items: [
          { icon: <CreditCard size={20} />, label: 'Earnings', path: '/seller/earnings' },
          { icon: <Wallet size={20} />, label: 'Payouts', path: '/seller/payouts' },
        ],
      },
      {
        title: 'Analytics',
        items: [
          { icon: <Gauge size={20} />, label: 'Performance', path: '/seller/analytics/performance' },
          { icon: <BookText size={20} />, label: 'Reports', path: '/seller/analytics/reports' },
        ],
      },
      {
        title: 'Marketing',
        items: [
          { icon: <Megaphone size={20} />, label: 'Ads Manager', path: '/seller/marketing/ads' },
          { icon: <Zap size={20} />, label: 'Promotions', path: '/seller/marketing/promotions' },
          { icon: <Tag size={20} />, label: 'Coupons', path: '/seller/marketing/coupons' },
        ],
      },
      {
        title: 'Storefront',
        items: [
          { icon: <Store size={20} />, label: 'Manage & Preview', path: '/seller/dashboard' },
          { icon: <Store size={20} />, label: 'Store Settings', path: '/seller/settings' },
        ],
      },
      {
        title: 'Settings',
        items: [
          { icon: <Settings size={20} />, label: 'General Settings', path: '/seller/settings' },
          { icon: <Store size={20} />, label: 'Vacation Mode', path: '/seller/settings/vacation' },
          { icon: <Bell size={20} />, label: 'Notification Preferences', path: '/seller/settings/notifications' },
        ],
      },
    ],
    admin: [
      {
        title: 'Overview',
        items: [
          { icon: <LayoutDashboard size={20} />, label: 'Admin Panel', path: '/admin/dashboard' },
          { icon: <Gauge size={20} />, label: 'Performance', path: '/admin/performance' },
        ],
      },
      {
        title: 'Order Operations',
        items: [
          { icon: <ShoppingBag size={20} />, label: 'Orders', path: '/admin/orders' },
          { icon: <Truck size={20} />, label: 'Logistics', path: '/admin/logistics' },
          { icon: <Undo2 size={20} />, label: 'Returns', path: '/admin/returns' },
        ],
      },
      {
        title: 'Finance & POS',
        items: [
          { icon: <CreditCard size={20} />, label: 'POS', path: '/admin/pos' },
          { icon: <CreditCard size={20} />, label: 'Payments', path: '/admin/payments' },
          { icon: <BookText size={20} />, label: 'Accounting', path: '/admin/accounting' },
        ],
      },
      {
        title: 'Catalog',
        items: [
          { icon: <ShoppingBag size={20} />, label: 'All Products', path: '/admin/products' },
          { icon: <Tag size={20} />, label: 'Categories', path: '/admin/categories' },
          { icon: <Zap size={20} />, label: 'Flash Sale', path: '/admin/flash-sale' },
          { icon: <Zap size={20} />, label: 'Coupons', path: '/admin/coupons' },
        ],
      },
      {
        title: 'Content & Community',
        items: [
          { icon: <Users2 size={20} />, label: 'Community', path: '/admin/community' },
          { icon: <Bell size={20} />, label: 'Reviews', path: '/admin/reviews' },
          { icon: <FileText size={20} />, label: 'About Page', path: '/admin/about' },
          { icon: <FileText size={20} />, label: 'Blog', path: '/admin/blog' },
          { icon: <ImageIcon size={20} />, label: 'Banners', path: '/admin/banners' },
        ],
      },
      {
        title: 'People',
        items: [
          { icon: <User size={20} />, label: 'Users', path: '/admin/users' },
          { icon: <Store size={20} />, label: 'Sellers', path: '/admin/sellers' },
          { icon: <Mail size={20} />, label: 'Support', path: '/admin/support' },
        ],
      },
      {
        title: 'System',
        items: [
          { icon: <Coins size={20} />, label: 'Gamification', path: '/admin/gamification' },
          { icon: <Settings size={20} />, label: 'System Settings', path: '/admin/settings' },
        ],
      },
    ],
    reseller: [
      {
        title: 'Overview',
        items: [
          { icon: <LayoutDashboard size={20} />, label: 'Reseller Panel', path: '/reseller-dashboard/overview' },
          { icon: <Sparkles size={20} />, label: 'Onboarding', path: '/reseller-dashboard/onboarding' },
        ],
      },
      {
        title: 'Catalog & Shop',
        items: [
          { icon: <Tag size={20} />, label: 'Catalog', path: '/reseller-dashboard/catalog' },
          { icon: <ShoppingBag size={20} />, label: 'My Shop', path: '/reseller-dashboard/shop' },
        ],
      },
      {
        title: 'Orders',
        items: [
          { icon: <FileText size={20} />, label: 'Manual Orders', path: '/reseller-dashboard/manual-orders' },
        ],
      },
      {
        title: 'Growth',
        items: [
          { icon: <Users2 size={20} />, label: 'My Network', path: '/reseller-dashboard/network' },
          { icon: <Zap size={20} />, label: 'Promotions', path: '/reseller-dashboard/promotions' },
        ],
      },
      {
        title: 'Finance',
        items: [
          { icon: <Wallet size={20} />, label: 'Earnings', path: '/reseller-dashboard/earnings' },
        ],
      },
      {
        title: 'Settings',
        items: [
          { icon: <Settings size={20} />, label: 'Settings', path: '/reseller-dashboard/settings' },
        ],
      },
    ],
  };

  const currentSections = useMemo(() => menuSections[type], [type]);

  const sectionBadgeTotals = useMemo(() => {
    return currentSections.reduce<Record<string, number>>((acc, section) => {
      acc[section.title] = section.items.reduce((sum, item) => sum + Number(badges[item.path] || 0), 0);
      return acc;
    }, {});
  }, [badges, currentSections]);

  const activeSectionTitles = useMemo(() => {
    return currentSections
      .filter((section) => section.items.some((item) => item.path === location.pathname))
      .map((section) => section.title);
  }, [currentSections, location.pathname]);

  useEffect(() => {
    if (activeSectionTitles.length === 0) return;

    setCollapsedSections((current) => {
      const next = current.filter((title) => !activeSectionTitles.includes(title));
      const unchanged =
        next.length === current.length &&
        next.every((title, index) => title === current[index]);
      return unchanged ? current : next;
    });
  }, [activeSectionTitles]);

  const toggleSection = (title: string) => {
    setCollapsedSections((current) =>
      current.includes(title)
        ? current.filter((entry) => entry !== title)
        : [...current, title],
    );
  };

  const pageLabel = useMemo(() => {
    for (const section of currentSections) {
      const matched = section.items.find((item) => location.pathname === item.path);
      if (matched) {
        return matched.label;
      }
    }
    return 'Dashboard';
  }, [currentSections, location.pathname, type]);

  const quickAccessPath = useMemo(() => {
    if (type === 'customer') return '/account/notifications';
    if (type === 'admin') return '/admin/support';
    if (type === 'seller') return '/seller/notifications';
    return '/reseller-dashboard/earnings';
  }, [type]);

  const quickAccessBadgeCount = Number(badges[quickAccessPath] || 0);

  const mobileHeaderActions = useMemo(() => {
    if (type === 'admin') {
      return [
        { label: 'Orders', path: '/admin/orders', icon: <ShoppingBag size={16} /> },
        { label: 'Inventory', path: '/admin/inventory', icon: <Truck size={16} /> },
        { label: 'POS', path: '/admin/pos', icon: <CreditCard size={16} /> },
      ];
    }

    if (type === 'seller') {
      return [
        { label: 'Overview', path: '/seller/dashboard', icon: <LayoutDashboard size={16} /> },
        { label: 'Orders', path: '/seller/orders', icon: <ShoppingBag size={16} /> },
        { label: 'Products', path: '/seller/products', icon: <ShoppingBag size={16} /> },
        { label: 'Alerts', path: '/seller/notifications', icon: <Bell size={16} /> },
        { label: 'Finance', path: '/seller/earnings', icon: <Wallet size={16} /> },
      ];
    }

    if (type === 'reseller') {
      return [
        { label: 'Catalog', path: '/reseller-dashboard/catalog', icon: <Tag size={16} /> },
        { label: 'Orders', path: '/reseller-dashboard/manual-orders', icon: <FileText size={16} /> },
        { label: 'Earnings', path: '/reseller-dashboard/earnings', icon: <Wallet size={16} /> },
      ];
    }

    return [
      { label: 'Orders', path: '/account/orders', icon: <ShoppingBag size={16} /> },
      { label: 'Wishlist', path: '/account/wishlist', icon: <Heart size={16} /> },
      { label: 'Settings', path: '/account/settings', icon: <Settings size={16} /> },
    ];
  }, [type]);

  const customerQuickLinks = useMemo(() => {
    if (type !== 'customer') return [];
    return currentSections.flatMap((section) => section.items);
  }, [currentSections, type]);

  const scrollCustomerQuickLinks = (direction: 'left' | 'right') => {
    const container = customerQuickLinksRef.current;
    if (!container) {
      return;
    }

    const offset = Math.max(180, Math.floor(container.clientWidth * 0.7));
    container.scrollBy({
      left: direction === 'left' ? -offset : offset,
      behavior: 'smooth',
    });
  };

  useEffect(() => {
    if (type !== 'customer' || typeof window === 'undefined') {
      return;
    }

    const container = customerQuickLinksRef.current;
    if (!container) {
      return;
    }

    const updateScrollState = () => {
      const maxScrollLeft = container.scrollWidth - container.clientWidth;
      const nextState = {
        canScrollLeft: container.scrollLeft > 8,
        canScrollRight: maxScrollLeft - container.scrollLeft > 8,
      };

      setCustomerToolbarScrollState((current) =>
        current.canScrollLeft === nextState.canScrollLeft &&
        current.canScrollRight === nextState.canScrollRight
          ? current
          : nextState,
      );
    };

    updateScrollState();

    container.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);

    return () => {
      container.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [customerQuickLinks, type]);

  const sidebarWidth = collapsed ? 'lg:w-[72px]' : 'lg:w-[220px]';
  const accent = roleAccentMap[type];
  const isSeller = type === 'seller';
  const sellerInitials = useMemo(() => {
    const source = String(user?.store_name || user?.name || 'Seller')
      .split(' ')
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, 2);
    if (source.length === 0) return 'SL';
    return source.map((part) => part[0]?.toUpperCase() || '').join('');
  }, [user?.name, user?.store_name]);
  const sellerWorkspaceName = user?.store_name || user?.storefront_slug || user?.name || 'MerchantOS';
  const sellerWorkspaceSubtitle =
    user?.storefront_headline ||
    (user?.storefront_slug ? `/store/${user.storefront_slug}` : null) ||
    'Store information';
  const sellerHeaderBreadcrumb = activeSectionTitles[0] || 'Overview';

  const handleSellerSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = sellerSearch.trim();
    if (!query) {
      navigate('/seller/products');
      return;
    }

    const normalized = query.toLowerCase();
    const targetPath =
      normalized.startsWith('#') ||
      normalized.includes('ord') ||
      normalized.includes('track') ||
      normalized.includes('trk') ||
      normalized.includes('ship')
        ? '/seller/orders'
        : '/seller/products';

    navigate(`${targetPath}?search=${encodeURIComponent(query)}`);
  };

  if (!isReady || !isAuthenticated || !token || !user) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 lg:px-6">
        <div className="surface-card flex min-h-[220px] items-center justify-center text-sm font-semibold text-slate-500">
          Securing your workspace...
        </div>
      </div>
    );
  }

  if (isSeller) {
    return (
      <SellerDashboardShell
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        pageLabel={pageLabel}
        sellerSearch={sellerSearch}
        setSellerSearch={setSellerSearch}
        onSearchSubmit={handleSellerSearchSubmit}
        quickAccessBadgeCount={quickAccessBadgeCount}
        sellerWorkspaceName={sellerWorkspaceName}
        sellerWorkspaceSubtitle={sellerWorkspaceSubtitle}
        sellerInitials={sellerInitials}
        avatarUrl={user.avatar_url}
        currentSections={currentSections}
        pathname={location.pathname}
        badges={badges}
        sectionBadgeTotals={sectionBadgeTotals}
        activeSectionTitles={activeSectionTitles}
        collapsedSections={collapsedSections}
        toggleSection={toggleSection}
        sellerFooterOpen={sellerFooterOpen}
        setSellerFooterOpen={setSellerFooterOpen}
        sellerFooterRef={sellerFooterRef}
        mobileHeaderActions={mobileHeaderActions}
        onNavigate={(path) => navigate(path)}
        onLogout={() => {
          setSellerFooterOpen(false);
          logout();
          navigate('/');
        }}
      >
        {children}
      </SellerDashboardShell>
    );
  }

  const sidebarContent = (
    <div
      className={cn(
        isSeller ? 'seller-sidebar-shell flex h-auto flex-col overflow-hidden' : 'dashboard-sidebar flex h-auto flex-col rounded-[1.75rem]',
        isSeller ? 'py-0' : collapsed ? 'px-3 py-5' : 'px-4 py-5',
      )}
    >
      {isSeller ? (
        <div className="flex h-[56px] items-center border-b border-slate-200 px-4">
          {!collapsed ? (
            <Link to="/seller/dashboard" className="flex min-w-0 items-center gap-2">
              <span className="flex aspect-square size-6 items-center justify-center rounded-md bg-primary text-white">
                <Package size={14} />
              </span>
              <span className="truncate text-sm font-bold tracking-tight text-slate-950">MerchantOS</span>
            </Link>
          ) : (
            <Link to="/seller/dashboard" className="mx-auto flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-white">
              <Package size={14} />
            </Link>
          )}
        </div>
      ) : (
        <div className={cn('mb-6 flex items-center', collapsed ? 'justify-center' : 'justify-between gap-3 px-2')}>
          <button
            type="button"
            onClick={() => setCollapsed((current) => !current)}
            className="hidden h-10 w-10 items-center justify-center rounded-2xl border border-border text-muted-foreground transition hover:bg-secondary hover:text-primary lg:inline-flex"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
      )}

      {isSeller ? (
        <div className="px-2 py-3">
          <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Main Menu</div>
        </div>
      ) : null}

      <div className={cn('flex-1', isSeller ? 'px-2 pb-3' : '')}>
        <div className={cn(isSeller ? 'space-y-3' : 'space-y-5')}>
          {currentSections.map((section) => (
            <div key={section.title} className="space-y-2">
              {isSeller ? (
                <>
                  {section.items.length === 1 ? (() => {
                    const item = section.items[0];
                    const isActive = location.pathname === item.path;
                    const badgeCount = Number(badges[item.path] || 0);
                    return (
                      <Link
                        to={item.path}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          'seller-nav-link group relative flex w-full items-center rounded-lg text-xs font-medium transition-all',
                          collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2',
                          isActive ? 'seller-nav-link--active text-slate-950' : 'text-muted-foreground',
                        )}
                      >
                        <span className="dashboard-nav-link__icon h-8 w-8 shrink-0">{item.icon}</span>
                        {!collapsed ? (
                          <>
                            <span className="dashboard-nav-link__label flex-1">{item.label}</span>
                            {badgeCount > 0 ? (
                              <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                                {badgeCount > 99 ? '99+' : badgeCount}
                              </span>
                            ) : null}
                          </>
                        ) : badgeCount > 0 ? (
                          <span className="absolute right-2 top-2 inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                        ) : null}
                      </Link>
                    );
                  })() : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (!collapsed) toggleSection(section.title);
                        }}
                        title={collapsed ? section.title : undefined}
                        className={cn(
                          'seller-nav-link group relative flex w-full items-center rounded-lg text-xs font-medium transition-all',
                          collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2 text-left',
                          activeSectionTitles.includes(section.title) ? 'seller-nav-link--active text-slate-950' : 'text-muted-foreground',
                        )}
                      >
                        <span className="dashboard-nav-link__icon h-8 w-8 shrink-0">{section.items[0]?.icon ?? <Store size={14} />}</span>
                        {!collapsed ? (
                          <>
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
                          </>
                        ) : Number(sectionBadgeTotals[section.title] || 0) > 0 ? (
                          <span className="absolute right-2 top-2 inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                        ) : null}
                      </button>

                      {!collapsed && !collapsedSections.includes(section.title) ? (
                        <div className="ml-4 pl-2">
                          {section.items.map((item) => {
                            const itemActive = location.pathname === item.path;
                            const badgeCount = Number(badges[item.path] || 0);
                            return (
                              <Link
                                key={item.path}
                                to={item.path}
                                className={cn(
                                  'flex items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] transition',
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
                </>
              ) : null}

              {!isSeller && !collapsed ? (
                <button
                  type="button"
                  onClick={() => toggleSection(section.title)}
                  className={cn(
                    'dashboard-section-toggle flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition',
                    activeSectionTitles.includes(section.title) ? 'border-primary/15 bg-primary/[0.07]' : '',
                  )}
                  aria-expanded={!collapsedSections.includes(section.title)}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        'h-2 w-2 shrink-0 rounded-full',
                        activeSectionTitles.includes(section.title) ? accent.dot : 'bg-slate-300',
                      )}
                    />
                    <span className="truncate text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                      {section.title}
                    </span>
                    {Number(sectionBadgeTotals[section.title] || 0) > 0 ? (
                      <span className="inline-flex min-w-[1.4rem] items-center justify-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                        {sectionBadgeTotals[section.title] > 99 ? '99+' : sectionBadgeTotals[section.title]}
                      </span>
                    ) : null}
                  </div>
                  {collapsedSections.includes(section.title) ? (
                    <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
                  )}
                </button>
              ) : null}
              {!isSeller ? (
              <div className={cn('space-y-1.5', !collapsed && collapsedSections.includes(section.title) ? 'hidden' : '')}>
                {section.items.map((item) => {
                  const isActive = location.pathname === item.path;
                  const badgeCount = Number(badges[item.path] || 0);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        isSeller
                          ? 'seller-nav-link group flex items-center rounded-lg text-xs font-medium transition-all'
                          : 'dashboard-nav-link group flex items-center rounded-xl text-sm font-medium transition-all',
                        collapsed ? 'justify-center px-2 py-2' : isSeller ? 'gap-3 px-3 py-2' : 'gap-3 px-3.5 py-2.5',
                        isActive
                          ? isSeller
                            ? 'seller-nav-link--active text-slate-950'
                            : 'dashboard-nav-link--active text-white'
                          : 'text-muted-foreground hover:bg-secondary hover:text-primary',
                      )}
                    >
                      <span className="dashboard-nav-link__shimmer" />
                      {isActive && !collapsed && !isSeller ? (
                        <span className={cn('absolute left-0 top-2 bottom-2 w-1 rounded-r-full', accent.dot)} />
                      ) : null}
                      <span className={cn('dashboard-nav-link__icon shrink-0', isSeller ? 'h-8 w-8' : 'h-9 w-9')}>{item.icon}</span>
                      {!collapsed ? (
                        <>
                          <span className="dashboard-nav-link__label flex-1">{item.label}</span>
                          {badgeCount > 0 ? (
                            <span
                              className={cn(
                                'inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold',
                                isActive
                                  ? isSeller
                                    ? 'bg-primary/10 text-primary'
                                    : 'bg-white/20 text-white'
                                  : 'bg-primary/10 text-primary',
                              )}
                            >
                              {badgeCount > 99 ? '99+' : badgeCount}
                            </span>
                          ) : null}
                          {isActive ? <ChevronRight size={16} /> : null}
                        </>
                      ) : badgeCount > 0 ? (
                        <span className="absolute right-2 top-2 inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                      ) : null}
                    </Link>
                  );
                })}
              </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {isSeller ? (
        <div ref={sellerFooterRef} className="relative border-t border-slate-200 px-2 py-3">
          {!collapsed ? (
            <div className="rounded-lg">
              <button
                type="button"
                onClick={() => setSellerFooterOpen((current) => !current)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition',
                  sellerFooterOpen ? 'bg-slate-100 text-slate-950' : 'hover:bg-slate-100',
                )}
              >
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={sellerWorkspaceName}
                    className="h-8 w-8 rounded-lg border border-slate-200 object-cover"
                    loading="eager"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700">
                    {sellerInitials}
                  </div>
                )}
                <div className="min-w-0 flex-1 text-left text-sm leading-tight">
                  <span className="block truncate font-semibold text-slate-900">{user?.name || sellerWorkspaceName}</span>
                  <span className="block truncate text-xs text-slate-500">{sellerWorkspaceSubtitle}</span>
                </div>
                <ChevronsUpDown size={16} className="text-slate-400" />
              </button>
              {sellerFooterOpen ? (
                <div className="absolute inset-x-2 bottom-[calc(100%+0.5rem)] z-30 rounded-lg border border-slate-200 bg-white p-1 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.28)]">
                  <div className="flex items-center gap-2 px-2 py-2 text-left text-sm">
                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url}
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
                      <span className="block truncate font-semibold text-slate-900">{user?.name || sellerWorkspaceName}</span>
                      <span className="block truncate text-xs text-slate-500">{sellerWorkspaceSubtitle}</span>
                    </div>
                  </div>
                  <div className="my-1 border-t border-slate-200" />
                  <button
                    type="button"
                    onClick={() => navigate('/seller/settings')}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    <User size={16} />
                    <span>Account</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/seller/settings')}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    <Settings size={16} />
                    <span>Settings</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/seller/orders')}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    <Bell size={16} />
                    <span>Notifications</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSellerFooterOpen(false);
                      logout();
                      navigate('/');
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-rose-600"
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
              onClick={() => navigate('/seller/settings')}
              className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
              aria-label="Seller account"
            >
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
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
      ) : (
        <div className="mt-6 border-t border-border/80 pt-4">
          <button
            onClick={() => {
              logout();
              navigate('/');
            }}
            className={cn(
              'dashboard-signout w-full rounded-2xl text-sm font-medium text-accent transition-all',
              collapsed ? 'flex justify-center px-2 py-3' : 'flex items-center gap-3 px-4 py-3',
            )}
          >
            <LogOut size={20} />
            {!collapsed ? <span>Sign Out</span> : null}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className={cn('dashboard-shell px-4 py-4 lg:px-6 lg:py-5', isSeller ? 'mx-0 max-w-none bg-[#f4f5f7]' : 'mx-auto max-w-7xl')}>
      {isSeller ? (
        <div className="seller-topbar-shell mb-4">
          <div className="flex h-[56px] items-center gap-2 bg-white">
            <div className="flex w-full items-center gap-2 px-4 md:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 transition hover:bg-slate-100 lg:hidden"
              aria-label="Open seller dashboard menu"
            >
              <Menu size={18} />
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

            <form onSubmit={handleSellerSearchSubmit} className="hidden flex-1 max-w-[300px] min-w-0 md:block">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" size={14} />
                <input
                  type="search"
                  value={sellerSearch}
                  onChange={(event) => setSellerSearch(event.target.value)}
                  placeholder="Search products, orders or customers..."
                  className="h-9 w-full rounded-lg border-none bg-[#f4f4f4] pl-9 pr-4 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:ring-1 focus:ring-primary/30"
                />
              </label>
            </form>

            <div className="ml-auto flex items-center gap-4">
              <Link
                to="/seller/orders"
                className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-primary"
                title="Orders"
              >
                <Bell size={16} />
                {quickAccessBadgeCount > 0 ? (
                  <span className="absolute right-1 top-1.5 h-2 w-2 rounded-full border-2 border-white bg-red-500" />
                ) : null}
              </Link>
              <div className="flex items-center gap-3 border-l border-slate-200 pl-4">
                <div className="hidden text-right sm:block">
                  <div className="text-[11px] font-bold leading-none text-slate-950">{sellerWorkspaceName}</div>
                  <div className="mt-1 text-[10px] leading-none text-slate-500">Premium Seller</div>
                </div>
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
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
          <div className="border-t border-slate-200 px-4 py-2 md:hidden">
            <form onSubmit={handleSellerSearchSubmit} className="mb-2">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" size={14} />
                <input
                  type="search"
                  value={sellerSearch}
                  onChange={(event) => setSellerSearch(event.target.value)}
                  placeholder="Search products, orders or customers..."
                  className="h-9 w-full rounded-lg border-none bg-[#f4f4f4] pl-9 pr-4 text-xs text-slate-700 outline-none transition focus:ring-1 focus:ring-primary/30"
                />
              </label>
            </form>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {mobileHeaderActions.map((action) => {
                const active = location.pathname === action.path;
                return (
                  <Link
                    key={action.path}
                    to={action.path}
                    className={cn(
                      'mobile-action-chip shrink-0',
                      active
                        ? 'mobile-action-chip--active'
                        : '',
                    )}
                  >
                    {action.icon}
                    <span>{action.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : type !== 'customer' ? (
        <div className="dashboard-topbar mb-5 rounded-[2rem] px-4 py-3 lg:mb-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="mobile-action-chip inline-flex h-11 w-11 justify-center px-0 lg:hidden"
                aria-label="Open dashboard menu"
              >
                <Menu size={20} />
              </button>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{pageLabel}</p>
                <h1 className="truncate text-lg font-bold text-slate-950">{pageLabel}</h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                to={quickAccessPath}
                className="mobile-action-chip relative inline-flex h-11 w-11 justify-center px-0"
                title="Quick access"
              >
                <Bell size={18} />
                {quickAccessBadgeCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                    {quickAccessBadgeCount > 99 ? '99+' : quickAccessBadgeCount}
                  </span>
                ) : null}
              </Link>
            </div>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {mobileHeaderActions.map((action) => {
              const active = location.pathname === action.path;
              return (
                <Link
                  key={action.path}
                  to={action.path}
                  className={cn(
                    'mobile-action-chip shrink-0',
                    active
                      ? 'mobile-action-chip--active'
                      : '',
                  )}
                >
                  {action.icon}
                  <span>{action.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      {type === 'customer' ? (
        <div className="mobile-sticky-toolbar -mt-2 mb-4 px-3 py-2 lg:mb-5">
          <div className="relative">
            <button
              type="button"
              aria-label="Scroll toolbar left"
              onClick={() => scrollCustomerQuickLinks('left')}
              className={cn(
                'absolute left-1 top-1/2 z-[1] hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-400 shadow-sm transition hover:bg-white md:flex',
                customerToolbarScrollState.canScrollLeft ? 'opacity-100' : 'pointer-events-none opacity-0',
              )}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              aria-label="Scroll toolbar right"
              onClick={() => scrollCustomerQuickLinks('right')}
              className={cn(
                'absolute right-1 top-1/2 z-[1] hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-400 shadow-sm transition hover:bg-white md:flex',
                customerToolbarScrollState.canScrollRight ? 'opacity-100' : 'pointer-events-none opacity-0',
              )}
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              aria-label="Scroll toolbar left"
              onClick={() => scrollCustomerQuickLinks('left')}
              className={cn(
                'absolute left-1 top-1/2 z-[1] flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-400 shadow-sm transition hover:bg-white md:hidden',
                customerToolbarScrollState.canScrollLeft ? 'opacity-100' : 'pointer-events-none opacity-0',
              )}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              aria-label="Scroll toolbar right"
              onClick={() => scrollCustomerQuickLinks('right')}
              className={cn(
                'absolute right-1 top-1/2 z-[1] flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-400 shadow-sm transition hover:bg-white md:hidden',
                customerToolbarScrollState.canScrollRight ? 'opacity-100' : 'pointer-events-none opacity-0',
              )}
            >
              <ChevronRight size={15} />
            </button>
            <div
              ref={customerQuickLinksRef}
              className="dashboard-chip-scroll flex justify-start gap-2 overflow-x-auto whitespace-nowrap px-10 md:justify-center"
            >
            {customerQuickLinks.map((item) => {
              const active = location.pathname === item.path;
              const badgeCount = Number(badges[item.path] || 0);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'mobile-action-chip relative shrink-0',
                    active ? 'mobile-action-chip--active' : '',
                  )}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {badgeCount > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex min-w-[1.15rem] items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/');
              }}
              className="mobile-action-chip shrink-0"
            >
              <LogOut size={16} />
              <span>Sign Out</span>
            </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={cn('flex', isSeller ? 'gap-0' : 'gap-6 lg:gap-8')}>
        {type !== 'customer' ? (
          <aside
            className={cn(
              'hidden flex-shrink-0 self-start transition-all duration-300 lg:block',
              sidebarWidth,
              isSeller ? 'seller-sidebar-wrap lg:sticky lg:top-0' : 'lg:sticky lg:top-0 lg:h-screen lg:overflow-hidden',
            )}
          >
            <div className="dashboard-sidebar-scroll flex h-full flex-col overflow-y-auto overflow-x-hidden pb-5">{sidebarContent}</div>
          </aside>
        ) : null}

        <main className={cn('min-w-0 flex-1', isSeller ? 'seller-main-content' : '')}>{children}</main>
      </div>

      {mobileOpen && type !== 'customer' ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close dashboard menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
          />
          <div className={cn('absolute inset-y-0 left-0 w-[88vw] max-w-[340px]', isSeller ? 'p-0' : 'p-3')}>
            <div
              className={cn(
                'flex h-full flex-col',
                isSeller ? 'seller-sidebar-shell rounded-none shadow-none' : 'dashboard-sidebar rounded-[28px] shadow-2xl',
              )}
            >
              <div
                className={cn(
                  'flex items-center justify-between border-b px-4',
                  isSeller ? 'h-[56px] border-slate-200 bg-white' : 'border-border py-4',
                )}
              >
                <div className="min-w-0">
                  <h2 className={cn('truncate font-bold', isSeller ? 'text-sm text-slate-950' : 'text-base text-foreground')}>{pageLabel}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'inline-flex items-center justify-center',
                    isSeller
                      ? 'h-9 w-9 rounded-lg text-slate-700 transition hover:bg-slate-100'
                      : 'mobile-action-chip h-10 w-10 px-0',
                  )}
                  aria-label="Close dashboard menu"
                >
                  <X size={18} />
                </button>
              </div>
              <div className={cn('min-h-0 flex-1 overflow-y-auto', isSeller ? 'bg-white p-0' : 'p-3')}>{sidebarContent}</div>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
};
