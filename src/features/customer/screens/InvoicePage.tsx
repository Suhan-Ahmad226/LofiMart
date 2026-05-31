import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from '@/src/lib/navigation';
import { ChevronLeft, Download, Loader2, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import { useUser } from '@/src/context/UserContext';
import { formatPrice } from '@/src/lib/utils';

export const CustomerInvoicePage = () => {
  const { id } = useParams();
  const { token } = useUser();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadOrder = async () => {
      if (!token || !id) {
        setOrder(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        const response = await fetch(`/api/orders/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load invoice');
        }

        if (typeof payload.shipping_address === 'string') {
          payload.shippingAddress = JSON.parse(payload.shipping_address);
        } else {
          payload.shippingAddress = payload.shipping_address;
        }

        setOrder(payload);
      } catch (requestError) {
        setOrder(null);
        setError(requestError instanceof Error ? requestError.message : 'Failed to load invoice');
      } finally {
        setLoading(false);
      }
    };

    void loadOrder();
  }, [id, token]);

  const shippingAddress = useMemo(() => {
    if (!order?.shippingAddress || typeof order.shippingAddress !== 'object') {
      return null;
    }
    return order.shippingAddress;
  }, [order]);

  const addressLines = useMemo(() => {
    if (!shippingAddress) return [];
    return [
      shippingAddress.fullName || shippingAddress.name || 'Customer',
      shippingAddress.phone || null,
      shippingAddress.alternatePhone || shippingAddress.alternate_phone || null,
      shippingAddress.address || null,
      [shippingAddress.upazila, shippingAddress.district, shippingAddress.division].filter(Boolean).join(', ') || null,
      shippingAddress.city || null,
    ].filter(Boolean);
  }, [shippingAddress]);

  const itemSubtotal = useMemo(() => {
    if (!Array.isArray(order?.items)) return 0;
    return order.items.reduce((sum: number, item: any) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
  }, [order?.items]);

  const orderTotal = Number(order?.total || 0);
  const adjustmentAmount = Math.max(0, itemSubtotal - orderTotal);
  const sellerEntries = useMemo(() => {
    const registry = new Map<string, { sellerName: string; storeName: string | null; email: string | null; phone: string | null }>();

    if (Array.isArray(order?.shipments)) {
      for (const shipment of order.shipments) {
        const sellerName = String(shipment?.seller_name || '').trim();
        const storeName = String(shipment?.seller_store_name || '').trim() || null;
        const email = String(shipment?.seller_email || '').trim() || null;
        const phone = String(shipment?.seller_phone || '').trim() || null;
        const key = `${sellerName}:${storeName || ''}`;
        if (sellerName && !registry.has(key)) {
          registry.set(key, { sellerName, storeName, email, phone });
        }
      }
    }

    if (registry.size === 0 && Array.isArray(order?.items)) {
      for (const item of order.items) {
        const sellerName = String(item?.seller_name || '').trim();
        const storeName = String(item?.seller_store_name || '').trim() || null;
        const email = String(item?.seller_email || '').trim() || null;
        const phone = String(item?.seller_phone || '').trim() || null;
        const key = `${sellerName}:${storeName || ''}`;
        if (sellerName && !registry.has(key)) {
          registry.set(key, { sellerName, storeName, email, phone });
        }
      }
    }

    return Array.from(registry.values());
  }, [order?.items, order?.shipments]);

  const timelineFacts = useMemo(() => {
    const facts = [
      { label: 'Placed', value: order?.created_at ? new Date(order.created_at).toLocaleString() : 'Pending' },
      { label: 'Pickup requested', value: order?.pickup_requested_at ? new Date(order.pickup_requested_at).toLocaleString() : 'Pending' },
      { label: 'Picked up', value: order?.picked_up_at ? new Date(order.picked_up_at).toLocaleString() : 'Pending' },
      { label: 'Delivered', value: order?.delivered_at ? new Date(order.delivered_at).toLocaleString() : 'Pending' },
    ];

    return facts;
  }, [order?.created_at, order?.delivered_at, order?.picked_up_at, order?.pickup_requested_at]);

  const totalUnits = useMemo(() => {
    if (!Array.isArray(order?.items)) return 0;
    return order.items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
  }, [order?.items]);

  const generatedAt = useMemo(() => new Date().toLocaleString(), []);
  const paymentReference = order?.payment_intent_id || order?.tracking_id || order?.order_code || order?.id || null;

  const handleDownloadPdf = async () => {
    if (!order) return;
    try {
      const response = await fetch(`/api/orders/${order.id}/invoice.pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to download invoice');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `invoice-${order.id}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      toast.success('PDF invoice downloaded successfully.');
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Failed to download invoice');
    }
  };

  const handleDownloadHtml = async () => {
    if (!order) return;
    try {
      const response = await fetch(`/api/orders/${order.id}/invoice`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to download invoice');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `invoice-${order.id}.html`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      toast.success('HTML invoice copy downloaded successfully.');
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Failed to download invoice');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={30} />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-4 py-24 text-center">
        <p className="font-bold text-accent">{error || 'Invoice not available.'}</p>
        <Link to="/account/orders" className="btn-primary inline-block px-8 py-2">
          Back to Orders
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 print:max-w-none print:bg-white print:px-0 print:py-0">
      <div className="flex flex-col gap-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link to={`/account/orders/${order.id}`} className="rounded-full p-2 transition hover:bg-gray-100">
            <ChevronLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Invoice</h1>
            <p className="text-sm text-gray-500">Printable invoice for order #{order.id}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Printer size={18} />
            <span>Print / Save as PDF</span>
          </button>
          <button
            onClick={() => void handleDownloadPdf()}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Download size={18} />
            <span>Download PDF</span>
          </button>
          <button
            onClick={() => void handleDownloadHtml()}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Download size={18} />
            <span>Download HTML copy</span>
          </button>
        </div>
      </div>

      <section className="mx-auto w-full max-w-[794px] rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/40 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="flex flex-col gap-6 border-b border-slate-200 pb-8 sm:flex-row sm:items-start sm:justify-between print:pb-6">
          <div>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-sky-100 bg-gradient-to-br from-white to-cyan-50 p-2 shadow-sm">
                <img src="/icon.svg" alt="LofiMart" className="h-full w-full object-contain" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-primary">LofiMart Invoice</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">LofiMart</h1>
              </div>
            </div>
            <h2 className="mt-5 text-3xl font-bold text-slate-950">Order #{order.order_code || order.id}</h2>
            <p className="mt-2 text-sm text-slate-500">
              Placed on {new Date(order.created_at).toLocaleString()}
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Invoice summary</p>
            <p className="mt-3"><span className="font-semibold text-slate-900">Internal ID:</span> {order.id}</p>
            <p className="mt-2"><span className="font-semibold text-slate-900">Order status:</span> {String(order.status).replaceAll('_', ' ')}</p>
            <p className="mt-2"><span className="font-semibold text-slate-900">Payment:</span> {order.payment_method || 'N/A'}</p>
            <p className="mt-2"><span className="font-semibold text-slate-900">Payment status:</span> {order.payment_status || 'untracked'}</p>
            {paymentReference ? <p className="mt-2"><span className="font-semibold text-slate-900">Reference:</span> {paymentReference}</p> : null}
            <p className="mt-2"><span className="font-semibold text-slate-900">Generated:</span> {generatedAt}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 print:mt-5 print:gap-3">
          <div className="rounded-3xl border border-emerald-100 bg-emerald-50 px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Total charged</p>
            <p className="mt-2 text-2xl font-black text-emerald-900">{formatPrice(orderTotal)}</p>
          </div>
          <div className="rounded-3xl border border-sky-100 bg-sky-50 px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Line items</p>
            <p className="mt-2 text-2xl font-black text-sky-900">{Array.isArray(order.items) ? order.items.length : 0}</p>
          </div>
          <div className="rounded-3xl border border-violet-100 bg-violet-50 px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">Units ordered</p>
            <p className="mt-2 text-2xl font-black text-violet-900">{totalUnits}</p>
          </div>
          <div className="rounded-3xl border border-amber-100 bg-amber-50 px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Shipment count</p>
            <p className="mt-2 text-2xl font-black text-amber-900">{Array.isArray(order.shipments) ? order.shipments.length : 0}</p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2 print:mt-6 print:gap-4">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Billing and delivery</p>
            <div className="mt-3 space-y-1 text-sm text-slate-700">
              {addressLines.map((line, index) => (
                <p key={`${line}-${index}`} className={index === 0 ? 'font-semibold text-slate-950' : ''}>
                  {line}
                </p>
              ))}
              {order.customer_email ? <p>{order.customer_email}</p> : null}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Shipping details</p>
            <div className="mt-3 space-y-1 text-sm text-slate-700">
              <p><span className="font-semibold text-slate-900">Courier:</span> {order.courier_provider || 'Pending assignment'}</p>
              <p><span className="font-semibold text-slate-900">Tracking:</span> {order.tracking_id || 'Pending assignment'}</p>
              <p><span className="font-semibold text-slate-900">Shipments:</span> {Array.isArray(order.shipments) ? order.shipments.length : 0}</p>
              {Array.isArray(order.shipments) && order.shipments.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {order.shipments.slice(0, 3).map((shipment: any) => (
                    <div key={shipment.id} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                      <p className="font-semibold text-slate-900">
                        {shipment.warehouse_name || 'Shipment'} â€¢ {String(shipment.status).replaceAll('_', ' ')}
                      </p>
                      {shipment.tracking_id ? <p className="mt-1">Tracking: {shipment.tracking_id}</p> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 print:break-inside-avoid">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Order checkpoints</p>
              <p className="mt-1 text-sm text-slate-500">A quick operational timeline for this invoice.</p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
              {String(order.status).replaceAll('_', ' ')}
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {timelineFacts.map((fact) => (
              <div key={fact.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{fact.label}</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{fact.value}</p>
              </div>
            ))}
          </div>
        </div>

        {sellerEntries.length > 0 ? (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5 print:break-inside-avoid">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Seller information</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {sellerEntries.map((entry) => (
                <div key={`${entry.sellerName}-${entry.storeName || 'store'}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                  <p className="font-semibold text-slate-950">{entry.storeName || entry.sellerName}</p>
                  <p className="mt-1">Seller: {entry.sellerName}</p>
                  <p className="mt-1 text-xs text-slate-500">Fulfilled through LofiMart marketplace</p>
                  {entry.phone ? <p className="mt-1 text-xs text-slate-500">Phone: {entry.phone}</p> : null}
                  {entry.email ? <p className="mt-1 text-xs text-slate-500">Email: {entry.email}</p> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 print:mt-6">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-4">Item</th>
                <th className="px-5 py-4">Quantity</th>
                <th className="px-5 py-4 text-right">Unit price</th>
                <th className="px-5 py-4 text-right">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Array.isArray(order.items) ? order.items.map((item: any) => (
                <tr key={item.id} className="text-sm text-slate-700">
                  <td className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <div className="h-14 w-14 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                        {item.image ? (
                          <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                            Item
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-950">{item.name}</p>
                        {item.variant_summary ? <p className="mt-1 text-xs font-medium text-primary">{item.variant_summary}</p> : null}
                        {item.sku ? <p className="mt-1 text-xs text-slate-500">SKU: {item.sku}</p> : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">{item.quantity}</td>
                  <td className="px-5 py-4 text-right">{formatPrice(item.price)}</td>
                  <td className="px-5 py-4 text-right font-semibold text-slate-950">{formatPrice(item.price * item.quantity)}</td>
                </tr>
              )) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-8 flex justify-end print:mt-6">
          <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center justify-between py-2 text-sm text-slate-600">
              <span>Items subtotal</span>
              <span className="font-semibold text-slate-950">{formatPrice(itemSubtotal)}</span>
            </div>
            <div className="flex items-center justify-between py-2 text-sm text-slate-600">
              <span>Shipping</span>
              <span className="font-semibold text-slate-950">Free</span>
            </div>
            {paymentReference ? (
              <div className="flex items-center justify-between py-2 text-sm text-slate-600">
                <span>Reference ID</span>
                <span className="font-semibold text-slate-950">{paymentReference}</span>
              </div>
            ) : null}
            {adjustmentAmount > 0 ? (
              <div className="flex items-center justify-between py-2 text-sm text-slate-600">
                <span>Discount / adjustment</span>
                <span className="font-semibold text-primary">-{formatPrice(adjustmentAmount)}</span>
              </div>
            ) : null}
            <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-4 text-base font-bold text-slate-950">
              <span>Total charged</span>
              <span className="text-primary">{formatPrice(orderTotal)}</span>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-3xl bg-slate-950 px-6 py-5 text-sm text-slate-200 print:mt-6 print:break-inside-avoid">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Support note</p>
          <p className="mt-2 leading-7">
            Keep this invoice for delivery reference, support follow-up, and payment clarification. If you contact support,
            share order code <span className="font-semibold text-white">{order.order_code || order.id}</span>.
          </p>
        </div>
      </section>
    </div>
  );
};
