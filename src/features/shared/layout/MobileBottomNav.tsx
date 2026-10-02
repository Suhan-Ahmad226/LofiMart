'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthModal } from '@/features/auth/context/AuthModalContext';
import { Link, useLocation } from '../../../lib/navigation';
import {
  Boxes,
  ClipboardList,
  Heart,
  Home,
  LayoutDashboard,
  Package2,
  Settings,
  ShoppingCart,
  Truck,
  User,
  Wallet,
} from 'lucide-react';
import { useCart } from '../../../features/shop/state/CartContext';
import { useUser } from '../../../features/shared/state/UserContext';
import { useWishlist } from '../../../features/shop/state/WishlistContext';

type MobileNavItem = {
  label: string;
  path: string;
  icon: React.ReactNode;
  badge?: 'cart' | 'wishlist';
};

const SCROLL_THRESHOLD = 10;
const TOP_THRESHOLD = 24;
const BOTTOM_OFFSET = 120;

const getIsActivePath = (pathname: string, path: string): boolean => {
  if (path === '/') {
    return pathname === '/';
  }

  return pathname === path || pathname.startsWith(`${path}/`);
};

const getAccountPath = (
  isAuthenticated: boolean,
  role?: string | null,
): string => {
  if (!isAuthenticated) {
    openAuth({ returnTo: '/account/dashboard' }); return '#';
  }

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
};

export const MobileBottomNav = () => {
  const { totalItems } = useCart();
  const { user, isAuthenticated } = useUser();
  const { items: wishlistItems } = useWishlist();
  const location = useLocation();

  const [isVisible, setIsVisible] = useState(true);

  /*
   * Detect scroll direction.
   *
   * Behavior:
   * - Near top: always visible
   * - Scrolling up: visible
   * - Scrolling down: hidden
   * - Near bottom: visible
   *
   * A small threshold prevents flickering while the user
   * makes tiny scroll movements.
   */
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let lastScrollY = window.scrollY;
    let ticking = false;

    const updateVisibility = () => {
      const currentScrollY = window.scrollY;
      const viewportHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;

      const scrollDifference = Math.abs(currentScrollY - lastScrollY);

      if (scrollDifference < SCROLL_THRESHOLD) {
        ticking = false;
        return;
      }

      const nearTop = currentScrollY <= TOP_THRESHOLD;

      const nearBottom =
        currentScrollY + viewportHeight >=
        documentHeight - BOTTOM_OFFSET;

      const scrollingUp = currentScrollY < lastScrollY;

      if (nearTop || nearBottom || scrollingUp) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }

      lastScrollY = currentScrollY;
      ticking = false;
    };

    const handleScroll = () => {
      if (ticking) {
        return;
      }

      ticking = true;
      window.requestAnimationFrame(updateVisibility);
    };

    window.addEventListener('scroll', handleScroll, {
      passive: true,
    });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  /*
   * Hide the bottom navigation while the user is on
   * desktop-only dashboard routes.
   *
   * CSS md:hidden already handles this visually,
   * but keeping the component lightweight is useful.
   */
  const mobileQuickLinks = useMemo<MobileNavItem[]>(() => {
    const pathname = location.pathname;

    /*
     * Admin
     */
    if (
      pathname === '/admin' ||
      pathname.startsWith('/admin/')
    ) {
      return [
        {
          label: 'Dashboard',
          path: '/admin/dashboard',
          icon: <LayoutDashboard size={19} strokeWidth={2} />,
        },
        {
          label: 'Orders',
          path: '/admin/orders',
          icon: <ClipboardList size={19} strokeWidth={2} />,
        },
        {
          label: 'Inventory',
          path: '/admin/inventory',
          icon: <Boxes size={19} strokeWidth={2} />,
        },
        {
          label: 'Settings',
          path: '/admin/settings',
          icon: <Settings size={19} strokeWidth={2} />,
        },
      ];
    }

    /*
     * Seller
     */
    if (
      pathname === '/seller' ||
      pathname.startsWith('/seller/')
    ) {
      return [
        {
          label: 'Overview',
          path: '/seller/dashboard',
          icon: <LayoutDashboard size={19} strokeWidth={2} />,
        },
        {
          label: 'Products',
          path: '/seller/products',
          icon: <Package2 size={19} strokeWidth={2} />,
        },
        {
          label: 'Orders',
          path: '/seller/orders',
          icon: <ClipboardList size={19} strokeWidth={2} />,
        },
        {
          label: 'Courier',
          path: '/seller/courier',
          icon: <Truck size={19} strokeWidth={2} />,
        },
        {
          label: 'Earnings',
          path: '/seller/earnings',
          icon: <Wallet size={19} strokeWidth={2} />,
        },
      ];
    }

    /*
     * Reseller
     */
    if (
      pathname === '/reseller-dashboard' ||
      pathname.startsWith('/reseller-dashboard/')
    ) {
      return [
        {
          label: 'Overview',
          path: '/reseller-dashboard/overview',
          icon: <LayoutDashboard size={19} strokeWidth={2} />,
        },
        {
          label: 'Shop',
          path: '/reseller-dashboard/shop',
          icon: <Package2 size={19} strokeWidth={2} />,
        },
        {
          label: 'Orders',
          path: '/reseller-dashboard/manual-orders',
          icon: <ClipboardList size={19} strokeWidth={2} />,
        },
        {
          label: 'Earnings',
          path: '/reseller-dashboard/earnings',
          icon: <Wallet size={19} strokeWidth={2} />,
        },
        {
          label: 'Settings',
          path: '/reseller-dashboard/settings',
          icon: <Settings size={19} strokeWidth={2} />,
        },
      ];
    }

    /*
     * Customer account
     */
    if (
      pathname === '/account' ||
      pathname.startsWith('/account/')
    ) {
      return [
        {
          label: 'Home',
          path: '/account/dashboard',
          icon: <LayoutDashboard size={19} strokeWidth={2} />,
        },
        {
          label: 'Orders',
          path: '/account/orders',
          icon: <ClipboardList size={19} strokeWidth={2} />,
        },
        {
          label: 'Wishlist',
          path: '/wishlist',
          icon: <Heart size={19} strokeWidth={2} />,
          badge: 'wishlist',
        },
        {
          label: 'Wallet',
          path: '/account/wallet',
          icon: <Wallet size={19} strokeWidth={2} />,
        },
        {
          label: 'Settings',
          path: '/account/settings',
          icon: <Settings size={19} strokeWidth={2} />,
        },
      ];
    }

    /*
     * Public storefront
     */
    return [
      {
        label: 'Home',
        path: '/',
        icon: <Home size={19} strokeWidth={2} />,
      },
      {
        label: 'Shop',
        path: '/shop',
        icon: <Package2 size={19} strokeWidth={2} />,
      },
      {
        label: 'Wishlist',
        path: '/wishlist',
        icon: <Heart size={19} strokeWidth={2} />,
        badge: 'wishlist',
      },
      {
        label: 'Cart',
        path: '/cart',
        icon: <ShoppingCart size={19} strokeWidth={2} />,
        badge: 'cart',
      },
      {
        label: 'Account',
        path: getAccountPath(isAuthenticated, user?.role),
        icon: <User size={19} strokeWidth={2} />,
      },
    ];
  }, [isAuthenticated, location.pathname, user?.role]);

  /*
   * Prevent excessive badge width.
   */
  const formatBadgeCount = (count: number): string => {
    if (count <= 0) {
      return '';
    }

    if (count > 99) {
      return '99+';
    }

    return String(count);
  };

  /*
   * Get badge value for each navigation item.
   */
  const getBadgeCount = (item: MobileNavItem): number => {
    if (item.badge === 'cart') {
      return totalItems;
    }

    if (item.badge === 'wishlist') {
      return wishlistItems.length;
    }

    return 0;
  };

  /*
   * Keep the navigation usable after client-side route changes.
   */
  useEffect(() => {
    setIsVisible(true);
  }, [location.pathname]);

  return (
    <nav
      className={[
        'app-bottom-nav',
        'fixed inset-x-0 bottom-0 z-[60]',
        'md:hidden',
        'transform-gpu',
        'transition-[transform,opacity]',
        'duration-300',
        'ease-out',
        'will-change-transform',
        isVisible
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-full opacity-0',
      ].join(' ')}
      aria-label="Mobile bottom navigation"
    >
      <div
        className={[
          'mx-auto w-full',
          'border-t border-black/5',
          'bg-white/95',
          'shadow-[0_-8px_30px_rgba(0,0,0,0.08)]',
          'backdrop-blur-xl',
          'supports-[backdrop-filter]:bg-white/80',
          'pb-[env(safe-area-inset-bottom)]',
        ].join(' ')}
      >
        <div className="mx-auto w-full max-w-xl px-1.5 sm:px-3">
          <div className="grid grid-cols-5 gap-0.5 sm:gap-1">
            {mobileQuickLinks.map((item) => {
              const active = getIsActivePath(
                location.pathname,
                item.path,
              );

              const badgeCount = getBadgeCount(item);
              const badgeText = formatBadgeCount(badgeCount);

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'relative flex min-w-0 flex-col items-center justify-center',
                    'px-1 py-2.5 sm:py-3',
                    'rounded-xl',
                    'transition-colors duration-200',
                    'select-none',
                    'focus:outline-none',
                    'focus-visible:ring-2',
                    'focus-visible:ring-primary/40',
                    active
                      ? 'text-primary'
                      : 'text-slate-500 hover:text-slate-800',
                  ].join(' ')}
                >
                  <span
                    aria-hidden="true"
                    className={[
                      'absolute top-0 h-0.5 w-7 rounded-b-full',
                      'transition-all duration-200',
                      active
                        ? 'bg-primary opacity-100'
                        : 'bg-transparent opacity-0',
                    ].join(' ')}
                  />

                  <span
                    className={[
                      'relative flex h-8 w-8 items-center justify-center',
                      'rounded-xl',
                      'transition-all duration-200',
                      active
                        ? 'bg-primary/10'
                        : 'bg-transparent',
                    ].join(' ')}
                  >
                    {item.icon}

                    {badgeText ? (
                      <span
                        className={[
                          'absolute -right-2 -top-1',
                          'flex min-w-[17px] items-center justify-center',
                          'rounded-full',
                          'bg-accent',
                          'px-1',
                          'py-0.5',
                          'text-[9px]',
                          'font-bold',
                          'leading-none',
                          'text-white',
                          'shadow-sm',
                          'ring-2 ring-white',
                        ].join(' ')}
                        aria-label={`${badgeCount} ${item.badge === 'cart' ? 'items in cart' : 'items in wishlist'}`}
                      >
                        {badgeText}
                      </span>
                    ) : null}
                  </span>

                  <span
                    className={[
                      'mt-1',
                      'max-w-full',
                      'truncate',
                      'px-0.5',
                      'text-[10px]',
                      'font-semibold',
                      'leading-4',
                      'sm:text-[11px]',
                    ].join(' ')}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default MobileBottomNav;