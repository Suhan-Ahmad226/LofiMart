import React, { useMemo, useState, useEffect } from 'react';
import { ShoppingBag, Heart, MapPin, Package, Clock, AlertCircle, Bell, Coins, ArrowRight, Truck } from 'lucide-react';
import { useUser } from '../../../features/shared/state/UserContext';
import { useWishlist } from '../../../features/shop/state/WishlistContext';
import { formatPrice } from '../../../lib/utils';
import { Link } from '../../../lib/navigation';
import { DashboardStatsSkeleton, ListCardSkeleton } from '@/features/shared/ui/DataSkeletons';

type NotificationItem = {
  id: string;
  read_at?: string | null;
};

type AddressSummary = {
  id: string;
  name?: string | null;
  phone?: string | null;
  alternate_phone?: string | null;
  address?: string | null;
  division?: string | null;
  district?: string | null;
  upazila?: string | null;
  house?: string | null;
  road?: string | null;
  village?: string | null;
  city?: string | null;
  is_default?: number | boolean | null;
};

function buildAddressSummary(address: AddressSummary | null) {
  if (!address) return '';
  const parts = [
    address.house && `House: ${address.house}`,
    address.road && `Road: ${address.road}`,
    address.village && `Village: ${address.village}`,
    address.upazila && `Upazila: ${address.upazila}`,
    address.district && `District: ${address.district}`,
    address.division && `Division: ${address.division}`,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : [address.address, address.city].filter(Boolean).join(', ');
}

export const CustomerDashboard = () => {
  const { token, user } = useUser();
  const { items: wishlistItems } = useWishlist();
  const [orders, setOrders] = useState<any[]>([]);
  const [savedAddresses, setSavedAddresses] = useState(0);
  const [profileSummary, setProfileSummary] = useState<any>(null);
  const [defaultAddress, setDefaultAddress] = useState<AddressSummary | null>(null);
  const [rewardPoints, setRewardPoints] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        setError('');
        const [ordersResponse, profileResponse, pointsResponse, notificationsResponse] = await Promise.all([
          fetch('/api/orders/my-orders', {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch('/api/users/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch('/api/user/points', {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch('/api/notifications', {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
        ]);
        const ordersData = await ordersResponse.json().catch(() => null);
        if (!ordersResponse.ok) throw new Error(ordersData?.error || 'Failed to fetch orders');
        setOrders(Array.isArray(ordersData) ? ordersData : []);

        if (profileResponse.ok) {
          const profileData = await profileResponse.json().catch(() => null);
          const addresses = Array.isArray(profileData?.addresses) ? profileData.addresses : [];
          setSavedAddresses(addresses.length);
          setProfileSummary(profileData?.user || null);
          setDefaultAddress(addresses.find((item: AddressSummary) => Boolean(item?.is_default)) || addresses[0] || null);
        } else {
          setSavedAddresses(0);
          setProfileSummary(null);
          setDefaultAddress(null);
        }

        if (pointsResponse.ok) {
          const pointsData = await pointsResponse.json().catch(() => null);
          setRewardPoints(Number(pointsData?.points || 0));
        } else {
          setRewardPoints(0);
        }

        if (notificationsResponse.ok) {
          const notificationsData = await notificationsResponse.json().catch(() => []);
          const unreadCount = Array.isArray(notificationsData)
            ? notificationsData.filter((item: NotificationItem) => !item?.read_at).length
            : 0;
          setUnreadNotifications(unreadCount);
        } else {
          setUnreadNotifications(0);
        }
      } catch (err: any) {
        setError(err.message);
        setOrders([]);
        setSavedAddresses(0);
        setProfileSummary(null);
        setDefaultAddress(null);
        setRewardPoints(0);
        setUnreadNotifications(0);
      } finally {
        setLoading(false);
      }
    };

    if (token) void fetchDashboard();
    else {
      setOrders([]);
      setSavedAddresses(0);
      setProfileSummary(null);
      setDefaultAddress(null);
      setRewardPoints(0);
      setUnreadNotifications(0);
      setLoading(false);
    }
  }, [token]);

  const stats = [
    { label: 'Total Orders', value: orders.length.toString(), icon: <ShoppingBag className="text-blue-500" /> },
    { label: 'Wishlist Items', value: wishlistItems.length.toString(), icon: <Heart className="text-accent" /> },
    { label: 'Saved Addresses', value: String(savedAddresses), icon: <MapPin className="text-primary" /> },
    { label: 'Reward Points', value: rewardPoints.toString(), icon: <Coins className="text-amber-500" /> },
    { label: 'Unread Alerts', value: unreadNotifications.toString(), icon: <Bell className="text-violet-500" /> },
  ];

  const orderBreakdown = useMemo(() => {
    const statusOf = (order: any) => String(order?.status || '').toLowerCase();
    return {
      processing: orders.filter((order) => ['pending', 'confirmed', 'processing'].includes(statusOf(order))).length,
      shipped: orders.filter((order) => ['shipped', 'out_for_delivery', 'in_transit'].includes(statusOf(order))).length,
      delivered: orders.filter((order) => statusOf(order) === 'delivered').length,
    };
  }, [orders]);

  const customerSteps = [
    { id: 'email', title: 'Verify email', completed: Boolean(profileSummary?.email_verified), actionPath: '/account/settings?section=profile' },
    { id: 'phone', title: 'Verify phone', completed: Boolean(profileSummary?.phone_verified), actionPath: '/account/settings?section=profile' },
    { id: 'address', title: 'Add address', completed: savedAddresses > 0, actionPath: '/account/settings?section=addresses' },
    { id: 'wishlist', title: 'Save favorites', completed: wishlistItems.length > 0, actionPath: '/wishlist' },
    { id: 'first_order', title: 'Place first order', completed: orders.length > 0, actionPath: '/shop' },
  ];

  const completedCustomerSteps = customerSteps.filter((step) => step.completed).length;
  const customerProgress = Math.round((completedCustomerSteps / customerSteps.length) * 100);
  const nextCustomerStep = customerSteps.find((step) => !step.completed) || null;

  if (loading) {
    return (
      <div className="space-y-8">
        <DashboardStatsSkeleton cards={3} />
        <ListCardSkeleton rows={4} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-xl p-4 text-sm flex items-center gap-2">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}
      {customerProgress < 100 ? (
        <div className="rounded-3xl border border-border bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="section-kicker text-primary/70">Account completion</p>
              <h2 className="mt-2 text-xl font-bold">Finish your account for faster checkout and smoother tracking</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {completedCustomerSteps}/{customerSteps.length} steps complete.
                {nextCustomerStep ? ` Next: ${nextCustomerStep.title}.` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm">
                <span className="font-bold text-foreground">{customerProgress}%</span>{' '}
                <span className="text-muted-foreground">complete</span>
              </div>
              {nextCustomerStep ? (
                <Link
                  to={nextCustomerStep.actionPath}
                  className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Continue setup
                </Link>
              ) : null}
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {customerSteps.map((step) => (
              <div key={step.id} className="rounded-2xl border border-border bg-secondary/20 px-4 py-3 text-sm">
                <p className="font-semibold text-foreground">{step.title}</p>
                <p className={`mt-1 text-xs font-medium ${step.completed ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {step.completed ? 'Complete' : 'Pending'}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5">
        {stats.map((stat, i) => (
          <div
            key={i}
            className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm flex items-center space-x-4 transition-transform duration-200 hover:-translate-y-0.5"
          >
            <div className="p-3 bg-gray-50 rounded-xl">{stat.icon}</div>
            <div>
              <p className="text-sm text-gray-500">{stat.label}</p>
              <p className="text-2xl font-bold">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">Order Snapshot</h3>
              <p className="mt-1 text-sm text-gray-500">See what needs attention before your next checkout.</p>
            </div>
            <Link to="/account/orders" className="text-sm font-bold text-primary hover:underline">
              View orders
            </Link>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-amber-50 px-4 py-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Processing</p>
              <p className="mt-2 text-2xl font-bold text-slate-950">{orderBreakdown.processing}</p>
            </div>
            <div className="rounded-2xl bg-sky-50 px-4 py-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">On the way</p>
              <p className="mt-2 text-2xl font-bold text-slate-950">{orderBreakdown.shipped}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-4 py-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Delivered</p>
              <p className="mt-2 text-2xl font-bold text-slate-950">{orderBreakdown.delivered}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/account/wallet"
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-secondary"
            >
              <Coins size={15} />
              Open rewards
            </Link>
            <Link
              to="/account/notifications"
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-secondary"
            >
              <Bell size={15} />
              Check notifications
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold">Delivery Profile</h3>
              <p className="mt-1 text-sm text-gray-500">This information will auto-fill at checkout, and you can still edit it before placing an order.</p>
            </div>
            <Link to="/account/settings?section=profile" className="text-sm font-bold text-primary hover:underline">
              Manage
            </Link>
          </div>
          {defaultAddress || profileSummary ? (
            <div className="mt-5 rounded-2xl bg-secondary/20 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-slate-950">{profileSummary?.name || defaultAddress?.name || 'Customer profile'}</p>
                  <p className="mt-1 text-sm text-slate-500">{profileSummary?.phone || defaultAddress?.phone || 'Phone not added yet'}</p>
                  {profileSummary?.alternate_phone || defaultAddress?.alternate_phone ? (
                    <p className="mt-1 text-sm text-slate-500">Alt: {profileSummary?.alternate_phone || defaultAddress?.alternate_phone}</p>
                  ) : null}
                  <p className="mt-1 text-sm text-slate-500">{profileSummary?.email || user?.email || 'Email not available'}</p>
                </div>
                <MapPin className="text-primary" size={18} />
              </div>
              {defaultAddress ? (
                <p className="mt-4 text-sm leading-6 text-slate-600">{buildAddressSummary(defaultAddress)}</p>
              ) : (
                <p className="mt-4 text-sm leading-6 text-slate-500">
                  Add your delivery address once and future checkout will fill it automatically.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-border bg-secondary/10 p-5 text-sm text-slate-500">
              Add your first delivery address to make checkout faster and shipping estimates more accurate.
            </div>
          )}

          <div className="mt-5 space-y-3">
            <Link
              to="/account/settings?section=profile"
              className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-secondary"
            >
              <span>Update name, phone, or email</span>
              <ArrowRight size={16} />
            </Link>
            <Link
              to="/account/settings?section=addresses"
              className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-secondary"
            >
              <span>{defaultAddress ? 'Update saved address' : 'Add delivery address'}</span>
              <ArrowRight size={16} />
            </Link>
            <Link
              to="/shop"
              className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-secondary"
            >
              <span>Continue shopping</span>
              <Truck size={16} />
            </Link>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h3 className="font-bold text-lg">Recent Orders</h3>
          <Link to="/account/orders" className="text-primary text-sm font-bold hover:underline">View All</Link>
        </div>
        <div className="divide-y divide-gray-100">
          {orders.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              No orders found.
            </div>
          ) : (
            orders.slice(0, 5).map((order) => (
              <div key={order.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                    <Package className="text-gray-400" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">Order #{order.id}</p>
                    <p className="text-xs text-gray-500">Placed on {new Date(order.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              <div className="flex flex-wrap items-center gap-4 sm:gap-8">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Status</p>
                    <div className="flex items-center space-x-1 text-primary">
                      <Clock size={14} />
                      <span className="text-xs font-bold uppercase tracking-wider">{order.status}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Total</p>
                    <p className="font-bold text-sm">{formatPrice(order.total)}</p>
                  </div>
                  <Link 
                    to={`/account/orders/${order.id}`}
                    className="bg-bg-light text-gray-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-gray-200 transition-all"
                  >
                    Details
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
