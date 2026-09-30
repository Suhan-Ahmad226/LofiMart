import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from '../../../lib/navigation';
import { AlertTriangle, CheckCircle, ChevronLeft, Clock, CreditCard, Download, ExternalLink, Loader2, MapPin, Package, RotateCcw, ScanLine, Truck } from 'lucide-react';
import toast from '@/lib/toast';
import { formatPrice } from '../../../lib/utils';
import OptimizedImage from '@/features/shared/ui/OptimizedImage';
import { useCart } from '../../../features/shop/state/CartContext';
import { useUser } from '../../../features/shared/state/UserContext';

export const CustomerOrderDetails = () => {
  const { id } = useParams();
  const { token } = useUser();
  const { replaceCart } = useCart();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlShipment = searchParams.get('shipment') || '';
  const urlReturn = searchParams.get('return') || '';
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [submittingReturn, setSubmittingReturn] = useState(false);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [editingOrder, setEditingOrder] = useState(false);
  const [focusedShipmentId, setFocusedShipmentId] = useState('');
  const [focusedReturnRequestId, setFocusedReturnRequestId] = useState('');

  const shipmentSteps = [
    { label: 'Placed', statuses: ['pending', 'processing', 'packed', 'ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned', 'cancelled'], icon: <Package size={16} /> },
    { label: 'Packed', statuses: ['packed', 'ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'], icon: <Clock size={16} /> },
    { label: 'Picked up', statuses: ['picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'], icon: <Truck size={16} /> },
    { label: 'Delivered', statuses: ['delivered'], icon: <CheckCircle size={16} /> },
  ];

  /**
   * The courier's last reported status, as a single line for the customer.
   *
   * Reads the generic `provider_status` column, not a Pathao-keyed metadata entry.
   * The old lookup read `shipment_metadata.pathaoLastEvent` / `pathaoLastStatusSlug`,
   * which the current sync path never writes, so it always rendered nothing — and it
   * named a specific courier in a component that also renders other couriers.
   */
  const getCourierEventSummary = (shipment: any) => {
    const providerStatus =
      typeof shipment?.provider_status === 'string' ? shipment.provider_status.trim() : '';
    if (!providerStatus) return null;

    return { event: providerStatus.replaceAll('_', ' ').replaceAll('.', ' ') };
  };

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        setError('');
        const response = await fetch(`/api/orders/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || 'Failed to fetch order');

        if (typeof data.shipping_address === 'string') {
          data.shippingAddress = JSON.parse(data.shipping_address);
        } else {
          data.shippingAddress = data.shipping_address;
        }

        setOrder(data);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch order');
        setOrder(null);
      } finally {
        setLoading(false);
      }
    };

    if (token && id) {
      fetchOrder();
    } else {
      setOrder(null);
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    if (urlShipment) {
      setFocusedShipmentId(urlShipment);
    }
    if (urlReturn) {
      setFocusedReturnRequestId(urlReturn);
    }
  }, [urlReturn, urlShipment]);

  useEffect(() => {
    if (!order || !focusedShipmentId || typeof window === 'undefined') return;

    const matched = Array.isArray(order.shipments)
      ? order.shipments.find((shipment: any) => shipment.id === focusedShipmentId)
      : null;

    if (!matched) return;

    window.requestAnimationFrame(() => {
      document.getElementById(`customer-order-shipment-${matched.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [order, focusedShipmentId]);

  useEffect(() => {
    if (!order?.return_request || !focusedReturnRequestId || typeof window === 'undefined') return;
    if (String(order.return_request.id) !== focusedReturnRequestId) return;

    window.requestAnimationFrame(() => {
      document.getElementById('customer-order-return-request')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [order, focusedReturnRequestId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-4 py-24 text-center">
        <p className="font-bold text-accent">{error || 'Order not found'}</p>
        <Link to="/account/orders" className="btn-primary inline-block px-8 py-2">
          Back to Orders
        </Link>
      </div>
    );
  }

  const canRequestReturn = ['delivered', 'returned'].includes(String(order.status));
  const canEditOrder = Boolean(order?.can_edit);
  const canCancelOrder = Boolean(order?.can_cancel);
  const customerActionBlockReason =
    typeof order?.customer_action_block_reason === 'string' ? order.customer_action_block_reason : '';

  const handleInvoiceDownload = async () => {
    try {
      setDownloadingInvoice(true);
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
    } finally {
      setDownloadingInvoice(false);
    }
  };

  const handleReturnRequest = async () => {
    if (!canRequestReturn) {
      toast.error('Return requests are available only after delivery.');
      return;
    }

    try {
      setSubmittingReturn(true);
      const response = await fetch(`/api/orders/${order.id}/return-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: returnReason }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to submit return request');
      }

      setOrder((current: any) => ({
        ...current,
        return_request: payload.request,
      }));
      setReturnReason('');
      toast.success('Return request submitted for review.');
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Failed to submit return request');
    } finally {
      setSubmittingReturn(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!canCancelOrder) {
      toast.error(customerActionBlockReason || 'This order can no longer be cancelled.');
      return;
    }

    try {
      setCancellingOrder(true);
      const response = await fetch(`/api/orders/${order.id}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to cancel order');
      }

      setOrder((current: any) => ({
        ...current,
        ...(payload?.order || {}),
      }));
      toast.success('Order cancelled successfully.');
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Failed to cancel order');
    } finally {
      setCancellingOrder(false);
    }
  };

  const handleEditOrder = async () => {
    if (!canEditOrder) {
      toast.error(customerActionBlockReason || 'This order can no longer be edited.');
      return;
    }

    try {
      setEditingOrder(true);
      const response = await fetch(`/api/orders/${order.id}/edit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to reopen order for editing');
      }

      if (!Array.isArray(payload?.cart_items) || payload.cart_items.length === 0) {
        throw new Error('This order could not be restored to your cart.');
      }

      replaceCart(payload.cart_items);
      toast.success('Order moved back to your cart for editing.');
      navigate('/cart');
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Failed to reopen order for editing');
    } finally {
      setEditingOrder(false);
    }
  };

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}
      <div className="flex items-center space-x-4">
        <Link to="/account/orders" className="rounded-full p-2 transition-colors hover:bg-gray-100">
          <ChevronLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Order Details</h1>
          <p className="text-sm text-gray-500">
            Order #{order.order_code || order.id} - Placed on {new Date(order.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <div className="space-y-8 rounded-2xl border border-black/5 bg-white p-8 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Order Status</h3>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
                {String(order.status).replaceAll('_', ' ')}
              </span>
            </div>
            <div className="relative flex justify-between">
              <div className="absolute left-0 right-0 top-4 -z-0 h-0.5 bg-gray-100" />
              {shipmentSteps.map((step) => (
                <div key={step.label} className="relative z-10 flex flex-col items-center space-y-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full ${step.statuses.includes(order.status) ? 'bg-primary text-white' : 'border-2 border-gray-100 bg-white text-gray-300'}`}>
                    {step.icon}
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${step.statuses.includes(order.status) ? 'text-gray-900' : 'text-gray-400'}`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-900">Need to change this order?</p>
                  <p className="text-sm text-slate-600">
                    You can edit or cancel until the seller accepts it and courier processing begins.
                  </p>
                  {!canEditOrder && customerActionBlockReason ? (
                    <p className="text-xs font-medium text-slate-500">{customerActionBlockReason}</p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    onClick={() => void handleEditOrder()}
                    disabled={!canEditOrder || editingOrder || cancellingOrder}
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {editingOrder ? <Loader2 size={16} className="animate-spin" /> : 'Edit order'}
                  </button>
                  <button
                    onClick={() => void handleCancelOrder()}
                    disabled={!canCancelOrder || cancellingOrder || editingOrder}
                    className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {cancellingOrder ? <Loader2 size={16} className="animate-spin" /> : 'Cancel order'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-black/5 bg-white p-8 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Courier & Tracking</h3>
              <Truck size={18} className="text-primary" />
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-gray-50 p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Courier provider</p>
                <p className="mt-2 text-sm font-bold text-gray-900">
                  {order.courier_provider || 'Will appear after pickup request'}
                </p>
              </div>
              <div className="rounded-2xl bg-gray-50 p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Tracking ID</p>
                <p className="mt-2 flex items-center gap-2 text-sm font-bold text-gray-900">
                  <ScanLine size={16} className="text-primary" />
                  {order.tracking_id || 'Pending assignment'}
                </p>
              </div>
            </div>

            {order.delivery_failure_reason ? (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">Delivery exception</p>
                    <p className="mt-1">{order.delivery_failure_reason}</p>
                    <Link
                      to={`/contact?subject=${encodeURIComponent('Delivery Support')}&message=${encodeURIComponent(
                        `I need help with delivery for order ${order.order_code || order.id}. Tracking ID: ${order.tracking_id || 'pending'}.`,
                      )}`}
                      className="mt-3 inline-flex text-sm font-semibold text-amber-800 underline-offset-4 hover:underline"
                    >
                      Contact support about this order
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}

            {Array.isArray(order.shipments) && order.shipments.length > 0 ? (
              <div className="mt-6 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Shipment breakdown</p>
                {order.shipments.map((shipment: any) => {
                  const courierEventSummary = getCourierEventSummary(shipment);

                  return (
                  <div
                    id={`customer-order-shipment-${shipment.id}`}
                    key={shipment.id}
                    className={`rounded-2xl border border-gray-100 bg-gray-50 p-4 ${
                      shipment.id === focusedShipmentId ? 'ring-2 ring-indigo-200 border-indigo-300 bg-indigo-50/40' : ''
                    }`}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-bold text-gray-900">Shipment #{String(shipment.id).slice(0, 8)}</p>
                        <p className="text-xs text-gray-500">
                          {shipment.warehouse_name || 'Seller pickup point'}
                          {shipment.warehouse_city ? ` • ${shipment.warehouse_city}` : ''}
                        </p>
                      </div>
                      <div className="text-sm font-semibold text-primary">
                        {String(shipment.status).replaceAll('_', ' ')}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3 text-xs text-gray-600">
                      <p>Courier: <span className="font-semibold text-gray-900">{shipment.courier_provider || 'Pending'}</span></p>
                      <p>Tracking: <span className="font-semibold text-gray-900">{shipment.tracking_id || 'Pending'}</span></p>
                      <p>Items: <span className="font-semibold text-gray-900">{shipment.item_count || 0}</span></p>
                    </div>
                    {courierEventSummary ? (
                      <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                        <span className="font-semibold">Courier update:</span>{' '}
                        {courierEventSummary.event}
                      </div>
                    ) : null}
                    <div className="mt-3 grid gap-2 text-xs text-gray-500 sm:grid-cols-2">
                      <div className="rounded-xl bg-white px-3 py-2">
                        Pickup requested: <span className="font-semibold text-gray-900">{shipment.pickup_requested_at ? new Date(shipment.pickup_requested_at).toLocaleString() : 'Pending'}</span>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2">
                        Picked up: <span className="font-semibold text-gray-900">{shipment.picked_up_at ? new Date(shipment.picked_up_at).toLocaleString() : 'Pending'}</span>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2">
                        Out for delivery: <span className="font-semibold text-gray-900">{shipment.out_for_delivery_at ? new Date(shipment.out_for_delivery_at).toLocaleString() : 'Pending'}</span>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2">
                        Delivered: <span className="font-semibold text-gray-900">{shipment.delivered_at ? new Date(shipment.delivered_at).toLocaleString() : 'Pending'}</span>
                      </div>
                    </div>
                    {Array.isArray(shipment.items) && shipment.items.length > 0 ? (
                      <div className="mt-3 rounded-2xl border border-gray-100 bg-white p-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Products in this shipment</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {shipment.items.map((item: any) => (
                            <span key={item.id} className="rounded-full bg-gray-50 px-3 py-1 text-xs text-gray-700">
                              {item.sku ? `${item.sku} • ` : ''}{item.name || 'Item'}{item.quantity ? ` x${item.quantity}` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {shipment.delivery_failure_reason ? (
                      <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                        Exception note: {shipment.delivery_failure_reason}
                      </div>
                    ) : null}
                  </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
            <div className="border-b border-gray-100 p-6">
              <h3 className="font-bold">Items in Order</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {order.items.map((item: any) => (
                <div key={item.id} className="flex items-center space-x-4 p-6">
                  <OptimizedImage src={item.image} alt={item.name} widthHint={128} heightHint={128} className="h-16 w-16 rounded-lg bg-gray-100 object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{item.name}</p>
                    {item.sku ? <p className="text-[11px] font-semibold text-slate-500">SKU: {item.sku}</p> : null}
                    {item.variant_summary ? <p className="text-[11px] font-medium text-primary">{item.variant_summary}</p> : null}
                    <p className="text-xs text-gray-500">
                      {item.quantity} x {formatPrice(item.price)}
                    </p>
                  </div>
                  <p className="text-sm font-bold">{formatPrice(item.price * item.quantity)}</p>
                </div>
              ))}
            </div>
            <div className="space-y-2 bg-gray-50 p-6">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-bold">{formatPrice(order.total)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Shipping</span>
                <span className="font-bold text-primary">Free</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 text-lg font-bold">
                <span>Total</span>
                <span className="text-primary">{formatPrice(order.total)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div
            id="customer-order-return-request"
            className={`space-y-4 rounded-2xl border border-black/5 bg-white p-6 shadow-sm ${
              order.return_request?.id && String(order.return_request.id) === focusedReturnRequestId
                ? 'ring-2 ring-indigo-200 border-indigo-300'
                : ''
            }`}
          >
            <h3 className="flex items-center space-x-2 font-bold">
              <MapPin size={18} className="text-primary" />
              <span>Shipping Address</span>
            </h3>
            <div className="space-y-1 text-sm text-gray-600">
              <p className="font-bold text-gray-900">{order.shippingAddress?.name}</p>
              <p>{order.shippingAddress?.phone}</p>
              <p>{order.shippingAddress?.address}</p>
              <p>{order.shippingAddress?.city}</p>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
            <h3 className="flex items-center space-x-2 font-bold">
              <CreditCard size={18} className="text-primary" />
              <span>Payment Method</span>
            </h3>
            <p className="text-sm font-bold text-gray-600">{order.payment_method}</p>
          </div>

          <button
            onClick={() => void handleInvoiceDownload()}
            disabled={downloadingInvoice}
            className="btn-primary flex w-full items-center justify-center gap-2 py-3 disabled:opacity-60"
          >
            {downloadingInvoice ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            <span>Download Invoice</span>
          </button>
          <Link
            to={`/account/orders/${order.id}/invoice`}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <ExternalLink size={18} />
            <span>Open Printable Invoice</span>
          </Link>

          <div className="space-y-4 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
            <h3 className="flex items-center gap-2 font-bold">
              <RotateCcw size={18} className="text-primary" />
              <span>Return Request</span>
            </h3>

            {order.return_request ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-semibold">Return request status: {String(order.return_request.status).replaceAll('_', ' ')}</p>
                <p className="mt-2">{order.return_request.reason}</p>
                {order.return_request.resolution_note ? (
                  <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-amber-900">
                    Team note: {order.return_request.resolution_note}
                  </p>
                ) : null}
              </div>
            ) : canRequestReturn ? (
              <>
                <p className="text-sm text-gray-500">
                  Received a damaged, incorrect, or unsuitable item? Submit a return request and the team will review it.
                </p>
                <textarea
                  rows={4}
                  value={returnReason}
                  onChange={(event) => setReturnReason(event.target.value)}
                  placeholder="Explain why you want to return this order"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10"
                />
                <button
                  onClick={() => void handleReturnRequest()}
                  disabled={submittingReturn || returnReason.trim().length < 10}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submittingReturn ? <Loader2 size={18} className="animate-spin" /> : <RotateCcw size={18} />}
                  <span>Submit Return Request</span>
                </button>
              </>
            ) : (
              <p className="text-sm text-gray-500">
                Return requests are available after the order is delivered.
              </p>
            )}
            <Link
              to={`/contact?subject=${encodeURIComponent('Order Support')}&message=${encodeURIComponent(
                `I need help with order ${order.order_code || order.id}. Current status: ${String(order.status).replaceAll('_', ' ')}.`,
              )}`}
              className="inline-flex text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              Contact support about this order
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

