import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, FileText, ExternalLink, Eye, Loader2, Search, ShieldAlert, Store, XCircle } from 'lucide-react';
import toast from '@/lib/toast';
import { useNavigate } from '../../../lib/navigation';
import { useUser } from '../../../features/shared/state/UserContext';
import { formatPrice } from '../../../lib/utils';

type SellerRow = {
  id: string;
  name?: string | null;
  email?: string | null;
  shop_name?: string | null;
  storefront_slug?: string | null;
  status?: string | null;
  rating?: number | null;
  product_count?: number;
  pickup_count?: number;
  payout_method_count?: number;
  verification_status?: string | null;
  rejection_reason?: string | null;
  suspension_reason?: string | null;
  submitted_for_review_at?: string | null;
  approved_at?: string | null;
};

type SellerDetailPayload = {
  user?: any;
  verification?: any;
  payout_methods?: any[];
  pickup_locations?: any[];
  products?: any[];
  seller_approval?: any;
};

const statusTone = (status?: string | null) => {
  if (status === 'approved') return 'bg-emerald-100 text-emerald-700';
  if (status === 'rejected' || status === 'suspended') return 'bg-rose-100 text-rose-700';
  if (status === 'pending_review' || status === 'under_review') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
};

export const AdminSellersPage = () => {
  const { token } = useUser();
  const navigate = useNavigate();
  const [sellers, setSellers] = useState<SellerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [selectedSellerId, setSelectedSellerId] = useState<string>('');
  const [selectedSeller, setSelectedSeller] = useState<SellerDetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected' | 'suspended' | 'under_review'>('approved');
  const [reviewReason, setReviewReason] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);

  const fetchSellers = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/sellers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error?.message || data?.error || 'Failed to load sellers');
      }
      setSellers(Array.isArray(data?.data) ? data.data : []);
    } catch (err) {
      setSellers([]);
      setError(err instanceof Error ? err.message : 'Failed to load sellers');
    } finally {
      setLoading(false);
    }
  };

  const fetchSellerDetail = async (sellerId: string) => {
    if (!token) return;
    setSelectedSellerId(sellerId);
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${sellerId}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error?.message || data?.error || 'Failed to load seller detail');
      }
      setSelectedSeller(data);
      setReviewReason('');
      setReviewAction('approved');
    } catch (err) {
      setSelectedSeller(null);
      toast.error(err instanceof Error ? err.message : 'Failed to load seller detail');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      void fetchSellers();
    }
  }, [token]);

  const filteredSellers = useMemo(
    () =>
      sellers.filter((seller) =>
        [seller.name, seller.shop_name, seller.email, seller.status]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search.toLowerCase())),
      ),
    [search, sellers],
  );

  const handleStatusChange = async () => {
    if (!selectedSellerId || !token) return;
    if ((reviewAction === 'rejected' || reviewAction === 'suspended') && reviewReason.trim().length < 5) {
      toast.error('Add a short reason before rejecting or suspending a seller.');
      return;
    }

    try {
      setReviewSaving(true);
      const response = await fetch(`/api/admin/sellers/${selectedSellerId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: reviewAction,
          reason: reviewReason.trim() || null,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const missing = Array.isArray(data?.error?.missing_requirements) ? data.error.missing_requirements : [];
        const labels: Record<string, string> = {
          email_verified: 'Email verified',
          phone_verified: 'Phone verified',
          store_info_completed: 'Store information',
          pickup_location_added: 'Pickup location',
          kyc_submitted: 'Complete KYC',
          payout_method_added: 'Payout method',
        };
        const detail = missing.map((item: string) => labels[item] || item).join(', ');
        throw new Error(detail ? `Complete before approval: ${detail}` : (data?.error?.message || data?.error || 'Failed to update seller status'));
      }
      toast.success(`Seller moved to ${reviewAction.replaceAll('_', ' ')}.`);
      await Promise.all([fetchSellers(), fetchSellerDetail(selectedSellerId)]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setReviewSaving(false);
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Seller Review Desk</h1>
          <p className="text-sm text-gray-500">Approve, reject, suspend, and audit every seller onboarding requirement from one admin workspace.</p>
        </div>
        <div className="relative w-full lg:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search sellers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="table-responsive overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
          {error ? (
            <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500">
                <th className="px-6 py-4">Store</th>
                <th className="px-6 py-4">Readiness</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredSellers.map((seller) => (
                <tr key={seller.id} className="text-sm transition-colors hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Store size={20} />
                      </div>
                      <div>
                        <p className="font-bold">{seller.shop_name || seller.name}</p>
                        <p className="text-xs text-gray-500">{seller.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1 text-xs text-gray-500">
                      <p>{seller.product_count || 0} products</p>
                      <p>{seller.pickup_count || 0} pickup points</p>
                      <p>{seller.payout_method_count || 0} payout methods</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-2">
                      <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${statusTone(seller.status)}`}>
                        {String(seller.status || 'draft').replaceAll('_', ' ')}
                      </span>
                      <p className="text-xs text-gray-500">{seller.verification_status || 'no kyc'}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => void fetchSellerDetail(seller.id)}
                        className="p-2 text-gray-400 transition-colors hover:text-primary"
                        title="Open review panel"
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        onClick={() => {
                          if (seller.storefront_slug) navigate(`/store/${seller.storefront_slug}`);
                        }}
                        className="p-2 text-gray-400 transition-colors hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Open public profile"
                        disabled={!seller.storefront_slug}
                      >
                        <ExternalLink size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredSellers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-sm text-gray-500">
                    {error ? 'No sellers available right now.' : 'No sellers found.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          {detailLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="animate-spin text-primary" size={28} />
            </div>
          ) : selectedSeller ? (
            <div className="space-y-6">
              <div>
                <p className="section-kicker text-primary/70">Seller review</p>
                <h2 className="mt-2 text-xl font-bold text-slate-950">{selectedSeller.user?.store_name || selectedSeller.user?.name || 'Seller'}</h2>
                <p className="mt-1 text-sm text-slate-500">{selectedSeller.user?.email}</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-border bg-secondary/20 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Approval</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">
                    {String(selectedSeller.seller_approval?.status || 'draft').replaceAll('_', ' ')}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {selectedSeller.seller_approval?.approved_at
                      ? `Approved ${new Date(selectedSeller.seller_approval.approved_at).toLocaleDateString()}`
                      : selectedSeller.seller_approval?.submitted_for_review_at
                        ? `Submitted ${new Date(selectedSeller.seller_approval.submitted_for_review_at).toLocaleDateString()}`
                        : 'Not submitted for review yet'}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-secondary/20 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Verification</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">{selectedSeller.verification?.status || 'not submitted'}</p>
                  <p className="mt-1 text-xs text-slate-500">{selectedSeller.verification?.document_type || 'No KYC document yet'}</p>
                </div>
              </div>

              {selectedSeller.seller_approval?.rejection_reason ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  Rejection reason: {selectedSeller.seller_approval.rejection_reason}
                </div>
              ) : null}
              {selectedSeller.seller_approval?.suspension_reason ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  Suspension reason: {selectedSeller.seller_approval.suspension_reason}
                </div>
              ) : null}

              <section className="rounded-[1.75rem] border border-black/5 bg-slate-50/70 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-950">Approval readiness</p>
                    <p className="mt-1 text-xs text-slate-500">Every item must be complete before the final approval action.</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700 shadow-sm">
                    {(selectedSeller.seller_approval?.requirements || []).filter((item: any) => item.completed).length}/6
                  </span>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {(selectedSeller.seller_approval?.requirements || []).map((item: any) => (
                    <div key={item.id} className={`flex items-center gap-3 rounded-2xl border px-3 py-3 ${item.completed ? 'border-emerald-100 bg-emerald-50/70' : 'border-amber-100 bg-amber-50/70'}`}>
                      <CheckCircle size={17} className={item.completed ? 'text-emerald-600' : 'text-slate-300'} />
                      <span className={`text-xs font-semibold ${item.completed ? 'text-emerald-800' : 'text-amber-800'}`}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </section>

              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-950">Review actions</h3>
                <div className="flex flex-wrap gap-2">
                  {[
                    ['approved', 'Approve'],
                    ['under_review', 'Mark Under Review'],
                    ['rejected', 'Reject'],
                    ['suspended', 'Suspend'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setReviewAction(value as typeof reviewAction)}
                      className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                        reviewAction === value ? 'bg-slate-950 text-white' : 'border border-border bg-white text-slate-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={reviewReason}
                  onChange={(event) => setReviewReason(event.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border border-border px-4 py-3 text-sm outline-none transition focus:border-primary"
                  placeholder="Add rejection or suspension reason when needed."
                />
                <button
                  type="button"
                  onClick={handleStatusChange}
                  disabled={reviewSaving}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {reviewSaving ? <Loader2 size={16} className="animate-spin" /> : reviewAction === 'approved' ? <CheckCircle size={16} /> : <ShieldAlert size={16} />}
                  Save seller review
                </button>
              </div>

              <div className="space-y-4">
                <section className="rounded-[1.75rem] border border-black/5 bg-white">
                  <div className="flex items-center justify-between gap-4 border-b border-black/5 px-4 py-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-950">KYC identity details</h3>
                      <p className="mt-1 text-xs text-slate-500">Submitted identity information for manual review.</p>
                    </div>
                    <FileText size={18} className="text-primary" />
                  </div>
                  <div className="grid gap-3 p-4 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Document</p><p className="mt-1 text-sm font-semibold text-slate-900">{selectedSeller.verification?.document_type || 'N/A'}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Document number</p><p className="mt-1 text-sm font-semibold text-slate-900">{selectedSeller.verification?.document_number || 'Missing'}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-3 sm:col-span-2"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Business</p><p className="mt-1 text-sm font-semibold text-slate-900">{selectedSeller.verification?.business_name || 'Not provided'}</p></div>
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-bold text-slate-950">KYC documents</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {(selectedSeller.verification?.documents || []).map((document: any) => (
                      <a
                        key={document.id}
                        href={document.file_url || document.url || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-2xl border border-border bg-secondary/20 p-4 text-sm text-slate-700"
                      >
                        <p className="font-semibold capitalize">{String(document.kind || document.type || 'document').replaceAll('_', ' ')}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Open uploaded file</p>
                      </a>
                    ))}
                    {!selectedSeller.verification?.documents?.length ? (
                      <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                        No KYC documents uploaded yet.
                      </div>
                    ) : null}
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-bold text-slate-950">Payout setup</h3>
                  <div className="mt-3 space-y-3">
                    {(selectedSeller.payout_methods || []).map((method: any) => (
                      <div key={method.id} className="rounded-2xl border border-border bg-secondary/20 p-4">
                        <p className="font-semibold text-slate-950">{method.provider || method.type || 'Payout method'}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {method.account_name || method.mobile_number || method.account_number || method.id}
                        </p>
                      </div>
                    ))}
                    {!selectedSeller.payout_methods?.length ? (
                      <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                        No payout method configured yet.
                      </div>
                    ) : null}
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-bold text-slate-950">Pickup locations</h3>
                  <div className="mt-3 space-y-3">
                    {(selectedSeller.pickup_locations || []).map((pickup: any) => (
                      <div key={pickup.id} className="rounded-2xl border border-border bg-secondary/20 p-4">
                        <p className="font-semibold text-slate-950">{pickup.name || 'Pickup point'}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[pickup.address, pickup.city, pickup.phone].filter(Boolean).join(' â€¢ ')}
                        </p>
                      </div>
                    ))}
                    {!selectedSeller.pickup_locations?.length ? (
                      <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                        No pickup location added yet.
                      </div>
                    ) : null}
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-bold text-slate-950">Products</h3>
                  <div className="mt-3 space-y-3">
                    {(selectedSeller.products || []).slice(0, 8).map((product: any) => (
                      <div key={product.id} className="rounded-2xl border border-border bg-secondary/20 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-950">{product.name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {product.product_status || 'draft'} â€¢ {formatPrice(Number(product.price || 0))}
                            </p>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${statusTone(product.product_status === 'published' ? 'approved' : 'draft')}`}>
                            {product.product_status || 'draft'}
                          </span>
                        </div>
                      </div>
                    ))}
                    {!selectedSeller.products?.length ? (
                      <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                        No products created yet.
                      </div>
                    ) : null}
                  </div>
                </section>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
              Select a seller to open the review panel.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
