'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Package2, Pencil, Plus, Search, Trash2, XCircle } from 'lucide-react';
import toast from '@/lib/toast';
import {
  DEFAULT_ENABLED_MANUAL_ORDER_PAYMENT_METHODS,
  isKnownManualOrderPaymentMethod,
} from '../../../lib/commerce-channels';
import { useUser } from '../../../features/shared/state/UserContext';
import { useCommerceConfig } from '../../../features/shared/state/CommerceConfigContext';
import { formatPrice } from '../../../lib/utils';
import { Link } from '../../../lib/navigation';

type Mode = 'seller' | 'reseller';

type CatalogProduct = {
  id: string;
  sku?: string | null;
  name: string;
  category: string;
  price: number;
  stock: number;
  reseller_base_price?: number | null;
  reseller_sale_price?: number | null;
  specifications?: Array<{ label: string; value: string }>;
  variant_options?: Array<{ name: string; values: Array<{ label: string; sku_suffix?: string | null }> }>;
};

type OrderLine = {
  category: string;
  productId: string;
  quantity: number;
  unitPrice: string;
  variantSelections: Record<string, string>;
};

type RecentManualOrder = {
  id: string;
  order_code?: string | null;
  status: string;
  total: number;
  payment_method?: string | null;
  created_at: string;
  shipping_address?: {
    name?: string;
    phone?: string;
    city?: string;
    address?: string;
    note?: string;
  } | null;
  items?: Array<{
    id: string;
    name?: string;
    sku?: string | null;
    quantity: number;
  }>;
};

type EditOrderForm = {
  customerName: string;
  customerPhone: string;
  customerCity: string;
  customerAddress: string;
  paymentMethod: string;
  note: string;
};

const emptyLine: OrderLine = {
  category: '',
  productId: '',
  quantity: 1,
  unitPrice: '',
  variantSelections: {},
};

const manualOrderPaymentOptions = [
  { value: 'cod', label: 'Cash on delivery' },
  { value: 'cash', label: 'Cash paid' },
  { value: 'bkash', label: 'bKash paid' },
  { value: 'nagad', label: 'Nagad paid' },
  { value: 'bank_transfer', label: 'Bank transfer' },
];

const getEnabledManualOrderPaymentOptions = (enabledPaymentMethods: string[]) =>
  manualOrderPaymentOptions.filter((option) => enabledPaymentMethods.includes(option.value));

function buildVariantSummary(line: OrderLine) {
  const pairs = Object.entries(line.variantSelections).filter(([, value]) => value);
  if (pairs.length === 0) return null;
  return pairs.map(([key, value]) => `${key}: ${value}`).join(', ');
}

function buildVariantSku(product: CatalogProduct | undefined, line: OrderLine) {
  if (!product?.sku) return null;
  const suffixes = Array.isArray(product.variant_options)
    ? product.variant_options
        .map((option) => {
          const selectedLabel = line.variantSelections[option.name];
          const selectedValue = option.values.find((value) => value.label === selectedLabel);
          return selectedValue?.sku_suffix ? String(selectedValue.sku_suffix).trim().toUpperCase() : null;
        })
        .filter((value): value is string => Boolean(value))
    : [];

  return suffixes.length > 0 ? `${product.sku}-${suffixes.join('-')}` : product.sku;
}

function buildVariantSkuMatches(product: CatalogProduct) {
  const baseSku = String(product.sku || '').trim().toUpperCase();
  if (!baseSku || !Array.isArray(product.variant_options) || product.variant_options.length === 0) {
    return [];
  }

  const results: Array<{ sku: string; variantSelections: Record<string, string> }> = [];

  const walk = (
    optionIndex: number,
    suffixes: string[],
    selections: Record<string, string>,
  ) => {
    const option = product.variant_options?.[optionIndex];
    if (!option) {
      if (suffixes.length > 0) {
        results.push({
          sku: `${baseSku}-${suffixes.join('-')}`,
          variantSelections: selections,
        });
      }
      return;
    }

    for (const value of option.values || []) {
      const suffix = String(value.sku_suffix || '').trim().toUpperCase();
      if (!suffix) continue;
      walk(
        optionIndex + 1,
        [...suffixes, suffix],
        {
          ...selections,
          [option.name]: value.label,
        },
      );
    }
  };

  walk(0, [], {});
  return results;
}

function resolveSkuMatch(products: CatalogProduct[], rawSku: string) {
  const normalizedSku = rawSku.trim().toUpperCase();
  if (!normalizedSku) return null;

  for (const product of products) {
    const baseSku = String(product.sku || '').trim().toUpperCase();
    if (baseSku && baseSku === normalizedSku) {
      return {
        product,
        variantSelections: {} as Record<string, string>,
      };
    }

    const variantMatch = buildVariantSkuMatches(product).find((entry) => entry.sku === normalizedSku);
    if (variantMatch) {
      return {
        product,
        variantSelections: variantMatch.variantSelections,
      };
    }
  }

  return null;
}

export const ManualOrderWorkspace: React.FC<{ mode: Mode }> = ({ mode }) => {
  const { token } = useUser();
  const commerceConfig = useCommerceConfig();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [refCode, setRefCode] = useState('');
  const [search, setSearch] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerCity, setCustomerCity] = useState('Dhaka');
  const [paymentMethod, setPaymentMethod] = useState<string>(DEFAULT_ENABLED_MANUAL_ORDER_PAYMENT_METHODS[0]);
  const [enabledPaymentMethods, setEnabledPaymentMethods] = useState<string[]>([...DEFAULT_ENABLED_MANUAL_ORDER_PAYMENT_METHODS]);
  const [note, setNote] = useState('');
  const [items, setItems] = useState<OrderLine[]>([{ ...emptyLine }]);
  const [successMessage, setSuccessMessage] = useState('');
  const [skuInput, setSkuInput] = useState('');
  const [recentOrders, setRecentOrders] = useState<RecentManualOrder[]>([]);
  const [editingOrderId, setEditingOrderId] = useState('');
  const [editForm, setEditForm] = useState<EditOrderForm | null>(null);
  const [savingOrderId, setSavingOrderId] = useState('');
  const [cancelConfirmId, setCancelConfirmId] = useState('');
  const visiblePaymentOptions = useMemo(
    () => getEnabledManualOrderPaymentOptions(enabledPaymentMethods),
    [enabledPaymentMethods],
  );

  useEffect(() => {
    if (!Array.isArray(commerceConfig?.enabled_manual_order_payment_methods)) return;
    const nextMethods = commerceConfig.enabled_manual_order_payment_methods.filter((value: unknown): value is string =>
      isKnownManualOrderPaymentMethod(typeof value === 'string' ? value : ''),
    );
    if (nextMethods.length === 0) return;
    setEnabledPaymentMethods(nextMethods);
    setPaymentMethod((current) => (nextMethods.includes(current) ? current : nextMethods[0]));
  }, [commerceConfig]);

  useEffect(() => {
    if (!token) {
      setProducts([]);
      setCategories([]);
      setLoading(false);
      return;
    }

    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [catalogResponse, ordersResponse] = await Promise.all([
          fetch(`/api/${mode}/manual-orders/catalog`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/${mode}/manual-orders`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const payload = await catalogResponse.json().catch(() => null);
        const ordersPayload = await ordersResponse.json().catch(() => null);
        if (!catalogResponse.ok) {
          throw new Error(payload?.error || 'Failed to load manual order catalog');
        }
        if (!ordersResponse.ok) {
          throw new Error(ordersPayload?.error || 'Failed to load recent manual orders');
        }
        if (!active) return;
        setProducts(Array.isArray(payload?.products) ? payload.products : []);
        setCategories(Array.isArray(payload?.categories) ? payload.categories : []);
        setRefCode(typeof payload?.refCode === 'string' ? payload.refCode : '');
        setRecentOrders(Array.isArray(ordersPayload) ? ordersPayload : []);
      } catch (requestError) {
        if (!active) return;
        setProducts([]);
        setCategories([]);
        setRecentOrders([]);
        setError(requestError instanceof Error ? requestError.message : 'Failed to load manual order catalog');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [mode, token]);

  const refreshRecentOrders = async () => {
    if (!token) return;
    try {
      const response = await fetch(`/api/${mode}/manual-orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load recent manual orders');
      }
      setRecentOrders(Array.isArray(payload) ? payload : []);
    } catch {
      // Keep current list if refresh fails.
    }
  };

  const searchableProducts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((product) =>
      [
        product.name,
        product.category,
        product.sku || '',
        ...buildVariantSkuMatches(product).map((entry) => entry.sku),
      ].some((value) => String(value || '').toLowerCase().includes(needle)),
    );
  }, [products, search]);

  const allProductById = useMemo(
    () => new Map(products.map((product) => [String(product.id), product])),
    [products],
  );

  const updateLine = (index: number, next: Partial<OrderLine>) => {
    setItems((current) =>
      current.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        const updated = { ...line, ...next };
        if ('category' in next && next.category !== line.category) {
          updated.productId = '';
          updated.unitPrice = '';
          updated.variantSelections = {};
        }
        if ('productId' in next) {
          const selectedProduct = allProductById.get(String(next.productId || ''));
          updated.variantSelections = {};
          if (selectedProduct) {
            updated.unitPrice = String(
              mode === 'reseller'
                ? selectedProduct.reseller_sale_price ?? selectedProduct.price
                : selectedProduct.price,
            );
            if (!updated.category) {
              updated.category = selectedProduct.category || '';
            }
          }
        }
        return updated;
      }),
    );
  };

  const handleSkuQuickAdd = () => {
    const normalizedSku = skuInput.trim().toUpperCase();
    if (!normalizedSku) {
      return;
    }

    const match = resolveSkuMatch(products, normalizedSku);
    if (!match) {
      toast.error('No product matched that SKU.');
      return;
    }
    const matchedProduct = match.product;

    const nextUnitPrice =
      mode === 'reseller'
        ? String(matchedProduct.reseller_sale_price ?? matchedProduct.price)
        : String(matchedProduct.price);

    setItems((current) => {
      const emptyLineIndex = current.findIndex((line) => !line.productId);
      if (emptyLineIndex >= 0) {
        return current.map((line, index) =>
          index === emptyLineIndex
              ? {
                ...line,
                category: matchedProduct.category || '',
                productId: String(matchedProduct.id),
                quantity: 1,
                unitPrice: nextUnitPrice,
                variantSelections: match.variantSelections,
              }
            : line,
        );
      }

      return [
        ...current,
        {
          category: matchedProduct.category || '',
          productId: String(matchedProduct.id),
          quantity: 1,
          unitPrice: nextUnitPrice,
          variantSelections: match.variantSelections,
        },
      ];
    });

    setSkuInput('');
    toast.success(`${matchedProduct.name} added by SKU.`);
  };

  const resetForm = () => {
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setCustomerCity('Dhaka');
    setPaymentMethod(DEFAULT_ENABLED_MANUAL_ORDER_PAYMENT_METHODS[0]);
    setNote('');
    setItems([{ ...emptyLine }]);
  };

  const canManageRecentOrder = (status: string) => {
    const normalized = String(status || '').toLowerCase();
    return !['picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'returned', 'delivery_failed', 'cancelled', 'refunded'].includes(normalized);
  };

  const startEditingOrder = (order: RecentManualOrder) => {
    setCancelConfirmId('');
    setEditingOrderId(order.id);
    setEditForm({
      customerName: order.shipping_address?.name || '',
      customerPhone: order.shipping_address?.phone || '',
      customerCity: order.shipping_address?.city || '',
      customerAddress: order.shipping_address?.address || '',
      paymentMethod: enabledPaymentMethods.includes(String(order.payment_method || '').toLowerCase())
        ? String(order.payment_method)
        : DEFAULT_ENABLED_MANUAL_ORDER_PAYMENT_METHODS[0],
      note: order.shipping_address?.note || '',
    });
  };

  const stopEditingOrder = () => {
    setEditingOrderId('');
    setEditForm(null);
  };

  const handleUpdateManualOrder = async (orderId: string) => {
    if (!token || !editForm) return;
    setSavingOrderId(orderId);
    setError('');

    try {
      const response = await fetch(`/api/${mode}/manual-orders/${orderId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editForm),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update manual order');
      }
      toast.success(`Manual order ${payload?.order_code || payload?.id || ''} updated.`);
      stopEditingOrder();
      await refreshRecentOrders();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Failed to update manual order';
      setError(message);
      toast.error(message);
    } finally {
      setSavingOrderId('');
    }
  };

  const handleCancelManualOrder = async (orderId: string) => {
    if (!token) return;
    setSavingOrderId(orderId);
    setError('');

    try {
      const response = await fetch(`/api/${mode}/manual-orders/${orderId}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to cancel manual order');
      }
      setCancelConfirmId('');
      stopEditingOrder();
      toast.success(`Manual order ${payload?.order_code || payload?.id || ''} cancelled.`);
      await refreshRecentOrders();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Failed to cancel manual order';
      setError(message);
      toast.error(message);
    } finally {
      setSavingOrderId('');
    }
  };

  const submitManualOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccessMessage('');

    try {
      const payload = {
        customerName,
        customerPhone,
        customerAddress,
        customerCity,
        paymentMethod,
        note,
        items: items
          .filter((line) => line.productId)
          .map((line) => ({
            productId: line.productId,
            quantity: Number(line.quantity || 1),
            unitPrice: Number(line.unitPrice || 0),
            variantSummary: buildVariantSummary(line),
            variantSku: buildVariantSku(allProductById.get(String(line.productId || '')), line),
          })),
      };

      const response = await fetch(`/api/${mode}/manual-orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to create manual order');
      }

      const label = result?.orderCode || result?.orderId;
      setSuccessMessage(`Manual order ${label} created successfully.`);
      toast.success(`Manual order ${label} created.`);
      resetForm();
      await refreshRecentOrders();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Failed to create manual order';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
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
    <div className="min-h-full bg-[#fdf7ff] px-4 py-5 text-[#1d1b20] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6">
        <header className="flex flex-col justify-between gap-4 pb-1 md:flex-row md:items-center">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#63597c]">
              <Link to={mode === 'seller' ? '/seller/manual-orders' : '/reseller-dashboard/manual-orders'} className="inline-flex items-center gap-1 text-[#4f378a] hover:text-[#1d1b20]">
                <span aria-hidden="true">←</span> Manual Orders
              </Link>
              <span className="text-[#cbc4d2]">/</span>
              <span className="text-[#494551]">New Order Draft</span>
            </div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-[#1d1b20] sm:text-[32px]">Create Manual Order</h1>
          </div>
          <Link to="#recent-orders" className="inline-flex items-center gap-2 self-start rounded-lg bg-[#f2ecf4] px-4 py-2 text-sm font-semibold text-[#1d1b20] shadow-sm transition hover:bg-[#e6e0e9] md:self-auto">
            Recent Orders <span aria-hidden="true">→</span>
          </Link>
        </header>

      <section className="rounded-xl bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-lg bg-[#e9ddff] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#4f378a]">
              Quick add tools
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-600">
              Use search to filter products fast, or paste a SKU to jump straight into the order line.
            </p>
            {mode === 'reseller' && refCode ? (
              <p className="text-xs font-semibold text-primary">Active reseller code: {refCode}</p>
            ) : null}
          </div>

          <div className="flex w-full flex-col gap-3 lg:max-w-[34rem]">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, category, or SKU"
                className="w-full rounded-lg border border-[#cbc4d2]/60 bg-[#f8f2fa] py-3 pl-11 pr-4 text-sm outline-none transition focus:border-[#4f378a] focus:bg-white focus:ring-2 focus:ring-[#4f378a]/15"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <input
                value={skuInput}
                onChange={(event) => setSkuInput(event.target.value.toUpperCase())}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleSkuQuickAdd();
                  }
                }}
                placeholder="Enter or scan SKU"
                className="min-w-0 flex-1 rounded-lg border border-[#cbc4d2]/60 bg-[#f8f2fa] px-4 py-3 text-sm outline-none transition focus:border-[#4f378a] focus:ring-2 focus:ring-[#4f378a]/15"
              />
              <button
                type="button"
                onClick={handleSkuQuickAdd}
                className="rounded-lg bg-[#1d1b20] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#322f35]"
              >
                Add by SKU
              </button>
            </div>
            <p className="text-xs leading-5 text-slate-500">
              Barcode scanner or short SKU paste works too. Press Enter and the product line will auto-fill.
            </p>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}
      {successMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div>
      ) : null}

      <form onSubmit={submitManualOrder} className="grid items-start gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <div className="rounded-xl bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between border-b border-[#ece6ee] pb-4">
              <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#1d1b20]">Customer Information</h2>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#4f378a]">Manual Intake</span>
            </div>
            <div className="mt-5 grid gap-4">
              <input
                required
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Customer name"
                className="rounded-lg bg-[#f8f2fa] px-4 py-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-[#4f378a]/20"
              />
              <input
                required
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                placeholder="Phone number"
                className="rounded-lg bg-[#f8f2fa] px-4 py-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-[#4f378a]/20"
              />
              <input
                required
                value={customerCity}
                onChange={(event) => setCustomerCity(event.target.value)}
                placeholder="City"
                className="rounded-lg bg-[#f8f2fa] px-4 py-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-[#4f378a]/20"
              />
              <textarea
                required
                rows={4}
                value={customerAddress}
                onChange={(event) => setCustomerAddress(event.target.value)}
                placeholder="Full customer address"
                className="rounded-lg bg-[#f8f2fa] px-4 py-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-[#4f378a]/20"
              />
              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
                className="rounded-lg bg-[#f8f2fa] px-4 py-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-[#4f378a]/20"
              >
                {visiblePaymentOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <textarea
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional delivery note"
                className="rounded-lg bg-[#f8f2fa] px-4 py-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-[#4f378a]/20"
              />
            </div>
          </div>

          <div className="rounded-xl bg-[#f2ecf4] p-5 shadow-sm sm:p-6">
            <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#1d1b20]">Quick rules</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>Products are filtered by category and searchable by SKU for faster order creation.</p>
              <p>SKU is auto-generated and short, so sellers can find products quickly.</p>
              {mode === 'reseller' ? (
                <p>Your unit price cannot go below the seller reseller base price.</p>
              ) : (
                <p>You can create orders directly from your own stock-ready product list.</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xl font-bold text-[#1d1b20]">Order Items</h2>
            <button
              type="button"
              onClick={() => setItems((current) => [...current, { ...emptyLine }])}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#4f378a] shadow-sm transition hover:bg-[#f2ecf4]"
            >
              <Plus size={16} />
              <span>Add item</span>
            </button>
          </div>

          {items.map((line, index) => {
            const selectedProduct = allProductById.get(String(line.productId || ''));
            const productOptions = searchableProducts.filter(
              (product) => !line.category || product.category === line.category,
            );
            const itemSubtotal = (Number(line.unitPrice || 0) || 0) * (Number(line.quantity || 0) || 0);

            return (
              <div key={`manual-order-line-${index}`} className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex items-center justify-between rounded-lg bg-[#f8f2fa] px-3 py-2">
                  <span className="rounded bg-[#1d1b20] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white">Item {String(index + 1).padStart(2, '0')}</span>
                  <span className="text-xs font-semibold text-[#765b00]">In stock: {selectedProduct?.stock ?? '—'} units</span>
                </div>
                <div className="grid gap-3 lg:grid-cols-[0.7fr_1.2fr_0.45fr_0.55fr_auto]">
                  <select
                    value={line.category}
                    onChange={(event) => updateLine(index, { category: event.target.value })}
                    className="rounded-lg bg-[#f8f2fa] px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-[#4f378a]/20"
                  >
                    <option value="">All categories</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <select
                    value={line.productId}
                    onChange={(event) => updateLine(index, { productId: event.target.value })}
                    className="rounded-lg bg-[#f8f2fa] px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-[#4f378a]/20"
                  >
                    <option value="">Select a product</option>
                    {productOptions.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.sku ? `${product.sku} - ` : ''}{product.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(event) => updateLine(index, { quantity: Math.max(1, Number(event.target.value || 1)) })}
                    className="rounded-lg bg-[#f8f2fa] px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-[#4f378a]/20"
                  />
                  <input
                    type="number"
                    min={mode === 'reseller' ? Number(selectedProduct?.reseller_base_price || 0) : 0}
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(event) => updateLine(index, { unitPrice: event.target.value })}
                    className="rounded-lg bg-[#f8f2fa] px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-[#4f378a]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setItems((current) => (current.length === 1 ? [{ ...emptyLine }] : current.filter((_, lineIndex) => lineIndex !== index)))}
                    className="inline-flex items-center justify-center rounded-lg border border-rose-200 px-3 text-rose-600 transition hover:bg-rose-50"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                {selectedProduct ? (
                  <div className="mt-4 rounded-xl bg-[#f8f2fa] p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#ece6ee] text-[#4f378a]">
                          <Package2 size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{selectedProduct.name}</p>
                          <p className="text-xs text-slate-500">
                            SKU: {buildVariantSku(selectedProduct, line) || selectedProduct.sku || 'Auto on save'} â€¢ Stock: {selectedProduct.stock}
                          </p>
                        </div>
                      </div>
                      <div className="text-sm font-bold text-primary">Subtotal {formatPrice(itemSubtotal)}</div>
                    </div>

                    {Array.isArray(selectedProduct.variant_options) && selectedProduct.variant_options.length > 0 ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {selectedProduct.variant_options.map((option) => (
                          <div key={`${selectedProduct.id}-${option.name}`} className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">{option.name}</label>
                            <select
                              value={line.variantSelections[option.name] || ''}
                              onChange={(event) =>
                                updateLine(index, {
                                  variantSelections: {
                                    ...line.variantSelections,
                                    [option.name]: event.target.value,
                                  },
                                })
                              }
                              className="w-full rounded-lg border border-[#cbc4d2]/70 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#4f378a]/20"
                            >
                              <option value="">Select {option.name}</option>
                              {option.values.map((value) => (
                                <option key={`${option.name}-${value.label}`} value={value.label}>
                                  {value.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {Array.isArray(selectedProduct.specifications) && selectedProduct.specifications.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {selectedProduct.specifications.slice(0, 6).map((specification) => (
                          <span
                            key={`${selectedProduct.id}-${specification.label}`}
                            className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-600"
                          >
                            {specification.label}: {specification.value}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}

          <div className="flex items-center justify-between rounded-xl bg-[#e9ddff] px-5 py-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#4f378a]">Order total</p>
              <p className="mt-2 text-2xl font-extrabold text-[#1d1b20]">
                {formatPrice(
                  items.reduce((sum, line) => sum + (Number(line.unitPrice || 0) || 0) * (Number(line.quantity || 0) || 0), 0),
                )}
              </p>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-[#4f378a] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#6750a4] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Creating order...' : 'Create manual order'}
            </button>
          </div>
        </div>
      </form>

      <div id="recent-orders" className="rounded-xl bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-[#1d1b20]">Recent Manual Orders</h2>
            <p className="text-sm text-[#494551]">Latest customer orders requiring fulfillment or tracking.</p>
          </div>
          <button
            type="button"
            onClick={() => void refreshRecentOrders()}
            className="rounded-lg bg-[#f2ecf4] px-4 py-2 text-sm font-semibold text-[#1d1b20] transition hover:bg-[#e6e0e9]"
          >
            Refresh
          </button>
        </div>

        {recentOrders.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
            No manual orders created yet.
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <div className="min-w-[720px] space-y-3">
            {recentOrders.slice(0, 10).map((order) => (
              <div key={order.id} className="rounded-lg border-b border-[#ece6ee] bg-white p-4 transition hover:bg-[#f8f2fa]">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-950">#{order.order_code || order.id}</p>
                    <p className="text-xs text-slate-500">
                      {order.shipping_address?.name || 'Customer'} â€¢ {order.shipping_address?.phone || 'No phone'} â€¢ {order.shipping_address?.city || 'City pending'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="rounded-full bg-[#e1d4fd] px-3 py-1 font-semibold text-[#63597c]">
                      {String(order.status).replaceAll('_', ' ')}
                    </span>
                    <span className="font-bold text-primary">{formatPrice(order.total)}</span>
                    <span className="text-slate-500">{new Date(order.created_at).toLocaleString()}</span>
                  </div>
                </div>
                {Array.isArray(order.items) && order.items.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {order.items.slice(0, 4).map((item) => (
                      <span key={item.id} className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
                        {item.sku ? `${item.sku} â€¢ ` : ''}{item.name || 'Item'} x{item.quantity}
                      </span>
                    ))}
                  </div>
                ) : null}
                {editingOrderId === order.id && editForm ? (
                  <div className="mt-4 grid gap-3 rounded-2xl border border-primary/10 bg-white p-4 md:grid-cols-2">
                    <input
                      value={editForm.customerName}
                      onChange={(event) => setEditForm((current) => (current ? { ...current, customerName: event.target.value } : current))}
                      placeholder="Customer name"
                      className="rounded-xl bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <input
                      value={editForm.customerPhone}
                      onChange={(event) => setEditForm((current) => (current ? { ...current, customerPhone: event.target.value } : current))}
                      placeholder="Phone"
                      className="rounded-xl bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <input
                      value={editForm.customerCity}
                      onChange={(event) => setEditForm((current) => (current ? { ...current, customerCity: event.target.value } : current))}
                      placeholder="City"
                      className="rounded-xl bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <select
                      value={editForm.paymentMethod}
                      onChange={(event) => setEditForm((current) => (current ? { ...current, paymentMethod: event.target.value } : current))}
                      className="rounded-xl bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {visiblePaymentOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <textarea
                      value={editForm.customerAddress}
                      onChange={(event) => setEditForm((current) => (current ? { ...current, customerAddress: event.target.value } : current))}
                      placeholder="Full customer address"
                      rows={3}
                      className="rounded-xl bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20 md:col-span-2"
                    />
                    <textarea
                      value={editForm.note}
                      onChange={(event) => setEditForm((current) => (current ? { ...current, note: event.target.value } : current))}
                      placeholder="Delivery note"
                      rows={2}
                      className="rounded-xl bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20 md:col-span-2"
                    />
                    <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                      <button
                        type="button"
                        onClick={() => void handleUpdateManualOrder(order.id)}
                        disabled={savingOrderId === order.id}
                        className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                      >
                        {savingOrderId === order.id ? 'Saving...' : 'Save changes'}
                      </button>
                      <button
                        type="button"
                        onClick={stopEditingOrder}
                        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="mt-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      to={
                        mode === 'seller'
                          ? `/seller/orders?search=${encodeURIComponent(order.order_code || order.id)}`
                          : `/reseller-dashboard/overview`
                      }
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      Open order context
                    </Link>
                    {canManageRecentOrder(order.status) ? (
                      <>
                        <button
                          type="button"
                          onClick={() => startEditingOrder(order)}
                          className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700 transition hover:text-slate-950"
                        >
                          <Pencil size={14} />
                          <span>Edit</span>
                        </button>
                        {cancelConfirmId === order.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleCancelManualOrder(order.id)}
                              disabled={savingOrderId === order.id}
                              className="inline-flex items-center gap-1 text-sm font-semibold text-rose-600 transition hover:text-rose-700 disabled:opacity-50"
                            >
                              <XCircle size={14} />
                              <span>{savingOrderId === order.id ? 'Cancelling...' : 'Confirm cancel'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setCancelConfirmId('')}
                              className="text-sm font-semibold text-slate-500 transition hover:text-slate-700"
                            >
                              Keep order
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingOrderId('');
                              setEditForm(null);
                              setCancelConfirmId(order.id);
                            }}
                            className="text-sm font-semibold text-rose-600 transition hover:text-rose-700"
                          >
                            Cancel order
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="text-xs font-semibold text-slate-400">Locked after courier progress or completion</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            </div>
          </div>
        )}
      </div>
    </div>
    </div>
  );
};

export default ManualOrderWorkspace;



