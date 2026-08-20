import React, { useEffect, useMemo, useState } from 'react';
import { Clock3, Loader2, Zap } from 'lucide-react';
import { ProductCard } from '@/features/shop/components/ProductCard';

type FlashSaleProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  old_price: number;
  image: string;
  category: string;
  stock: number;
  rating: number;
  reviews_count: number;
  seller_name?: string;
};

type FlashSaleCampaign = {
  id: string;
  title: string;
  description?: string;
  banner_image?: string;
  starts_at: string;
  ends_at: string;
  status: string;
  entries?: Array<{
    id: string;
    sale_price: number;
    allocated_stock: number;
    product: FlashSaleProduct | null;
  }>;
};

const calculateCountdown = (targetIso?: string) => {
  if (!targetIso) {
    return { hours: '00', mins: '00', secs: '00', ended: true };
  }

  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) {
    return { hours: '00', mins: '00', secs: '00', ended: true };
  }

  const totalSeconds = Math.floor(diff / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const mins = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const secs = String(totalSeconds % 60).padStart(2, '0');

  return { hours, mins, secs, ended: false };
};

export const FlashSalePage = () => {
  const [campaign, setCampaign] = useState<FlashSaleCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(calculateCountdown());

  useEffect(() => {
    let active = true;

    const loadCampaign = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await fetch('/api/flash-sale/active', { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load flash sale');
        }

        if (!active) return;
        setCampaign(payload?.campaign || null);
      } catch (requestError) {
        if (!active) return;
        setCampaign(null);
        setError(requestError instanceof Error ? requestError.message : 'Failed to load flash sale');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadCampaign();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setCountdown(calculateCountdown(campaign?.ends_at || campaign?.starts_at));

    const interval = window.setInterval(() => {
      setCountdown(calculateCountdown(campaign?.ends_at || campaign?.starts_at));
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [campaign?.ends_at, campaign?.starts_at]);

  const products = useMemo(() => {
    return (campaign?.entries || [])
      .map((entry) => {
        if (!entry.product) return null;
        return {
          ...entry.product,
          old_price: entry.product.old_price || entry.product.price,
          price: entry.sale_price,
          stock: entry.allocated_stock || entry.product.stock,
        };
      })
      .filter(Boolean) as FlashSaleProduct[];
  }, [campaign]);

  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={34} />
      </div>
    );
  }

  return (
    <div className="pb-20">
      <div
        className="mb-12 bg-accent py-12 text-white"
        style={campaign?.banner_image ? { backgroundImage: `linear-gradient(rgba(15,23,42,0.72), rgba(15,23,42,0.72)), url(${campaign.banner_image})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-8 px-4 md:flex-row">
          <div className="space-y-4 text-center md:text-left">
            <h1 className="flex items-center justify-center space-x-4 font-display text-4xl font-bold md:justify-start md:text-6xl">
              <Zap size={48} fill="currentColor" />
              <span>{campaign?.title || 'FLASH SALE'}</span>
            </h1>
            <p className="max-w-2xl text-xl opacity-90">
              {campaign?.description || 'Live limited-time marketplace offers managed by admin and fulfilled by approved sellers.'}
            </p>
            {error ? <p className="text-sm text-amber-100">{error}</p> : null}
          </div>
          <div className="w-full rounded-2xl bg-white/20 p-6 text-center backdrop-blur-md md:min-w-[300px] md:w-auto">
            <p className="mb-4 flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-widest">
              <Clock3 size={16} />
              <span>{campaign?.status === 'scheduled' ? 'Starts In' : 'Ends In'}</span>
            </p>
            <div className="flex justify-center space-x-4">
              {[
                { label: 'Hours', value: countdown.hours },
                { label: 'Mins', value: countdown.mins },
                { label: 'Secs', value: countdown.secs },
              ].map((item) => (
                <div key={item.label} className="flex flex-col">
                  <span className="font-mono text-4xl font-bold">{item.value}</span>
                  <span className="text-[10px] font-bold uppercase opacity-70">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4">
        {!campaign ? (
          <div className="rounded-[32px] border border-dashed border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
            <h2 className="text-2xl font-bold text-slate-900">No live flash sale right now</h2>
            <p className="mt-3 text-sm text-slate-500">
              Admin campaigns will appear here after sellers are approved and the schedule goes live.
            </p>
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-[32px] border border-dashed border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
            <h2 className="text-2xl font-bold text-slate-900">Campaign ready, product approvals pending</h2>
            <p className="mt-3 text-sm text-slate-500">
              Approved seller entries will appear here as soon as admin reviews are complete.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-8 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Approved flash sale products</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Seller-submitted offers curated by admin for this campaign.
                </p>
              </div>
              <div className="rounded-full bg-primary/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">
                {products.length} products
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 md:grid-cols-4 lg:grid-cols-5">
              {products.map((product) => (
                <ProductCard key={product.id} product={product as any} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
