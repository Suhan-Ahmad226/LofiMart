import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from '@/src/lib/navigation';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Loader2,
  LockKeyhole,
  MapPin,
  Phone,
  Plus,
  ShieldCheck,
  Store,
  Truck,
  User,
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useUser } from '../context/UserContext';
import {
  DEFAULT_ENABLED_CHECKOUT_PAYMENT_METHODS,
  isKnownCheckoutPaymentMethod,
} from '../lib/commerce-channels';
import { formatPrice, cn } from '../lib/utils';
import { Skeleton } from '../components/ui/Skeleton';
import { FormNotice } from '../components/ui/FeedbackState';
import { buildBangladeshAddressLine, getDistrictOptions, getDivisionOptions, getUpazilaOptions } from '../lib/bangladesh-address';

type PaymentMethod = 'cod' | 'bkash' | 'bank' | 'gateway';
type PaymentStep = 'number' | 'otp' | 'pin' | 'success';

type PaymentOption = {
  value: PaymentMethod;
  title: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
};

type ShippingPreview = {
  estimated_fee: number;
  estimated_fee_payable: number;
  estimated_eta: string;
  free_shipping_threshold: number;
  qualifies_for_free_shipping: boolean;
  checkout_note: string;
  zone: string;
  cod_available: boolean;
  warehouse_rule_applied?: boolean;
  warehouse_name?: string | null;
  shipment_breakdown?: Array<{
    warehouse_id: string | null;
    warehouse_name: string;
    item_count: number;
    estimated_fee: number;
    estimated_fee_payable: number;
    estimated_eta: string;
    warehouse_rule_applied: boolean;
  }>;
};

type SavedAddress = {
  id: string;
  label?: string | null;
  name: string;
  phone: string;
  alternate_phone?: string | null;
  address: string;
  division?: string | null;
  district?: string | null;
  upazila?: string | null;
  house?: string | null;
  road?: string | null;
  village?: string | null;
  city: string;
  state?: string | null;
  postal_code?: string | null;
  is_default?: number;
};

function buildCheckoutAddressSummary(address: {
  upazila?: string;
  district?: string;
  division?: string;
  address?: string;
}) {
  return buildBangladeshAddressLine(address);
}

const allPaymentOptions: PaymentOption[] = [
  {
    value: 'cod',
    title: 'Cash on delivery',
    description: 'Pay when the order reaches your door.',
    icon: <Truck size={18} />,
    accent: 'from-emerald-500/20 to-cyan-500/10',
  },
  {
    value: 'bkash',
    title: 'bKash / Nagad',
    description: 'Fast mobile payment with OTP confirmation.',
    icon: <Phone size={18} />,
    accent: 'from-rose-500/20 to-orange-500/10',
  },
  {
    value: 'bank',
    title: 'Bank transfer',
    description: 'Direct transfer for business or planned purchases.',
    icon: <Store size={18} />,
    accent: 'from-sky-500/20 to-indigo-500/10',
  },
  {
    value: 'gateway',
    title: 'Online gateway',
    description: 'Cards and supported digital payment channels.',
    icon: <CreditCard size={18} />,
    accent: 'from-violet-500/20 to-fuchsia-500/10',
  },
];

function CheckoutSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-12">
      <div className="space-y-8">
        <div className="space-y-3">
          <Skeleton className="h-4 w-28 rounded-full" />
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-5 w-full max-w-2xl" />
        </div>
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <Skeleton className="h-[360px] w-full rounded-[1.75rem]" />
            <Skeleton className="h-[300px] w-full rounded-[1.75rem]" />
          </div>
          <div className="space-y-5">
            <Skeleton className="h-[420px] w-full rounded-[1.75rem]" />
          </div>
        </div>
      </div>
    </div>
  );
}

export const CheckoutPage = () => {
  const { items, subtotal, totalPrice, discountAmount, appliedCoupon, clearCart, isReady: isCartReady } = useCart();
  const { user, token, isAuthenticated, isReady } = useUser();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recoveryHint, setRecoveryHint] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentStep, setPaymentStep] = useState<PaymentStep>('number');
  const [paymentData, setPaymentData] = useState({ number: '', otp: '', pin: '' });
  const [hasPlacedOrder, setHasPlacedOrder] = useState(false);
  const [shippingPreview, setShippingPreview] = useState<ShippingPreview | null>(null);
  const [shippingPreviewLoading, setShippingPreviewLoading] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [showInlineAddressForm, setShowInlineAddressForm] = useState(false);
  const [saveAddressToAccount, setSaveAddressToAccount] = useState(false);
  const [enabledPaymentMethods, setEnabledPaymentMethods] = useState<string[]>([...DEFAULT_ENABLED_CHECKOUT_PAYMENT_METHODS]);

  const [formData, setFormData] = useState({
    fullName: user?.name || '',
    email: user?.email || '',
    phone: '',
    alternatePhone: user?.alternate_phone || '',
    division: 'Dhaka',
    district: '',
    upazila: '',
    house: '',
    road: '',
    village: '',
    address: '',
    city: 'Dhaka',
    paymentMethod: DEFAULT_ENABLED_CHECKOUT_PAYMENT_METHODS[0] as PaymentMethod,
  });

  useEffect(() => {
    if (!isReady || !isCartReady || hasPlacedOrder) {
      return;
    }

    if (items.length === 0) {
      navigate('/cart');
      return;
    }

    if (!isAuthenticated) {
      navigate('/login?redirect=/checkout');
    }
  }, [hasPlacedOrder, isAuthenticated, isCartReady, isReady, items.length, navigate]);

  useEffect(() => {
    setFormData((current) => ({
      ...current,
      fullName: user?.name || current.fullName,
      email: user?.email || current.email,
      alternatePhone: user?.alternate_phone || current.alternatePhone,
    }));
  }, [user?.alternate_phone, user?.email, user?.name]);

  useEffect(() => {
    fetch('/api/public/commerce-config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!Array.isArray(data?.enabled_checkout_payment_methods)) return;
        const nextMethods = data.enabled_checkout_payment_methods.filter((value: unknown): value is string =>
          isKnownCheckoutPaymentMethod(typeof value === 'string' ? value : ''),
        );
        if (nextMethods.length === 0) return;
        setEnabledPaymentMethods(nextMethods);
        setFormData((current) => ({
          ...current,
          paymentMethod: nextMethods.includes(current.paymentMethod) ? current.paymentMethod : (nextMethods[0] as PaymentMethod),
        }));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!token || !isAuthenticated) {
      setSavedAddresses([]);
      setSelectedAddressId('');
      return;
    }

    let ignore = false;

    const loadAddresses = async () => {
      try {
        const response = await fetch('/api/addresses', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load saved addresses');
        }
        if (ignore || !Array.isArray(payload)) return;
        setSavedAddresses(payload);
        const defaultAddress = payload.find((address: SavedAddress) => Number(address.is_default) === 1) || payload[0];
        if (defaultAddress) {
          setSelectedAddressId(defaultAddress.id);
          setFormData((current) => ({
            ...current,
            fullName: current.fullName || defaultAddress.name || '',
            phone: current.phone || defaultAddress.phone || '',
            alternatePhone: current.alternatePhone || defaultAddress.alternate_phone || '',
            division: defaultAddress.division || defaultAddress.state || current.division || 'Dhaka',
            district: defaultAddress.district || defaultAddress.city || current.district || '',
            upazila: defaultAddress.upazila || current.upazila || '',
            house: defaultAddress.house || current.house || '',
            road: defaultAddress.road || current.road || '',
            village: defaultAddress.village || current.village || '',
            address: current.address || defaultAddress.address || '',
            city: defaultAddress.city || current.city || 'Dhaka',
          }));
        }
      } catch {
        if (!ignore) {
          setSavedAddresses([]);
        }
      }
    };

    void loadAddresses();
    return () => {
      ignore = true;
    };
  }, [isAuthenticated, token]);

  const itemCount = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);
  const paymentOptions = useMemo(
    () => allPaymentOptions.filter((option) => enabledPaymentMethods.includes(option.value)),
    [enabledPaymentMethods],
  );
  const divisionOptions = useMemo(() => getDivisionOptions(), []);
  const districtOptions = useMemo(() => getDistrictOptions(formData.division), [formData.division]);
  const upazilaOptions = useMemo(
    () => getUpazilaOptions(formData.division, formData.district || formData.city),
    [formData.city, formData.district, formData.division],
  );
  const selectedPayment = paymentOptions.find((option) => option.value === formData.paymentMethod) ?? paymentOptions[0];
  const hasShippingPreviewInputs = useMemo(() => {
    const normalizedPhone = formData.phone.replace(/\D/g, '');
    const composedAddress = buildCheckoutAddressSummary({
      upazila: formData.upazila,
      district: formData.district || formData.city,
      division: formData.division,
      address: formData.address,
    });
    return formData.district.trim().length > 0 && composedAddress.length >= 10 && normalizedPhone.length >= 11 && itemCount > 0;
  }, [formData.address, formData.city, formData.district, formData.division, formData.house, formData.phone, formData.road, formData.upazila, formData.village, itemCount]);

  useEffect(() => {
    if (!hasShippingPreviewInputs) {
      setShippingPreview(null);
      setShippingPreviewLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setShippingPreviewLoading(true);
        const response = await fetch('/api/shipping/preview', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            city: formData.district || formData.city,
            subtotal,
            itemCount,
            items: items.map((item) => ({
              id: item.id,
              quantity: item.quantity,
            })),
          }),
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to estimate delivery');
        }
        setShippingPreview(payload);
      } catch (requestError) {
        if ((requestError as Error).name !== 'AbortError') {
          setShippingPreview(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setShippingPreviewLoading(false);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [formData.city, hasShippingPreviewInputs, itemCount, subtotal]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddressSelect = (addressId: string) => {
    setSelectedAddressId(addressId);
    const selectedAddress = savedAddresses.find((address) => address.id === addressId);
    if (!selectedAddress) return;

    setFormData((current) => ({
      ...current,
      fullName: selectedAddress.name || current.fullName,
      phone: selectedAddress.phone || current.phone,
      alternatePhone: selectedAddress.alternate_phone || current.alternatePhone,
      division: selectedAddress.division || selectedAddress.state || current.division,
      district: selectedAddress.district || selectedAddress.city || current.district,
      upazila: selectedAddress.upazila || current.upazila,
      house: selectedAddress.house || current.house,
      road: selectedAddress.road || current.road,
      village: selectedAddress.village || current.village,
      address: selectedAddress.address || current.address,
      city: selectedAddress.city || current.city,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setRecoveryHint('');

    if (!enabledPaymentMethods.includes(formData.paymentMethod)) {
      setError('This payment method is temporarily unavailable right now. Please use Cash on delivery.');
      return;
    }

    await processOrder();
  };

  const processOrder = async () => {
    setLoading(true);
    try {
      if (saveAddressToAccount && !selectedAddressId) {
      const addressSummary = buildCheckoutAddressSummary({
          upazila: formData.upazila,
          district: formData.district || formData.city,
          division: formData.division,
          address: formData.address,
        });
        const saveAddressResponse = await fetch('/api/addresses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            type: 'shipping',
            name: formData.fullName,
            phone: formData.phone,
            alternate_phone: formData.alternatePhone,
            division: formData.division,
            district: formData.district || formData.city,
            upazila: formData.upazila,
            house: formData.house,
            road: formData.road,
            village: formData.village,
            address: addressSummary,
            line2: formData.upazila,
            city: formData.district || formData.city,
            state: formData.division,
            country: 'Bangladesh',
            is_default: savedAddresses.length === 0,
          }),
        });
        const saveAddressPayload = await saveAddressResponse.json().catch(() => null);
        if (!saveAddressResponse.ok) {
          throw new Error(saveAddressPayload?.error || 'Failed to save delivery address');
        }
        if (saveAddressPayload?.id) {
          setSelectedAddressId(String(saveAddressPayload.id));
        }
      }

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          total: totalPrice,
          couponCode: appliedCoupon?.code || undefined,
          paymentMethod: formData.paymentMethod,
          fullAddressSummary: buildCheckoutAddressSummary({
            upazila: formData.upazila,
            district: formData.district || formData.city,
            division: formData.division,
            address: formData.address,
          }),
          shippingAddress: {
            fullName: formData.fullName,
            phone: formData.phone,
            secondaryPhone: formData.alternatePhone || undefined,
            email: formData.email,
            division: formData.division,
            district: formData.district || formData.city,
            upazila: formData.upazila,
            house: formData.house,
            road: formData.road,
            village: formData.village,
            address: buildCheckoutAddressSummary({
              upazila: formData.upazila,
              district: formData.district || formData.city,
              division: formData.division,
              address: formData.address,
            }),
            city: formData.district || formData.city,
          },
          items: items.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            price: item.price,
          })),
          refCode: localStorage.getItem('ref_code') || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to place order');
      }

      setHasPlacedOrder(true);
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(
          'amarshop_recent_order',
          JSON.stringify({
            orderId: data.orderId,
            total: totalPrice,
            placedAt: new Date().toISOString(),
          }),
        );
      }
      if (saveAddressToAccount && !selectedAddressId) {
        const refreshedAddresses = await fetch('/api/addresses', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const refreshedPayload = await refreshedAddresses.json().catch(() => null);
        if (refreshedAddresses.ok && Array.isArray(refreshedPayload)) {
          setSavedAddresses(refreshedPayload);
        }
      }
      clearCart();
      navigate(`/order-success?orderId=${encodeURIComponent(String(data.orderId))}`);
    } catch (err: any) {
      setError(err.message || 'Failed to place order.');
      setRecoveryHint('Please review your delivery details and try again. If the problem continues, contact support from the help page.');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSubmit = async () => {
    if (paymentStep === 'number') {
      setPaymentStep('otp');
      return;
    }

    if (paymentStep === 'otp') {
      setPaymentStep('pin');
      return;
    }

    if (paymentStep === 'pin') {
      setPaymentStep('success');
      setTimeout(() => {
        setShowPaymentModal(false);
        void processOrder();
      }, 1600);
    }
  };

  if (!isReady || !isCartReady) {
    return <CheckoutSkeleton />;
  }

  if (!hasPlacedOrder && (items.length === 0 || !isAuthenticated)) {
    return <CheckoutSkeleton />;
  }

  return (
    <div className="bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_42%,#f8fafc_100%)]">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-12">
        <div className="space-y-8">
          <section className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-xl shadow-slate-200/45">
            <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                  <LockKeyhole size={14} />
                  Secure checkout
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <span>Cart</span>
                    <ChevronRight size={14} />
                    <span className="font-semibold text-slate-900">Checkout</span>
                    <ChevronRight size={14} />
                    <span>Confirmation</span>
                  </div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl font-display">
                    Complete your order with confidence
                  </h1>
                  <p className="max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                    Review your delivery details, choose the payment method that fits best, and place your order through a smoother production-ready checkout flow.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
                    <Truck size={16} className="text-primary" />
                    {shippingPreview?.estimated_eta ? `Delivery in ${shippingPreview.estimated_eta}` : 'Delivery in 2-4 business days'}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
                    <ShieldCheck size={16} className="text-primary" />
                    Protected payment flow
                  </span>
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5 sm:p-6">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Items</p>
                    <p className="mt-2 text-xl font-bold text-slate-950">{itemCount}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Subtotal</p>
                    <p className="mt-2 text-xl font-bold text-slate-950">{formatPrice(subtotal)}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Pay now</p>
                    <p className="mt-2 text-xl font-bold text-primary">{formatPrice(totalPrice)}</p>
                  </div>
                </div>
                <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-white p-4">
                  <div className="flex items-start gap-3">
                    <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${selectedPayment.accent} text-slate-700 ring-1 ring-black/5`}>
                      {selectedPayment.icon}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Selected payment</p>
                      <p className="mt-1 text-sm text-slate-600">{selectedPayment.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{selectedPayment.description}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 rounded-[1.5rem] border border-slate-200 bg-white p-4">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      {shippingPreviewLoading ? <Loader2 size={18} className="animate-spin" /> : <Truck size={18} />}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Estimated delivery preview</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {shippingPreview
                          ? shippingPreview.qualifies_for_free_shipping
                            ? `Free delivery unlocked for ${formData.city}. Estimated arrival: ${shippingPreview.estimated_eta}.`
                            : `Estimated fee ${formatPrice(shippingPreview.estimated_fee_payable)} for ${formData.city}. Estimated arrival: ${shippingPreview.estimated_eta}.`
                          : 'Choose your city to preview delivery fee and ETA.'}
                      </p>
                      {shippingPreview?.checkout_note ? (
                        <p className="mt-1 text-xs text-slate-500">{shippingPreview.checkout_note}</p>
                      ) : null}
                      {shippingPreview?.shipment_breakdown && shippingPreview.shipment_breakdown.length > 1 ? (
                        <div className="mt-3 space-y-2">
                          {shippingPreview.shipment_breakdown.map((shipment, index) => (
                            <div key={`${shipment.warehouse_id || 'warehouse'}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-semibold text-slate-800">{shipment.warehouse_name}</span>
                                <span>{shipment.item_count} item{shipment.item_count > 1 ? 's' : ''}</span>
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                                <span>ETA: {shipment.estimated_eta}</span>
                                <span>Fee: {formatPrice(shipment.estimated_fee_payable)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {error ? (
            <div className="space-y-3">
              <FormNotice tone="error">{error}</FormNotice>
              {recoveryHint ? (
                <FormNotice tone="info">
                  <div className="space-y-2">
                    <p>{recoveryHint}</p>
                    <Link
                      to={`/contact?subject=${encodeURIComponent('Checkout Support')}&message=${encodeURIComponent(
                        `I need help with checkout. City: ${formData.city}. Payment method: ${formData.paymentMethod}.`,
                      )}`}
                      className="inline-flex text-xs font-semibold underline-offset-4 hover:underline"
                    >
                      Contact support about this checkout
                    </Link>
                  </div>
                </FormNotice>
              ) : null}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-6">
              <section className="rounded-[1.75rem] border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <MapPin size={20} />
                  </span>
                  <div>
                    <h2 className="text-xl font-bold text-slate-950">Shipping information</h2>
                    <p className="mt-1 text-sm text-slate-500">Use accurate contact and delivery details for faster confirmation.</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {savedAddresses.length > 0 ? (
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-sm font-medium text-slate-700">Saved delivery address</label>
                      <select
                        value={selectedAddressId}
                        onChange={(event) => handleAddressSelect(event.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10"
                      >
                        <option value="">Choose a saved address</option>
                        {savedAddresses.map((address) => (
                          <option key={address.id} value={address.id}>
                            {(address.label || 'Saved address')} - {address.city} - {address.address}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <div className="md:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Address options</p>
                        <p className="text-xs text-slate-500">
                          Use a saved address or keep this order address for your next checkout.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowInlineAddressForm((current) => !current)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        <Plus size={14} />
                        <span>{showInlineAddressForm ? 'Hide quick add' : 'Quick add address'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Full name</label>
                    <div className="relative">
                      <User size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        name="fullName"
                        required
                        value={formData.fullName}
                        onChange={handleInputChange}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10"
                        placeholder="Enter your full name"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Phone number</label>
                    <div className="relative">
                      <Phone size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="tel"
                        name="phone"
                        required
                        value={formData.phone}
                        onChange={handleInputChange}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10"
                        placeholder="01XXXXXXXXX"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Alternative mobile</label>
                    <div className="relative">
                      <Phone size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="tel"
                        name="alternatePhone"
                        value={formData.alternatePhone}
                        onChange={handleInputChange}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10"
                        placeholder="Alternative mobile number"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-slate-700">Email address</label>
                    <input
                      type="email"
                      name="email"
                      required
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10"
                      placeholder="your@email.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Division</label>
                    <select
                      name="division"
                      value={formData.division}
                      onChange={(event) =>
                        setFormData((current) => ({
                          ...current,
                          division: event.target.value,
                          district: '',
                          city: '',
                          upazila: '',
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10"
                    >
                      {divisionOptions.map((division) => (
                        <option key={division} value={division}>
                          {division}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">District</label>
                    <select
                      name="district"
                      required
                      value={formData.district}
                      onChange={(event) =>
                        setFormData((current) => ({
                          ...current,
                          district: event.target.value,
                          city: event.target.value,
                          upazila: '',
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10"
                    >
                      <option value="">Select district</option>
                      {districtOptions.map((district) => (
                        <option key={district} value={district}>
                          {district}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Upazila / Thana</label>
                    <select
                      name="upazila"
                      required
                      value={formData.upazila}
                      onChange={handleInputChange}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10"
                    >
                      <option value="">Select upazila / thana</option>
                      {upazilaOptions.map((upazila) => (
                        <option key={upazila} value={upazila}>
                          {upazila}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-slate-700">Address details</label>
                    <textarea
                      name="address"
                      rows={3}
                      value={formData.address}
                      onChange={handleInputChange}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10"
                      placeholder="House / holding / road / village / landmark"
                    />
                    <p className="text-xs text-slate-500">
                      Checkout will automatically combine your address details with upazila, district, and division for delivery.
                    </p>
                  </div>

                  <div className="space-y-3 md:col-span-2">
                    <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={saveAddressToAccount}
                        onChange={(event) => setSaveAddressToAccount(event.target.checked)}
                        className="mt-1 rounded border-slate-300 text-primary focus:ring-primary"
                      />
                      <span>
                        Save this delivery profile to my account for faster checkout next time.
                      </span>
                    </label>
                  </div>

                  {showInlineAddressForm ? (
                    <div className="md:col-span-2 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
                      This quick-add form uses the main shipping fields above. Fill the address once, turn on "Save this delivery address", and your checkout address will be stored automatically after order placement.
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="rounded-[1.75rem] border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <CreditCard size={20} />
                  </span>
                  <div>
                    <h2 className="text-xl font-bold text-slate-950">Payment method</h2>
                    <p className="mt-1 text-sm text-slate-500">Choose the most comfortable payment option for this order.</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {paymentOptions.map((option) => {
                    const active = formData.paymentMethod === option.value;

                    return (
                      <label
                        key={option.value}
                        className={cn(
                          'relative cursor-pointer rounded-[1.5rem] border p-4 transition-all',
                          active
                            ? 'border-primary/30 bg-primary/5 shadow-sm shadow-primary/10'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                        )}
                      >
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={option.value}
                          checked={active}
                          onChange={handleInputChange}
                          className="sr-only"
                        />
                        <div className="flex items-start gap-3">
                          <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${option.accent} text-slate-700 ring-1 ring-black/5`}>
                            {option.icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-semibold text-slate-950">{option.title}</p>
                              <span className={cn('h-5 w-5 rounded-full border-2', active ? 'border-primary bg-primary' : 'border-slate-300')}>
                                <span className={cn('mx-auto mt-[3px] block h-2 w-2 rounded-full bg-white', !active && 'hidden')} />
                              </span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-slate-500">{option.description}</p>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </section>
            </div>

            <aside className="space-y-5">
              <div className="rounded-[1.75rem] border border-slate-200/80 bg-white p-6 shadow-sm sm:p-7 xl:sticky xl:top-24">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <h3 className="text-xl font-bold text-slate-950">Order summary</h3>
                  <Link
                    to="/cart"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition hover:text-primary/80"
                  >
                    <span>Edit order</span>
                    <ChevronRight size={16} />
                  </Link>
                </div>

                <div className="mt-5 max-h-72 space-y-4 overflow-y-auto pr-1">
                  {items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3">
                      <img
                        src={item.image}
                        className="h-14 w-14 rounded-xl bg-slate-100 object-cover"
                        alt={item.name}
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-950">{item.name}</p>
                        <p className="text-xs text-slate-500">
                          {item.quantity} x {formatPrice(item.price)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-slate-900">{formatPrice(item.price * item.quantity)}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start gap-3">
                    <Truck size={18} className="mt-0.5 shrink-0 text-primary" />
                    <div className="text-sm text-slate-600">
                      <p className="font-semibold text-slate-900">Delivery preview</p>
                      <p className="mt-1 leading-6">
                        {shippingPreview
                          ? shippingPreview.qualifies_for_free_shipping
                            ? `Free delivery unlocked. Expected arrival in ${shippingPreview.estimated_eta}.`
                            : `Estimated delivery fee ${formatPrice(shippingPreview.estimated_fee_payable)} with arrival in ${shippingPreview.estimated_eta}.`
                          : 'Enter a city to preview delivery fee and timing.'}
                      </p>
                      {shippingPreview?.shipment_breakdown && shippingPreview.shipment_breakdown.length > 1 ? (
                        <div className="mt-3 space-y-2">
                          {shippingPreview.shipment_breakdown.map((shipment, index) => (
                            <div key={`${shipment.warehouse_id || 'summary'}-${index}`} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-semibold text-slate-800">{shipment.warehouse_name}</span>
                                <span>{shipment.item_count} item{shipment.item_count > 1 ? 's' : ''}</span>
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                                <span>ETA: {shipment.estimated_eta}</span>
                                <span>Fee: {formatPrice(shipment.estimated_fee_payable)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="mt-6 space-y-3 border-t border-slate-100 pt-4">
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Subtotal</span>
                    <span className="font-medium text-slate-900">{formatPrice(subtotal)}</span>
                  </div>
                  {appliedCoupon && (
                    <div className="flex justify-between text-sm font-medium text-emerald-600">
                      <span>Discount ({appliedCoupon.code})</span>
                      <span>-{formatPrice(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Estimated shipping</span>
                    <span className="font-medium text-primary">
                      {shippingPreview
                        ? shippingPreview.qualifies_for_free_shipping
                          ? 'Free'
                          : formatPrice(shippingPreview.estimated_fee_payable)
                        : 'Add city'}
                    </span>
                  </div>
                  <div className="flex justify-between pt-4 text-slate-950">
                    <span className="text-lg font-bold">Total</span>
                    <span className="text-2xl font-bold text-primary">{formatPrice(totalPrice)}</span>
                  </div>
                  {shippingPreview && !shippingPreview.qualifies_for_free_shipping ? (
                    <p className="text-xs leading-5 text-slate-500">
                      Checkout total stays {formatPrice(totalPrice)} for now. The estimated delivery fee is shown for planning and courier assignment.
                    </p>
                  ) : null}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      <span>Placing order...</span>
                    </>
                  ) : (
                    <>
                      <span>Place order</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start gap-3">
                    <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
                    <div className="text-sm text-slate-600">
                      <p className="font-semibold text-slate-900">Secure checkout guaranteed</p>
                      <p className="mt-1 leading-6">Your order data, payment selection, and delivery details stay protected through confirmation.</p>
                    </div>
                  </div>
                </div>

                {(formData.paymentMethod === 'gateway' || formData.paymentMethod === 'bkash') && (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
                      <div className="text-sm text-amber-800">
                        <p className="font-semibold">Payment recovery tip</p>
                        <p className="mt-1 leading-6">
                          If verification fails or the payment app closes early, your cart will stay intact. You can retry checkout here or switch to Cash on delivery before placing the order.
                        </p>
                        <Link
                          to={`/contact?subject=${encodeURIComponent('Payment Support')}&message=${encodeURIComponent(
                            `I need help with a checkout payment issue. Payment method: ${formData.paymentMethod}.`,
                          )}`}
                          className="mt-3 inline-flex text-sm font-semibold text-amber-800 underline-offset-4 hover:underline"
                        >
                          Contact support about payment issues
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </form>
        </div>
      </div>
      <div className="fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 md:hidden">
        <div className="rounded-[1.5rem] border border-slate-200/80 bg-white/96 p-3 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Pay now</p>
              <p className="text-lg font-bold text-slate-950">{formatPrice(totalPrice)}</p>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                const form = document.querySelector('form') as HTMLFormElement | null;
                form?.requestSubmit();
              }}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 className="animate-spin" size={16} /> : null}
              <span>{loading ? 'Placing...' : 'Place order'}</span>
            </button>
          </div>
        </div>
      </div>

      {showPaymentModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-[2rem] bg-[#D12053] shadow-2xl">
            <div className="space-y-6 p-8 text-center text-white">
              <div className="flex justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white p-4">
                  <img
                    src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Bkash_logo.png/1200px-Bkash_logo.png"
                    alt="bKash"
                    className="w-full object-contain"
                  />
                </div>
              </div>

              {paymentStep === 'number' && (
                <div className="space-y-5">
                  <h3 className="text-xl font-bold">Enter payment number</h3>
                  <p className="text-sm text-white/75">
                    Use the number linked to your payment app. You can cancel and return to checkout if you want to switch methods.
                  </p>
                  <input
                    type="tel"
                    placeholder="01XXXXXXXXX"
                    className="w-full rounded-2xl border-2 border-white/20 bg-white/10 px-6 py-4 text-center text-2xl font-bold text-white placeholder:text-white/50 outline-none focus:border-white"
                    value={paymentData.number}
                    onChange={(e) => setPaymentData({ ...paymentData, number: e.target.value })}
                  />
                  <button onClick={handlePaymentSubmit} className="w-full rounded-2xl bg-white py-4 text-lg font-bold text-[#D12053] transition hover:bg-gray-100">
                    Next
                  </button>
                </div>
              )}

              {paymentStep === 'otp' && (
                <div className="space-y-5">
                  <h3 className="text-xl font-bold">Enter OTP</h3>
                  <p className="text-sm text-white/75">A 6-digit verification code has been sent to {paymentData.number}</p>
                  <input
                    type="text"
                    placeholder="XXXXXX"
                    className="w-full rounded-2xl border-2 border-white/20 bg-white/10 px-6 py-4 text-center text-2xl font-bold text-white placeholder:text-white/50 outline-none focus:border-white"
                    value={paymentData.otp}
                    onChange={(e) => setPaymentData({ ...paymentData, otp: e.target.value })}
                  />
                  <button onClick={handlePaymentSubmit} className="w-full rounded-2xl bg-white py-4 text-lg font-bold text-[#D12053] transition hover:bg-gray-100">
                    Verify OTP
                  </button>
                </div>
              )}

              {paymentStep === 'pin' && (
                <div className="space-y-5">
                  <h3 className="text-xl font-bold">Enter PIN</h3>
                  <input
                    type="password"
                    placeholder="XXXXX"
                    className="w-full rounded-2xl border-2 border-white/20 bg-white/10 px-6 py-4 text-center text-2xl font-bold text-white placeholder:text-white/50 outline-none focus:border-white"
                    value={paymentData.pin}
                    onChange={(e) => setPaymentData({ ...paymentData, pin: e.target.value })}
                  />
                  <button onClick={handlePaymentSubmit} className="w-full rounded-2xl bg-white py-4 text-lg font-bold text-[#D12053] transition hover:bg-gray-100">
                    Confirm payment
                  </button>
                </div>
              )}

              {paymentStep === 'success' && (
                <div className="space-y-5 py-10">
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/20">
                    <CheckCircle2 className="h-10 w-10 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold">Payment successful</h3>
                  <p className="text-white/75">Finalizing your order and redirecting to confirmation...</p>
                </div>
              )}

              {paymentStep !== 'success' && (
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="text-sm text-white/65 transition hover:text-white"
                >
                  Cancel payment
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
