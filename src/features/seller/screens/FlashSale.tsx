import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Send, Zap } from 'lucide-react';
import toast from '@/lib/toast';
import { useUser } from '../../../features/shared/state/UserContext';
import { formatPrice } from '../../../lib/utils';

type SellerProduct = {
  id: string;
  name: string;
  price: number;
  stock: number;
};

type FlashSaleCampaign = {
  id: string;
  title: string;
  description?: string;
  starts_at: string;
  ends_at: string;
  status: string;
};

type FlashSaleEntry = {
  id: string;
  campaign_id: string;
  product_id: string;
  sale_price: number;
  allocated_stock: number;
  status: string;
  note?: string | null;
  rejection_reason?: string | null;
  product?: {
    id: string;
    name: string;
    price: number;
  } | null;
};

const initialForm = {
  campaignId: '',
  productId: '',
  salePrice: '',
  allocatedStock: '',
  note: '',
};

export const SellerFlashSalePage = () => {
  const { token, user } = useUser();
  const sellerApproved = user?.seller_status === 'approved';
  const [campaigns, setCampaigns] = useState<FlashSaleCampaign[]>([]);
  const [entries, setEntries] = useState<FlashSaleEntry[]>([]);
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(initialForm);
  const [focusedEntryId, setFocusedEntryId] = useState('');

  const loadData = async () => {
    if (!token) {
      setError('Please log in as a seller to manage flash sale submissions.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');

      const [campaignResponse, productResponse] = await Promise.all([
        fetch('/api/seller/flash-sale', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/seller/products', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const campaignPayload = await campaignResponse.json().catch(() => null);
      const productPayload = await productResponse.json().catch(() => null);

      if (!campaignResponse.ok) {
        throw new Error(campaignPayload?.error || 'Failed to load flash sale campaigns');
      }

      if (!productResponse.ok) {
        throw new Error(productPayload?.error || 'Failed to load seller products');
      }

      setCampaigns(Array.isArray(campaignPayload?.campaigns) ? campaignPayload.campaigns : []);
      setEntries(Array.isArray(campaignPayload?.entries) ? campaignPayload.entries : []);
      setProducts(Array.isArray(productPayload) ? productPayload : []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to load flash sale workspace');
      setCampaigns([]);
      setEntries([]);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [token]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const nextEntry = params.get('entry');
    if (nextEntry) {
      setFocusedEntryId(nextEntry);
    }
  }, []);

  const eligibleCampaigns = useMemo(
    () => campaigns.filter((campaign) => ['draft', 'scheduled', 'live', 'published'].includes(campaign.status)),
    [campaigns],
  );

  useEffect(() => {
    if (!focusedEntryId || typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      document.getElementById(`seller-flash-entry-${focusedEntryId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [entries, focusedEntryId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;

    try {
      setSaving(true);
      const response = await fetch('/api/seller/flash-sale/entries', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          campaignId: form.campaignId,
          productId: form.productId,
          salePrice: Number(form.salePrice),
          allocatedStock: Number(form.allocatedStock || 0),
          note: form.note,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to submit flash sale product');
      }

      toast.success('Flash sale product submitted for review.');
      setForm(initialForm);
      await loadData();
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Failed to submit flash sale product');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[32px] border border-black/5 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-primary">
              <Zap size={14} />
              Flash Sale Seller Desk
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Submit your best products for campaign approval</h1>
            <p className="max-w-3xl text-sm text-slate-600">
              Admin creates the campaign, you submit products with committed stock and sale pricing, and approved items go
              live on the marketplace flash sale page.
            </p>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div> : null}
      {!sellerApproved ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Flash sale submissions unlock after seller approval. You can prepare products now, but campaign submission stays locked.
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[32px] border border-black/5 bg-white p-8 shadow-sm">
          <div className="mb-6">
            <h2 className="text-xl font-bold">Submit Product</h2>
            <p className="text-sm text-slate-500">Pick an admin campaign, choose your product, and set the offer details.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Campaign</span>
                <select
                  value={form.campaignId}
                  onChange={(event) => setForm((current) => ({ ...current, campaignId: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                  required
                  disabled={!sellerApproved}
                >
                  <option value="">Select a campaign</option>
                  {eligibleCampaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.title} ({campaign.status})
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Product</span>
                <select
                  value={form.productId}
                  onChange={(event) => setForm((current) => ({ ...current, productId: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                  required
                  disabled={!sellerApproved}
                >
                  <option value="">Select your product</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({formatPrice(product.price)})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Flash sale price</span>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={form.salePrice}
                  onChange={(event) => setForm((current) => ({ ...current, salePrice: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                required
                disabled={!sellerApproved}
                />
              </label>

              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Allocated stock</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.allocatedStock}
                  onChange={(event) => setForm((current) => ({ ...current, allocatedStock: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                />
              </label>
            </div>

            <label className="space-y-2 text-sm">
              <span className="font-medium text-slate-700">Seller note</span>
              <textarea
                value={form.note}
                onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                rows={4}
                disabled={!sellerApproved}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                placeholder="Mention stock commitment, hero variants, or any approval notes."
              />
            </label>

            <button
              type="submit"
              disabled={saving || !sellerApproved}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white transition hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
              <span>{saving ? 'Submitting...' : 'Submit for approval'}</span>
            </button>
          </form>
        </section>

        <section className="rounded-[32px] border border-black/5 bg-white p-8 shadow-sm">
          <div className="mb-6">
            <h2 className="text-xl font-bold">Your submissions</h2>
            <p className="text-sm text-slate-500">Approved items go live, rejected items return with admin feedback.</p>
          </div>

          <div className="space-y-4">
            {entries.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                No seller submissions yet.
              </div>
            ) : (
              entries.map((entry) => (
                <div
                  id={`seller-flash-entry-${entry.id}`}
                  key={entry.id}
                  className={`rounded-3xl border border-slate-100 bg-slate-50 px-5 py-4 ${
                    entry.id === focusedEntryId ? 'border-indigo-300 ring-2 ring-indigo-200 bg-indigo-50/30' : ''
                  }`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <h3 className="font-semibold text-slate-900">{entry.product?.name || 'Product submission'}</h3>
                      <p className="text-sm text-slate-500">
                        Flash price {formatPrice(entry.sale_price)} â€¢ Allocated stock {entry.allocated_stock}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-700">
                      {entry.status}
                    </span>
                  </div>
                  {entry.note ? <p className="mt-3 text-sm text-slate-600">{entry.note}</p> : null}
                  {entry.rejection_reason ? (
                    <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      {entry.rejection_reason}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
