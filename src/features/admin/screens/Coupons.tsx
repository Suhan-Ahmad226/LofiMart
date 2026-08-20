import React, { useEffect, useState } from 'react';
import { Ticket, Plus, Trash2, Loader2, Calendar } from 'lucide-react';
import { useUser } from '../../../features/shared/state/UserContext';
import { formatPrice } from '../../../lib/utils';
import toast from '@/lib/toast';
import { CenteredLoader, EmptyState, FormNotice } from '@/features/shared/ui/FeedbackState';

export const AdminCouponsPage = () => {
  const { token } = useUser();
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    discount_type: 'percentage',
    discount_value: 0,
    min_order_value: 0,
    expiry_date: ''
  });

  const fetchCoupons = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/coupons', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load coupons');
      }
      setCoupons(data);
    } catch (err) {
      setCoupons([]);
      setError(err instanceof Error ? err.message : 'Failed to load coupons');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchCoupons();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError('');
      setMessage('');
      const response = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to create coupon');
      }
      toast.success('Coupon created successfully');
      setMessage('Coupon created successfully.');
      setShowAddModal(false);
      setFormData({
        code: '',
        discount_type: 'percentage',
        discount_value: 0,
        min_order_value: 0,
        expiry_date: ''
      });
      fetchCoupons();
    } catch (err) {
      const nextError = err instanceof Error ? err.message : 'Failed to create coupon';
      toast.error(nextError);
      setError(nextError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`/api/admin/coupons/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to delete coupon');
      }
      setDeleteConfirmId(null);
      toast.success('Coupon deleted');
      fetchCoupons();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete coupon');
    }
  };

  if (loading) {
    return <CenteredLoader label="Loading coupons..." className="min-h-[240px]" />;
  }

  return (
    <div className="space-y-6">
      {error ? <FormNotice tone="error">{error}</FormNotice> : null}
      {message ? <FormNotice tone="success">{message}</FormNotice> : null}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Coupon Management</h1>
          <p className="text-sm text-gray-500">Create and manage discount codes</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-primary text-white px-4 py-2 rounded-xl flex items-center space-x-2 hover:bg-primary/90 transition-colors"
        >
          <Plus size={20} />
          <span>Add Coupon</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {coupons.map((coupon) => (
          <div key={coupon.id} className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm relative group">
            {deleteConfirmId === coupon.id ? (
              <div className="absolute right-4 top-4 flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 text-xs font-semibold text-rose-700 shadow-sm">
                <span>Delete?</span>
                <button
                  onClick={() => handleDelete(coupon.id)}
                  className="rounded-lg bg-rose-600 px-2.5 py-1 text-white transition hover:bg-rose-700"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setDeleteConfirmId(coupon.id)}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 size={18} />
              </button>
            )}
            <div className="flex items-center space-x-4 mb-4">
              <div className="p-3 bg-primary/10 rounded-xl text-primary">
                <Ticket size={24} />
              </div>
              <div>
                <h3 className="font-bold text-lg uppercase tracking-wider">{coupon.code}</h3>
                <p className="text-xs text-gray-500">
                  {coupon.discount_type === 'percentage' ? `${coupon.discount_value}% OFF` : `${formatPrice(coupon.discount_value)} OFF`}
                </p>
              </div>
            </div>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Min. Order:</span>
                <span className="font-bold">{formatPrice(coupon.min_order_value)}</span>
              </div>
              <div className="flex justify-between">
                <span>Expires:</span>
                <span className="flex items-center space-x-1">
                  <Calendar size={14} />
                  <span>{new Date(coupon.expiry_date).toLocaleDateString()}</span>
                </span>
              </div>
            </div>
          </div>
        ))}
        {coupons.length === 0 && !error ? (
          <EmptyState
            icon={<Ticket size={24} />}
            title="No coupons available yet"
            description="Create your first marketplace coupon to start running promotions and conversion campaigns."
            tone="soft"
            className="md:col-span-2 lg:col-span-3 py-12"
          />
        ) : null}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md">
            <h2 className="text-xl font-bold mb-6">Add New Coupon</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Coupon Code</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. SAVE20"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm"
                  value={formData.code}
                  onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select 
                    className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm"
                    value={formData.discount_type}
                    onChange={(e) => setFormData({...formData, discount_type: e.target.value})}
                  >
                    <option value="percentage">Percentage</option>
                    <option value="fixed">Fixed Amount</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
                  <input 
                    type="number" 
                    required
                    min="0"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm"
                    value={formData.discount_value}
                    onChange={(e) => setFormData({...formData, discount_value: Number(e.target.value)})}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min. Order Value</label>
                  <input 
                    type="number" 
                    required
                    min="0"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm"
                    value={formData.min_order_value}
                    onChange={(e) => setFormData({...formData, min_order_value: Number(e.target.value)})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                  <input 
                    type="date" 
                    required
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm"
                    value={formData.expiry_date}
                    onChange={(e) => setFormData({...formData, expiry_date: e.target.value})}
                />
              </div>
              <div className="flex space-x-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={submitting}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
                    {submitting ? 'Creating...' : 'Create Coupon'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
