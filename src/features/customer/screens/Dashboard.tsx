'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { ShoppingBag, Heart, MapPin, Package, Clock, AlertCircle, Bell, Coins, ArrowRight, Truck, RefreshCw } from 'lucide-react';
import { useUser } from '../../../features/shared/state/UserContext';
import { useWishlist } from '../../../features/shop/state/WishlistContext';
import { formatPrice } from '../../../lib/utils';
import { Link } from '../../../lib/navigation';
import { DashboardStatsSkeleton, ListCardSkeleton } from '@/features/shared/ui/DataSkeletons';
import { DashboardHeader, DashboardKpiCard, DashboardSection, DashboardStatsGrid } from '@/features/shared/ui/dashboard';

type NotificationItem = { id: string; read_at?: string | null };
type AddressSummary = { id: string; name?: string | null; phone?: string | null; alternate_phone?: string | null; address?: string | null; division?: string | null; district?: string | null; upazila?: string | null; house?: string | null; road?: string | null; village?: string | null; city?: string | null; is_default?: number | boolean | null };
type CustomerOrder = { id: string | number; order_code?: string | null; status?: string | null; created_at: string; total?: number | string | null; };
type CustomerProfile = { name?: string | null; email?: string | null; phone?: string | null; alternate_phone?: string | null; email_verified?: boolean; phone_verified?: boolean };
type LoadState = 'loading' | 'ready' | 'error';

function buildAddressSummary(address: AddressSummary | null) {
  if (!address) return '';
  const parts = [address.house && `House: ${address.house}`, address.road && `Road: ${address.road}`, address.village && `Village: ${address.village}`, address.upazila && `Upazila: ${address.upazila}`, address.district && `District: ${address.district}`, address.division && `Division: ${address.division}`].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : [address.address, address.city].filter(Boolean).join(', ');
}

function toOrders(data: unknown): CustomerOrder[] {
  if (Array.isArray(data)) return data as CustomerOrder[];
  if (data && typeof data === 'object' && Array.isArray((data as { orders?: unknown }).orders)) return (data as { orders: CustomerOrder[] }).orders;
  return [];
}

export const CustomerDashboard = () => {
  const { token, user } = useUser();
  const { items: wishlistItems } = useWishlist();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [totalOrders, setTotalOrders] = useState<number | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<number | null>(null);
  const [profileSummary, setProfileSummary] = useState<CustomerProfile | null>(null);
  const [defaultAddress, setDefaultAddress] = useState<AddressSummary | null>(null);
  const [rewardPoints, setRewardPoints] = useState<number | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const [loadState, setLoadState] = useState<Record<'orders' | 'profile' | 'points' | 'notifications', LoadState>>({ orders: 'loading', profile: 'loading', points: 'loading', notifications: 'loading' });
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const requestOptions: RequestInit = { credentials: 'include', headers: { Authorization: `Bearer ${token}` }, signal: controller.signal };

    if (!token) {
      setLoading(false);
      return () => controller.abort();
    }

    setLoading(true);
    setError('');
    setLoadState({ orders: 'loading', profile: 'loading', points: 'loading', notifications: 'loading' });
    setTotalOrders(null);
    setSavedAddresses(null);
    setRewardPoints(null);
    setUnreadNotifications(null);

    const load = async () => {
      const readJson = async (response: Response) => response.json().catch(() => null);
      const errors: string[] = [];

      const [ordersResult, profileResult, pointsResult, notificationsResult] = await Promise.allSettled([
        fetch('/api/orders/my-orders?limit=5', requestOptions),
        fetch('/api/users/profile?minimal=1', requestOptions),
        fetch('/api/user/points', requestOptions),
        fetch('/api/notifications?unread=1', requestOptions),
      ]);
      if (!active) return;

      if (ordersResult.status === 'fulfilled' && ordersResult.value.ok) {
        const data = await readJson(ordersResult.value);
        const list = toOrders(data);
        setOrders(list);
        setTotalOrders(data && typeof data === 'object' && 'totalCount' in data ? Number((data as { totalCount?: number }).totalCount ?? list.length) : list.length);
        setLoadState((s) => ({ ...s, orders: 'ready' }));
      } else {
        setOrders([]); setTotalOrders(null); setLoadState((s) => ({ ...s, orders: 'error' })); errors.push('Orders could not be loaded.');
      }

      if (profileResult.status === 'fulfilled' && profileResult.value.ok) {
        const data = await readJson(profileResult.value);
        const addresses = Array.isArray(data?.addresses) ? data.addresses as AddressSummary[] : [];
        setSavedAddresses(addresses.length);
        setProfileSummary((data?.user ?? null) as CustomerProfile | null);
        setDefaultAddress(addresses.find((item) => Boolean(item?.is_default)) || addresses[0] || null);
        setLoadState((s) => ({ ...s, profile: 'ready' }));
      } else {
        setSavedAddresses(null); setProfileSummary(null); setDefaultAddress(null); setLoadState((s) => ({ ...s, profile: 'error' })); errors.push('Profile details are temporarily unavailable.');
      }

      if (pointsResult.status === 'fulfilled' && pointsResult.value.ok) {
        const data = await readJson(pointsResult.value);
        setRewardPoints(Number(data?.points ?? 0)); setLoadState((s) => ({ ...s, points: 'ready' }));
      } else {
        setRewardPoints(null); setLoadState((s) => ({ ...s, points: 'error' })); errors.push('Rewards are temporarily unavailable.');
      }

      if (notificationsResult.status === 'fulfilled' && notificationsResult.value.ok) {
        const data = await readJson(notificationsResult.value);
        const list = Array.isArray(data) ? data as NotificationItem[] : Array.isArray(data?.notifications) ? data.notifications as NotificationItem[] : [];
        setUnreadNotifications(list.filter((item) => !item?.read_at).length); setLoadState((s) => ({ ...s, notifications: 'ready' }));
      } else {
        setUnreadNotifications(null); setLoadState((s) => ({ ...s, notifications: 'error' })); errors.push('Notifications are temporarily unavailable.');
      }

      if (active) {
        setError(errors.join(' '));
        setLoading(false);
      }
    };

    void load().catch(() => {
      if (!active || controller.signal.aborted) return;
      setError('Customer dashboard data could not be loaded. Please try again.');
      setLoading(false);
    });

    return () => { active = false; controller.abort(); };
  }, [token, retryKey]);

  const statValue = (value: number | null, state: LoadState) => state === 'error' ? 'Unavailable' : value === null ? '...' : String(value);
  const stats = [
    { label: 'Total Orders', value: statValue(totalOrders, loadState.orders), icon: <ShoppingBag className="text-blue-500" /> },
    { label: 'Wishlist Items', value: wishlistItems.length.toString(), icon: <Heart className="text-accent" /> },
    { label: 'Saved Addresses', value: statValue(savedAddresses, loadState.profile), icon: <MapPin className="text-primary" /> },
    { label: 'Reward Points', value: statValue(rewardPoints, loadState.points), icon: <Coins className="text-amber-500" /> },
    { label: 'Unread Alerts', value: statValue(unreadNotifications, loadState.notifications), icon: <Bell className="text-violet-500" /> },
  ];

  const orderBreakdown = useMemo(() => {
    const statusOf = (order: CustomerOrder) => String(order?.status || '').toLowerCase();
    return {
      processing: orders.filter((order) => ['pending', 'confirmed', 'processing'].includes(statusOf(order))).length,
      shipped: orders.filter((order) => ['shipped', 'out_for_delivery', 'in_transit'].includes(statusOf(order))).length,
      delivered: orders.filter((order) => statusOf(order) === 'delivered').length,
    };
  }, [orders]);

  const customerSteps = [
    { id: 'email', title: 'Verify email', completed: Boolean(profileSummary?.email_verified), actionPath: '/account/settings?section=profile' },
    { id: 'phone', title: 'Verify phone', completed: Boolean(profileSummary?.phone_verified), actionPath: '/account/settings?section=profile' },
    { id: 'address', title: 'Add address', completed: savedAddresses !== null && savedAddresses > 0, actionPath: '/account/settings?section=addresses' },
    { id: 'wishlist', title: 'Save favorites', completed: wishlistItems.length > 0, actionPath: '/wishlist' },
    { id: 'first_order', title: 'Place first order', completed: totalOrders !== null && totalOrders > 0, actionPath: '/shop' },
  ];
  const customerSetupSteps = customerSteps.slice(0, 3);
  const completedCustomerSteps = customerSetupSteps.filter((step) => step.completed).length;
  const customerProgress = Math.round((completedCustomerSteps / customerSetupSteps.length) * 100);
  const nextCustomerStep = customerSteps.find((step) => !step.completed) || null;

  if (loading) return <div className="space-y-8" aria-busy="true" aria-label="Loading customer dashboard"><DashboardStatsSkeleton cards={5} /><ListCardSkeleton rows={4} /></div>;

  return (
    <div className="space-y-8">
      {error && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2"><AlertCircle size={18} /><span>{error}</span></div>
          <button type="button" onClick={() => setRetryKey((value) => value + 1)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 font-semibold hover:bg-amber-100"><RefreshCw size={14} /> Retry</button>
        </div>
      )}
      {customerProgress < 100 ? (
        <div className="rounded-3xl border border-border bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div><p className="section-kicker text-primary/70">Account completion</p><h2 className="mt-2 text-xl font-bold">Finish your account for faster checkout and smoother tracking</h2><p className="mt-2 text-sm text-muted-foreground">{completedCustomerSteps}/{customerSetupSteps.length} setup steps complete.{nextCustomerStep ? ` Next: ${nextCustomerStep.title}.` : ''}</p></div>
            <div className="flex flex-wrap items-center gap-3"><div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm"><span className="font-bold text-foreground">{customerProgress}%</span> <span className="text-muted-foreground">complete</span></div>{nextCustomerStep ? <Link to={nextCustomerStep.actionPath} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">Continue setup</Link> : null}</div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{customerSetupSteps.map((step) => <div key={step.id} className="rounded-2xl border border-border bg-secondary/20 px-4 py-3 text-sm"><p className="font-semibold text-foreground">{step.title}</p><p className={`mt-1 text-xs font-medium ${step.completed ? 'text-emerald-700' : 'text-amber-700'}`}>{step.completed ? 'Complete' : 'Pending'}</p></div>)}</div>
        </div>
      ) : null}

      <DashboardHeader greeting={user?.name ? `Hello, ${user.name}` : undefined} title="Your account" description="Track orders, wishlist, and rewards." />
      <DashboardStatsGrid columns={5}>{stats.map((stat) => <DashboardKpiCard key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} />)}</DashboardStatsGrid>

      <DashboardSection title="Order Snapshot" description="See what needs attention before your next checkout." action={<Link to="/account/orders" className="text-sm font-bold text-primary hover:underline">View orders</Link>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-amber-50 px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Processing</p><p className="mt-2 text-2xl font-bold text-slate-950">{orderBreakdown.processing}</p></div>
          <div className="rounded-2xl bg-sky-50 px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">On the way</p><p className="mt-2 text-2xl font-bold text-slate-950">{orderBreakdown.shipped}</p></div>
          <div className="rounded-2xl bg-emerald-50 px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Delivered</p><p className="mt-2 text-2xl font-bold text-slate-950">{orderBreakdown.delivered}</p></div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3"><Link to="/account/wallet" className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-secondary"><Coins size={15} /> Open rewards</Link><Link to="/account/notifications" className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-secondary"><Bell size={15} /> Check notifications</Link></div>
      </DashboardSection>

      <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4"><div><h3 className="text-lg font-bold">Delivery Profile</h3><p className="mt-1 text-sm text-gray-500">This information will auto-fill at checkout, and you can still edit it before placing an order.</p></div><Link to="/account/settings?section=profile" className="text-sm font-bold text-primary hover:underline">Manage</Link></div>
        {defaultAddress || profileSummary ? <div className="mt-5 rounded-2xl bg-secondary/20 p-5"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold text-slate-950">{profileSummary?.name || defaultAddress?.name || 'Customer profile'}</p><p className="mt-1 text-sm text-slate-500">{profileSummary?.phone || defaultAddress?.phone || 'Phone not added yet'}</p>{profileSummary?.alternate_phone || defaultAddress?.alternate_phone ? <p className="mt-1 text-sm text-slate-500">Alt: {profileSummary?.alternate_phone || defaultAddress?.alternate_phone}</p> : null}<p className="mt-1 text-sm text-slate-500">{profileSummary?.email || user?.email || 'Email not available'}</p></div><MapPin className="text-primary" size={18} /></div>{defaultAddress ? <p className="mt-4 text-sm leading-6 text-slate-600">{buildAddressSummary(defaultAddress)}</p> : <p className="mt-4 text-sm leading-6 text-slate-500">Add your delivery address once and future checkout will fill it automatically.</p>}</div> : <div className="mt-5 rounded-2xl border border-dashed border-border bg-secondary/10 p-5 text-sm text-slate-500">Add your first delivery address to make checkout faster and shipping estimates more accurate.</div>}
        <div className="mt-5 space-y-3"><Link to="/account/settings?section=profile" className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-secondary"><span>Update name, phone, or email</span><ArrowRight size={16} /></Link><Link to="/account/settings?section=addresses" className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-secondary"><span>{defaultAddress ? 'Update saved address' : 'Add delivery address'}</span><ArrowRight size={16} /></Link><Link to="/shop" className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-secondary"><span>Continue shopping</span><Truck size={16} /></Link></div>
      </div>

      <DashboardSection title="Recent Orders" description="Your latest orders and their current status." action={<Link to="/account/orders" className="text-sm font-bold text-primary hover:underline">View all</Link>}>
        <div className="divide-y divide-gray-100">
          {loadState.orders === 'error' ? <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-slate-500"><p>Recent orders are temporarily unavailable.</p><Link to="/account/orders" className="font-semibold text-primary hover:underline">Open My Orders</Link></div> : orders.length === 0 ? <div className="py-12 text-center text-sm text-slate-500">No orders found.</div> : orders.slice(0, 5).map((order) => (
            <div key={order.id} className="flex flex-col gap-4 py-5 md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-secondary/40"><Package className="text-primary" size={20} /></div><div><p className="text-sm font-bold text-slate-950">Order #{order.order_code || order.id}</p><p className="text-xs text-slate-500">Placed on {new Date(order.created_at).toLocaleDateString()}</p></div></div><div className="flex flex-wrap items-center gap-4 sm:gap-8"><div><p className="text-xs text-slate-500">Status</p><div className="flex items-center gap-1 text-primary"><Clock size={14} /><span className="text-xs font-bold uppercase tracking-wider">{String(order.status || 'unknown').replaceAll('_', ' ')}</span></div></div><div><p className="text-xs text-slate-500">Total</p><p className="text-sm font-bold text-slate-950">{formatPrice(Number(order.total ?? 0))}</p></div><Link to={`/account/orders/${order.id}`} className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-primary/20 hover:text-primary">Details</Link></div></div>
          ))}
        </div>
      </DashboardSection>
    </div>
  );
};