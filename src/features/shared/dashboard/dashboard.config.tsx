import {
  Bell,
  CreditCard,
  FileText,
  Gauge,
  Heart,
  Image as ImageIcon,
  LayoutDashboard,
  Mail,
  MapPin,
  Package,
  Settings,
  Share2,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  Tag,
  Truck,
  Undo2,
  User,
  Users2,
  Wallet,
  Zap,
} from 'lucide-react';
import type { DashboardConfig, DashboardMenuItem, DashboardMobileAction, DashboardProfileItem, DashboardRole } from './dashboard.types';

const customerSections: DashboardConfig['sections'] = [
  { title: 'Overview', items: [{ icon: <LayoutDashboard size={20} />, label: 'Dashboard', path: '/account/dashboard' }] },
  { title: 'Shopping', items: [
    { icon: <ShoppingBag size={20} />, label: 'My Orders', path: '/account/orders' },
    { icon: <Heart size={20} />, label: 'Wishlist', path: '/wishlist' },
  ] },
  { title: 'Wallet & Rewards', items: [{ icon: <Wallet size={20} />, label: 'My Wallet', path: '/account/wallet' }] },
  { title: 'Preferences', items: [
    { icon: <Bell size={20} />, label: 'Notifications', path: '/account/notifications' },
    { icon: <Settings size={20} />, label: 'Settings', path: '/account/settings' },
  ] },
];

const sellerSections: DashboardConfig['sections'] = [
  { title: 'Overview', items: [
    { icon: <LayoutDashboard size={20} />, label: 'Overview', path: '/seller/dashboard' },
    { icon: <Sparkles size={20} />, label: 'Onboarding', path: '/seller/onboarding' },
  ] },
  { title: 'Orders', items: [
    { icon: <ShoppingBag size={20} />, label: 'All Orders', path: '/seller/orders' },
    { icon: <FileText size={20} />, label: 'Manual Orders', path: '/seller/manual-orders' },
  ] },
  { title: 'Products', items: [
    { icon: <ShoppingBag size={20} />, label: 'All Products', path: '/seller/products' },
    { icon: <Package size={20} />, label: 'Add Product', path: '/seller/products/add' },
    { icon: <FileText size={20} />, label: 'Bulk Upload', path: '/seller/products/bulk' },
  ] },
  { title: 'Inventory', items: [{ icon: <Package size={20} />, label: 'Stock Control', path: '/seller/inventory' }] },
  { title: 'Courier', items: [
    { icon: <Truck size={20} />, label: 'Courier Center', path: '/seller/courier' },
    { icon: <MapPin size={20} />, label: 'Pickup Locations', path: '/seller/pickup-locations' },
  ] },
  { title: 'Support & Community', items: [
    { icon: <Bell size={20} />, label: 'Notifications', path: '/seller/notifications' },
    { icon: <Star size={20} />, label: 'Reviews', path: '/seller/support/reviews' },
    { icon: <Mail size={20} />, label: 'Support Tickets', path: '/seller/support/tickets' },
    { icon: <Undo2 size={20} />, label: 'Returns', path: '/seller/support/returns' },
  ] },
  { title: 'Finance', items: [
    { icon: <CreditCard size={20} />, label: 'Earnings', path: '/seller/earnings' },
    { icon: <Wallet size={20} />, label: 'Payouts', path: '/seller/payouts' },
  ] },
  { title: 'Marketing', items: [
    { icon: <Zap size={20} />, label: 'Promotions', path: '/seller/flash-sale' },
    { icon: <Tag size={20} />, label: 'Coupons', path: '/seller/marketing' },
  ] },
  { title: 'Social Automation', items: [
    { icon: <Share2 size={20} />, label: 'Overview', path: '/social-automation' },
    { icon: <ShoppingBag size={20} />, label: 'Products', path: '/social-automation/products' },
  ] },
  { title: 'Settings', items: [{ icon: <Settings size={20} />, label: 'General Settings', path: '/seller/settings' }] },
];

const adminSections: DashboardConfig['sections'] = [
  { title: 'Overview', items: [
    { icon: <LayoutDashboard size={20} />, label: 'Admin Panel', path: '/admin/dashboard' },
    { icon: <Gauge size={20} />, label: 'Performance', path: '/admin/performance' },
  ] },
  { title: 'Order Operations', items: [
    { icon: <ShoppingBag size={20} />, label: 'Orders', path: '/admin/orders' },
    { icon: <Truck size={20} />, label: 'Logistics', path: '/admin/logistics' },
    { icon: <Undo2 size={20} />, label: 'Returns', path: '/admin/returns' },
  ] },
  { title: 'Finance', items: [{ icon: <CreditCard size={20} />, label: 'Payments', path: '/admin/payments' }] },
  { title: 'Catalog', items: [
    { icon: <ShoppingBag size={20} />, label: 'All Products', path: '/admin/products' },
    { icon: <Tag size={20} />, label: 'Categories', path: '/admin/categories' },
    { icon: <Zap size={20} />, label: 'Flash Sale', path: '/admin/flash-sale' },
    { icon: <Zap size={20} />, label: 'Coupons', path: '/admin/coupons' },
  ] },
  { title: 'Content & Community', items: [
    { icon: <Users2 size={20} />, label: 'Community', path: '/admin/community' },
    { icon: <Bell size={20} />, label: 'Reviews', path: '/admin/reviews' },
    { icon: <FileText size={20} />, label: 'About Page', path: '/admin/about' },
    { icon: <FileText size={20} />, label: 'Blog', path: '/admin/blog' },
    { icon: <ImageIcon size={20} />, label: 'Banners', path: '/admin/banners' },
  ] },
  { title: 'People', items: [
    { icon: <User size={20} />, label: 'Users', path: '/admin/users' },
    { icon: <Store size={20} />, label: 'Sellers', path: '/admin/sellers' },
    { icon: <Mail size={20} />, label: 'Support', path: '/admin/support' },
  ] },
  { title: 'System', items: [{ icon: <Settings size={20} />, label: 'System Settings', path: '/admin/settings' }] },
];

const resellerSections: DashboardConfig['sections'] = [
  { title: 'Overview', items: [
    { icon: <LayoutDashboard size={20} />, label: 'Reseller Panel', path: '/reseller-dashboard/overview' },
    { icon: <Sparkles size={20} />, label: 'Onboarding', path: '/reseller-dashboard/onboarding' },
  ] },
  { title: 'Catalog & Shop', items: [
    { icon: <Tag size={20} />, label: 'Catalog', path: '/reseller-dashboard/catalog' },
    { icon: <ShoppingBag size={20} />, label: 'My Shop', path: '/reseller-dashboard/shop' },
  ] },
  { title: 'Orders', items: [{ icon: <FileText size={20} />, label: 'Manual Orders', path: '/reseller-dashboard/manual-orders' }] },
  { title: 'Growth', items: [
    { icon: <Users2 size={20} />, label: 'My Network', path: '/reseller-dashboard/network' },
    { icon: <Zap size={20} />, label: 'Promotions', path: '/reseller-dashboard/promotions' },
  ] },
  { title: 'Finance', items: [{ icon: <Wallet size={20} />, label: 'Earnings', path: '/reseller-dashboard/earnings' }] },
  { title: 'Settings', items: [{ icon: <Settings size={20} />, label: 'Settings', path: '/reseller-dashboard/settings' }] },
];

const customerMobileActions: DashboardMobileAction[] = [
  { label: 'Orders', path: '/account/orders', icon: <ShoppingBag size={16} /> },
  { label: 'Wishlist', path: '/wishlist', icon: <Heart size={16} /> },
  { label: 'Wallet', path: '/account/wallet', icon: <Wallet size={16} /> },
  { label: 'Alerts', path: '/account/notifications', icon: <Bell size={16} /> },
  { label: 'Settings', path: '/account/settings', icon: <Settings size={16} /> },
];

const sellerMobileActions: DashboardMobileAction[] = [
  { label: 'Overview', path: '/seller/dashboard', icon: <LayoutDashboard size={16} /> },
  { label: 'Orders', path: '/seller/orders', icon: <ShoppingBag size={16} /> },
  { label: 'Products', path: '/seller/products', icon: <ShoppingBag size={16} /> },
  { label: 'Social', path: '/social-automation', icon: <Share2 size={16} /> },
  { label: 'Alerts', path: '/seller/notifications', icon: <Bell size={16} /> },
  { label: 'Finance', path: '/seller/earnings', icon: <Wallet size={16} /> },
];

const adminMobileActions: DashboardMobileAction[] = [
  { label: 'Orders', path: '/admin/orders', icon: <ShoppingBag size={16} /> },
  { label: 'Inventory', path: '/admin/inventory', icon: <Truck size={16} /> },
];

const resellerMobileActions: DashboardMobileAction[] = [
  { label: 'Catalog', path: '/reseller-dashboard/catalog', icon: <Tag size={16} /> },
  { label: 'Orders', path: '/reseller-dashboard/manual-orders', icon: <FileText size={16} /> },
  { label: 'Earnings', path: '/reseller-dashboard/earnings', icon: <Wallet size={16} /> },
];

const customerBottomNav: DashboardMenuItem[] = [
  { label: 'Home', path: '/account/dashboard', icon: <LayoutDashboard size={18} /> },
  { label: 'Orders', path: '/account/orders', icon: <ShoppingBag size={18} /> },
  { label: 'Wishlist', path: '/wishlist', icon: <Heart size={18} /> },
  { label: 'Wallet', path: '/account/wallet', icon: <Wallet size={18} /> },
  { label: 'Account', path: '/account/settings', icon: <User size={18} /> },
];

const adminBottomNav: DashboardMenuItem[] = [
  { label: 'Dashboard', path: '/admin/dashboard', icon: <LayoutDashboard size={18} /> },
  { label: 'Orders', path: '/admin/orders', icon: <ShoppingBag size={18} /> },
  { label: 'Products', path: '/admin/products', icon: <Package size={18} /> },
  { label: 'Settings', path: '/admin/settings', icon: <Settings size={18} /> },
];

const resellerBottomNav: DashboardMenuItem[] = [
  { label: 'Dashboard', path: '/reseller-dashboard/overview', icon: <LayoutDashboard size={18} /> },
  { label: 'Products', path: '/reseller-dashboard/catalog', icon: <Package size={18} /> },
  { label: 'Orders', path: '/reseller-dashboard/manual-orders', icon: <FileText size={18} /> },
  { label: 'Profile', path: '/reseller-dashboard/settings', icon: <User size={18} /> },
];

const customerProfileMenu: DashboardProfileItem[] = [
  { label: 'My Orders', detail: 'Order history & tracking', icon: <ShoppingBag size={18} />, path: '/account/orders' },
  { label: 'My Wallet', detail: 'Wallet balance & rewards', icon: <Wallet size={18} />, path: '/account/wallet' },
  { label: 'Wishlist', detail: 'Saved products', icon: <Heart size={18} />, path: '/wishlist' },
  { label: 'Account Settings', detail: 'Preferences & security', icon: <Settings size={18} />, path: '/account/settings' },
];

const sellerProfileMenu: DashboardProfileItem[] = [
  { label: 'My Storefront', detail: 'Preview customer view', icon: <Store size={18} />, path: '/shop' },
  { label: 'Seller Dashboard', detail: 'Performance & orders', icon: <LayoutDashboard size={18} />, path: '/seller/dashboard' },
  { label: 'Account Settings', detail: 'Preferences & security', icon: <Settings size={18} />, path: '/seller/settings' },
  { label: 'Earnings & Payouts', detail: 'Balance & statements', icon: <Package size={18} />, path: '/seller/earnings' },
];

const adminProfileMenu: DashboardProfileItem[] = [
  { label: 'Admin Panel', detail: 'Platform overview', icon: <LayoutDashboard size={18} />, path: '/admin/dashboard' },
  { label: 'All Orders', detail: 'Platform order operations', icon: <ShoppingBag size={18} />, path: '/admin/orders' },
  { label: 'Users & Sellers', detail: 'Members & approvals', icon: <User size={18} />, path: '/admin/users' },
  { label: 'System Settings', detail: 'Global configuration', icon: <Settings size={18} />, path: '/admin/settings' },
];

const resellerProfileMenu: DashboardProfileItem[] = [
  { label: 'My Shop', detail: 'Customer view of your shop', icon: <Store size={18} />, path: '/reseller-dashboard/shop' },
  { label: 'Catalog', detail: 'Products & pricing', icon: <Tag size={18} />, path: '/reseller-dashboard/catalog' },
  { label: 'Earnings', detail: 'Commissions & payouts', icon: <Wallet size={18} />, path: '/reseller-dashboard/earnings' },
  { label: 'Account Settings', detail: 'Profile & preferences', icon: <Settings size={18} />, path: '/reseller-dashboard/settings' },
];

const customerFooter: DashboardMenuItem[] = [];
const adminFooter: DashboardMenuItem[] = [];
const sellerFooter: DashboardMenuItem[] = [];
const resellerFooter: DashboardMenuItem[] = [];

export const DASHBOARD_CONFIG: Record<DashboardRole, DashboardConfig> = {
  customer: {
    role: 'customer',
    subtitle: 'Customer Center',
    profileRoleLabel: 'Customer',
    brandHome: '/account/dashboard',
    searchPlaceholder: 'Search products, stores...',
    mobileSearchPlaceholder: 'Search products or stores...',
    quickAccessPath: '/account/notifications',
    helpPath: '/account/settings',
    sections: customerSections,
    mobileActions: customerMobileActions,
    profileMenu: customerProfileMenu,
    bottomNav: customerBottomNav,
    footerMenu: customerFooter,
  },
  seller: {
    role: 'seller',
    subtitle: 'Seller Center',
    profileRoleLabel: 'Store Admin',
    verifiedBadge: 'Verified Seller',
    brandHome: '/seller/dashboard',
    searchPlaceholder: 'Search orders, products, SKU, customers...',
    mobileSearchPlaceholder: 'Search products, orders or customers...',
    quickAccessPath: '/seller/notifications',
    helpPath: '/seller/support/tickets',
    sections: sellerSections,
    mobileActions: sellerMobileActions,
    profileMenu: sellerProfileMenu,
    bottomNav: [],
    footerMenu: sellerFooter,
  },
  admin: {
    role: 'admin',
    subtitle: 'Admin Center',
    profileRoleLabel: 'Administrator',
    brandHome: '/admin/dashboard',
    searchPlaceholder: 'Search everything...',
    mobileSearchPlaceholder: 'Search products, orders...',
    quickAccessPath: '/admin/support',
    helpPath: '/admin/support',
    sections: adminSections,
    mobileActions: adminMobileActions,
    profileMenu: adminProfileMenu,
    bottomNav: adminBottomNav,
    footerMenu: adminFooter,
  },
  reseller: {
    role: 'reseller',
    subtitle: 'Reseller Center',
    profileRoleLabel: 'Reseller',
    brandHome: '/reseller-dashboard/overview',
    searchPlaceholder: 'Search products, catalog...',
    mobileSearchPlaceholder: 'Search products, catalog...',
    quickAccessPath: '/reseller-dashboard/earnings',
    helpPath: '/reseller-dashboard/settings',
    sections: resellerSections,
    mobileActions: resellerMobileActions,
    profileMenu: resellerProfileMenu,
    bottomNav: resellerBottomNav,
    footerMenu: resellerFooter,
  },
};