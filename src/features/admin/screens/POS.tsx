'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, Loader2, Minus, Plus, Printer, Search, ShoppingCart } from 'lucide-react';
import { useUser } from '../../../features/shared/state/UserContext';
import { openPrintDocument } from '../../../lib/browser-actions';
import { formatPrice } from '../../../lib/utils';
import { Link } from '../../../lib/navigation';

type PosProduct = {
  id: string;
  name: string;
  slug: string;
  price: number;
  image: string | null;
  stock: number;
  category: string | null;
  seller_name?: string;
  warehouse_stock?: Array<{
    warehouse_id: string;
    warehouse_name: string;
    quantity: number;
  }>;
};

type PosReceiptItem = {
  id: string;
  qty: number;
  price: number;
  line_total: number;
  product_name: string;
};

type PosReceipt = {
  id: string;
  total: number;
  payment_method: string;
  payment_status: string;
  customer_name: string;
  customer_phone: string | null;
  created_at: string;
  items: PosReceiptItem[];
};

type PosResponse = {
  updatedAt: string;
  summary: {
    today_sales: number;
    today_orders: number;
    average_ticket: number;
  };
  shift_summary: {
    cashier_sales: number;
    cashier_orders: number;
    cash_sales: number;
    non_cash_sales: number;
  };
  close_summary: {
    generated_at: string;
    cashier_name: string;
    total_sales: number;
    total_orders: number;
    cash_sales: number;
    non_cash_sales: number;
    top_items: Array<{
      product_id: string;
      product_name: string;
      quantity: number;
      revenue_estimate: number;
    }>;
  };
  warehouses: Array<{
    id: string;
    name: string;
    city: string;
  }>;
  products: PosProduct[];
  recentOrders: PosReceipt[];
};

type CartLine = {
  product: PosProduct;
  quantity: number;
};

const buildReceiptHtml = (receipt: PosReceipt) => `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>POS Receipt ${receipt.id}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
      h1 { margin: 0 0 12px; font-size: 20px; }
      .muted { color: #6b7280; font-size: 12px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { text-align: left; padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
      .right { text-align: right; }
      .total { margin-top: 16px; font-size: 18px; font-weight: bold; text-align: right; }
    </style>
  </head>
  <body>
    <h1>POS Receipt</h1>
    <div class="muted">
      <div>Order: ${receipt.id}</div>
      <div>Customer: ${receipt.customer_name}</div>
      <div>Payment: ${receipt.payment_method}</div>
      <div>Time: ${new Date(receipt.created_at).toLocaleString()}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th class="right">Qty</th>
          <th class="right">Price</th>
          <th class="right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${receipt.items
          .map(
            (item) => `
              <tr>
                <td>${item.product_name}</td>
                <td class="right">${item.qty}</td>
                <td class="right">${item.price.toFixed(2)} BDT</td>
                <td class="right">${item.line_total.toFixed(2)} BDT</td>
              </tr>`,
          )
          .join('')}
      </tbody>
    </table>
    <div class="total">Total: ${receipt.total.toFixed(2)} BDT</div>
  </body>
</html>`;

const buildCloseReportHtml = (data: PosResponse['close_summary']) => `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>POS Close Report</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
      h1 { margin: 0 0 12px; font-size: 20px; }
      .meta { color: #6b7280; font-size: 12px; margin-bottom: 16px; }
      .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 16px 0; }
      .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; }
      .label { font-size: 12px; text-transform: uppercase; color: #6b7280; }
      .value { font-size: 18px; font-weight: bold; margin-top: 6px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { text-align: left; padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
      .right { text-align: right; }
    </style>
  </head>
  <body>
    <h1>POS Close Report</h1>
    <div class="meta">
      <div>Cashier: ${data.cashier_name}</div>
      <div>Generated: ${new Date(data.generated_at).toLocaleString()}</div>
    </div>
    <div class="grid">
      <div class="card"><div class="label">Total Sales</div><div class="value">${data.total_sales.toFixed(2)} BDT</div></div>
      <div class="card"><div class="label">Total Orders</div><div class="value">${data.total_orders}</div></div>
      <div class="card"><div class="label">Cash Sales</div><div class="value">${data.cash_sales.toFixed(2)} BDT</div></div>
      <div class="card"><div class="label">Non-cash Sales</div><div class="value">${data.non_cash_sales.toFixed(2)} BDT</div></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Top Item</th>
          <th class="right">Qty</th>
          <th class="right">Revenue</th>
        </tr>
      </thead>
      <tbody>
        ${data.top_items
          .map(
            (item) => `
            <tr>
              <td>${item.product_name}</td>
              <td class="right">${item.quantity}</td>
              <td class="right">${item.revenue_estimate.toFixed(2)} BDT</td>
            </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </body>
</html>`;

export const AdminPosPage = () => {
  const { token } = useUser();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<PosResponse | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'mobile_banking'>('cash');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [note, setNote] = useState('');
  const [lastReceipt, setLastReceipt] = useState<PosReceipt | null>(null);

  useEffect(() => {
    if (!token) return;

    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        setError('');
        const params = new URLSearchParams();
        if (search.trim()) params.set('search', search.trim());
        if (selectedWarehouseId) params.set('warehouseId', selectedWarehouseId);
        const response = await fetch(`/api/admin/pos${params.toString() ? `?${params.toString()}` : ''}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load POS data');
        }
        setData(payload);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Failed to load POS data');
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [search, selectedWarehouseId, token]);

  const cartSubtotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0),
    [cart],
  );

  const addToCart = (product: PosProduct) => {
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) {
        return current.map((line) =>
          line.product.id === product.id
            ? { ...line, quantity: Math.min(line.quantity + 1, Math.max(1, product.stock)) }
            : line,
        );
      }
      return [...current, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, nextQuantity: number) => {
    setCart((current) =>
      current
        .map((line) => {
          if (line.product.id !== productId) return line;
          return {
            ...line,
            quantity: Math.max(0, Math.min(nextQuantity, Math.max(1, line.product.stock))),
          };
        })
        .filter((line) => line.quantity > 0),
    );
  };

  const printReceipt = (receipt: PosReceipt) => {
    const opened = openPrintDocument(buildReceiptHtml(receipt), 'width=720,height=840');
    if (!opened) {
      setError('Could not open the print window. Please allow popups and try again.');
    }
  };

  const printCloseReport = () => {
    if (!data?.close_summary) return;
    const opened = openPrintDocument(buildCloseReportHtml(data.close_summary), 'width=760,height=900');
    if (!opened) {
      setError('Could not open the print window. Please allow popups and try again.');
    }
  };

  const submitSale = async () => {
    if (!token || cart.length === 0) {
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setSuccess('');
      const response = await fetch('/api/admin/pos/checkout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: cart.map((line) => ({
            productId: line.product.id,
            quantity: line.quantity,
          })),
          paymentMethod,
          warehouseId: selectedWarehouseId,
          customerName,
          customerPhone,
          note,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to complete POS sale');
      }

      setSuccess(`POS sale completed. Order ${payload.orderId} is now paid and recorded.`);
      setLastReceipt(payload.receipt);
      setCart([]);
      setCustomerPhone('');
      setNote('');

      const refreshedParams = new URLSearchParams();
      if (selectedWarehouseId) refreshedParams.set('warehouseId', selectedWarehouseId);
      const refreshed = await fetch(`/api/admin/pos${refreshedParams.toString() ? `?${refreshedParams.toString()}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const refreshedPayload = await refreshed.json().catch(() => null);
      if (refreshed.ok && refreshedPayload) {
        setData(refreshedPayload);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to complete POS sale');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">POS</h1>
          <p className="mt-1 text-sm text-slate-500">
            Walk-in cashier flow for quick in-store sales, stock deduction, and accounting capture.
          </p>
        </div>
        {data?.updatedAt ? (
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            Updated {new Date(data.updatedAt).toLocaleString()}
          </div>
        ) : null}
      </div>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}
      {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Today sales</p>
          <p className="mt-2 text-xl font-bold text-slate-950 md:text-2xl">{formatPrice(data?.summary.today_sales || 0)}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Today orders</p>
          <p className="mt-2 text-xl font-bold text-slate-950 md:text-2xl">{data?.summary.today_orders || 0}</p>
        </div>
        <div className="col-span-2 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-1 md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Average ticket</p>
          <p className="mt-2 text-xl font-bold text-slate-950 md:text-2xl">{formatPrice(data?.summary.average_ticket || 0)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">My shift sales</p>
          <p className="mt-2 text-xl font-bold text-slate-950 md:text-2xl">{formatPrice(data?.shift_summary.cashier_sales || 0)}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">My shift orders</p>
          <p className="mt-2 text-xl font-bold text-slate-950 md:text-2xl">{data?.shift_summary.cashier_orders || 0}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Cash collected</p>
          <p className="mt-2 text-xl font-bold text-emerald-700 md:text-2xl">{formatPrice(data?.shift_summary.cash_sales || 0)}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Non-cash sales</p>
          <p className="mt-2 text-xl font-bold text-slate-950 md:text-2xl">{formatPrice(data?.shift_summary.non_cash_sales || 0)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[32px] border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Cashier close report</h2>
              <p className="text-sm text-slate-500">Use this for end-of-day reconciliation and handover.</p>
            </div>
            <button
              type="button"
              onClick={printCloseReport}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Printer size={16} />
              Print close report
            </button>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Cashier</p>
              <p className="mt-2 text-base font-bold text-slate-950">{data?.close_summary.cashier_name || 'Admin Cashier'}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Generated</p>
              <p className="mt-2 text-base font-bold text-slate-950">
                {data?.close_summary.generated_at ? new Date(data.close_summary.generated_at).toLocaleString() : 'Awaiting data'}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Top sold items today</h2>
            <p className="text-sm text-slate-500">Fast view of the strongest products from the POS counter.</p>
          </div>
          <div className="mt-4 space-y-3">
            {(data?.close_summary.top_items || []).map((item) => (
              <div key={item.product_id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{item.product_name}</p>
                    <p className="text-xs text-slate-500">Qty sold: {item.quantity}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-950">{formatPrice(item.revenue_estimate)}</p>
                    <p className="text-xs text-slate-500">Revenue</p>
                  </div>
                </div>
              </div>
            ))}
            {(data?.close_summary.top_items || []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                No POS sales yet for today.
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <section className="rounded-[32px] border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Sell from catalog</h2>
              <p className="text-sm text-slate-500">Search live inventory and add items to the cashier cart.</p>
            </div>
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 md:rounded-full md:py-2">
                <Search size={16} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search product, slug, category"
                  className="w-full bg-transparent outline-none md:w-72"
                />
              </label>
              <select
                value={selectedWarehouseId}
                onChange={(event) => setSelectedWarehouseId(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 outline-none md:w-auto md:rounded-full md:py-2"
              >
                <option value="">All pickup warehouses</option>
                {(data?.warehouses || []).map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} â€¢ {warehouse.city}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="animate-spin text-primary" size={28} />
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              {(data?.products || []).map((product) => (
                <div key={product.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{product.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {product.category || 'General merchandise'}
                        {product.seller_name ? ` â€¢ ${product.seller_name}` : ''}
                      </p>
                      {selectedWarehouseId ? (
                        <p className="mt-1 text-[11px] font-medium text-primary">
                          {product.warehouse_stock?.find((entry) => entry.warehouse_id === selectedWarehouseId)?.quantity ?? 0} available in selected warehouse
                        </p>
                      ) : null}
                    </div>
                    <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                      {product.stock} in stock
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-lg font-bold text-slate-950">{formatPrice(product.price)}</div>
                    <button
                      type="button"
                      onClick={() => addToCart(product)}
                      className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90"
                    >
                      Add to cart
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <section className="rounded-[32px] border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <div className="flex items-center gap-3">
              <ShoppingCart size={20} className="text-primary" />
              <div>
                <h2 className="font-bold text-slate-950">Cashier cart</h2>
                <p className="text-sm text-slate-500">{cart.length} line item{cart.length === 1 ? '' : 's'}</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {cart.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  Add products from the catalog to begin a walk-in sale.
                </div>
              ) : (
                cart.map((line) => (
                  <div key={line.product.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">{line.product.name}</p>
                        <p className="text-sm text-slate-500">{formatPrice(line.product.price)} each</p>
                      </div>
                      <div className="text-sm font-semibold text-slate-950">{formatPrice(line.product.price * line.quantity)}</div>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => updateQuantity(line.product.id, line.quantity - 1)}
                        className="rounded-full border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="min-w-8 text-center text-sm font-semibold text-slate-950">{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(line.product.id, line.quantity + 1)}
                        className="rounded-full border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 space-y-3">
              <input
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Customer name"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-0 transition focus:border-primary"
              />
              <input
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                placeholder="Customer phone"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-0 transition focus:border-primary"
              />
              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as 'cash' | 'card' | 'mobile_banking')}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-0 transition focus:border-primary"
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="mobile_banking">Mobile banking</option>
              </select>
              <select
                value={selectedWarehouseId}
                onChange={(event) => setSelectedWarehouseId(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-0 transition focus:border-primary"
              >
                <option value="">Auto-select source warehouse</option>
                {(data?.warehouses || []).map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} â€¢ {warehouse.city}
                  </option>
                ))}
              </select>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="Optional cashier note"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-0 transition focus:border-primary"
              />
            </div>

            <div className="mt-6 rounded-2xl bg-slate-950 p-5 text-white">
              <div className="flex items-center justify-between text-sm text-white/70">
                <span>Subtotal</span>
                <span>{formatPrice(cartSubtotal)}</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-lg font-bold">
                <span>Total due</span>
                <span>{formatPrice(cartSubtotal)}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={cart.length === 0 || submitting}
              onClick={() => void submitSale()}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? <Loader2 className="animate-spin" size={16} /> : <CreditCard size={16} />}
              Complete sale
            </button>

            {lastReceipt ? (
              <button
                type="button"
                onClick={() => printReceipt(lastReceipt)}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <Printer size={16} />
                Print last receipt
              </button>
            ) : null}
          </section>

          <section className="rounded-[32px] border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-bold text-slate-950">Recent POS sales</h2>
                <p className="text-sm text-slate-500">Latest paid walk-in orders recorded by the cashier.</p>
              </div>
              <Link to="/admin/orders?search=pos" className="text-sm font-semibold text-primary hover:underline">
                Open orders
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {(data?.recentOrders || []).map((order) => (
                <div key={order.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{order.customer_name}</p>
                      <p className="text-xs text-slate-500">{new Date(order.created_at).toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-950">{formatPrice(order.total)}</p>
                      <p className="text-xs uppercase tracking-wide text-slate-500">{order.payment_method}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {order.items.map((item) => `${item.product_name} x${item.qty}`).join(' â€¢ ')}
                  </p>
                </div>
              ))}
              {(data?.recentOrders || []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  No POS sales recorded yet.
                </div>
              ) : null}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default AdminPosPage;
