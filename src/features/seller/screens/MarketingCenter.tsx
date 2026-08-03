import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Calendar, Copy, Loader2, Plus, Tag, Trash2 } from 'lucide-react';
import { useUser } from '../../../features/shared/state/UserContext';
import { formatPrice } from '../../../lib/utils';
import { Link } from '../../../lib/navigation';
import { copyText } from '../../../lib/browser-actions';

type SellerCoupon = {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  min_order_value: number;
  expiry_date: string;
};

export const SellerMarketingCenter = () => {
  const { token } = useUser();
  const [coupons, setCoupons] = useState<SellerCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState('');
  const [formData, setFormData] = useState({
    code: '',
    discount_type: 'percentage',
    discount_value: 0,
    min_order_value: 0,
    expiry_date: '',
  });

  const fetchCoupons = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const response = await fetch('/api/seller/coupons', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load seller coupons');
      }
      setCoupons(Array.isArray(payload) ? payload : []);
    } catch (error: unknown) {
      setCoupons([]);
      toast.error(error instanceof Error ? error.message : 'Failed to load seller coupons');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCoupons();
  }, [token]);

  const createCoupon = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;

    try {
      setSaving(true);
      const response = await fetch('/api/seller/coupons', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to create seller coupon');
      }
      toast.success('Seller coupon created.');
      setFormData({
        code: '',
        discount_type: 'percentage',
        discount_value: 0,
        min_order_value: 0,
        expiry_date: '',
      });
      void fetchCoupons();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to create seller coupon');
    } finally {
      setSaving(false);
    }
  };

  const deleteCoupon = async (couponId: string) => {
    if (!token) return;
    try {
      const response = await fetch(`/api/seller/coupons/${couponId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to delete seller coupon');
      }
      setDeleteConfirmId('');
      toast.success('Seller coupon deleted.');
      void fetchCoupons();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete seller coupon');
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Marketing Center</h1>
          <p className="text-gray-500">Manage seller-only coupons and pair them with your storefront, flash sale, and product promotions.</p>
        </div>
        <Link
          to="/seller/settings"
          className="inline-flex items-center gap-2 rounded-2xl border border-border px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-secondary"
        >
          <Tag size={16} />
          Open storefront settings
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-[32px] border border-gray-100 bg-white p-4 shadow-sm md:p-8">
          <h2 className="text-lg font-bold">Create seller coupon</h2>
          <p className="mt-2 text-sm text-gray-500">These codes appear on your public seller storefront and apply only when the cart stays inside your store.</p>
          <form onSubmit={createCoupon} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Coupon code</label>
              <input
                required
                value={formData.code}
                onChange={(event) => setFormData((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-primary"
                placeholder="SELLER10"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Discount type</label>
                <select
                  value={formData.discount_type}
                  onChange={(event) => setFormData((current) => ({ ...current, discount_type: event.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-primary"
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed amount</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Value</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={formData.discount_value}
                  onChange={(event) => setFormData((current) => ({ ...current, discount_value: Number(event.target.value) }))}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Min order value</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={formData.min_order_value}
                  onChange={(event) => setFormData((current) => ({ ...current, min_order_value: Number(event.target.value) }))}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Expiry date</label>
                <input
                  type="date"
                  required
                  min={new Date().toISOString().split('T')[0]}
                  value={formData.expiry_date}
                  onChange={(event) => setFormData((current) => ({ ...current, expiry_date: event.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
              Create coupon
            </button>
          </form>
        </section>

        <section className="rounded-[32px] border border-gray-100 bg-white p-4 shadow-sm md:p-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold">Your storefront coupons</h2>
              <p className="mt-1 text-sm text-gray-500">Live codes your customers can copy from your `/store/[slug]` page.</p>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              {coupons.length} active
            </span>
          </div>

          <div className="mt-6 space-y-4">
            {coupons.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">
                No seller coupons yet. Create one to boost your own storefront conversion.
              </div>
            ) : (
              coupons.map((coupon) => (
                <div key={coupon.id} className="rounded-3xl border border-gray-100 bg-secondary/20 p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-lg font-black tracking-[0.18em] text-slate-950">{coupon.code}</p>
                        <button
                          type="button"
                          onClick={async () => {
                            const copied = await copyText(coupon.code);
                            if (copied) {
                              toast.success(`Copied ${coupon.code}`);
                              return;
                            }
                            toast.error('Could not copy this coupon on this device.');
                          }}
                          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-white"
                        >
                          <Copy size={13} />
                          Copy
                        </button>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        {coupon.discount_type === 'percentage' ? `${coupon.discount_value}% off` : `${formatPrice(coupon.discount_value)} off`}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                        <span>Min order {formatPrice(coupon.min_order_value)}</span>
                        <span className="inline-flex items-center gap-1">
                          <Calendar size={13} />
                          {new Date(coupon.expiry_date).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    {deleteConfirmId === coupon.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void deleteCoupon(coupon.id)}
                          className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-700"
                        >
                          Confirm delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId('')}
                          className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-white"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(coupon.id)}
                        className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-white"
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default SellerMarketingCenter;
