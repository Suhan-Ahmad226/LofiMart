import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from '@/lib/navigation';
import {
  ArrowRight,
  ChevronRight,
  CreditCard,
  Home,
  Loader2,
  MapPin,
  Phone,
  ShieldCheck,
  Truck,
  User,
} from 'lucide-react';
import { useCart } from '@/features/shop/state/CartContext';
import { useUser } from '@/features/shared/state/UserContext';
import { useCommerceConfig } from '@/features/shared/state/CommerceConfigContext';
import {
  DEFAULT_ENABLED_CHECKOUT_PAYMENT_METHODS,
  isKnownCheckoutPaymentMethod,
  PLATFORM_FEE,
} from '@/lib/commerce-channels';
import { formatPrice, cn } from '@/lib/utils';
import { Skeleton } from '@/features/shared/ui/Skeleton';
import { FormNotice } from '@/features/shared/ui/FeedbackState';
import { buildBangladeshAddressLine, getDistrictOptions, getDivisionOptions, getUpazilaOptions } from '@/lib/bangladesh-address';

type PaymentMethod = 'cod';

type PaymentOption = {
  value: PaymentMethod;
  title: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
};

type CheckoutCoupon = {
  code: string;
  discount_type: 'percentage' | 'flat';
  discount_value: number;
  seller_id?: string | null;
  seller_name?: string | null;
};

type ShippingPreview = {
  estimated_fee: number;
  estimated_fee_payable: number;
  estimated_eta: string;
  free_shipping_threshold: number;
  qualifies_for_free_shipping: boolean;
  checkout_note: string;
  courier_price_verified?: boolean;
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
  const {
    items,
    subtotal,
    totalPrice,
    discountAmount,
    appliedCoupon,
    applyCoupon,
    removeCoupon,
    clearCart,
    isReady: isCartReady,
  } = useCart();
  const { user, token, isAuthenticated, isReady } = useUser();
  const commerceConfig = useCommerceConfig();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recoveryHint, setRecoveryHint] = useState('');
  const [couponCodeInput, setCouponCodeInput] = useState<string | null>(null);
  const [couponStatus, setCouponStatus] = useState('');
  const [couponStatusTone, setCouponStatusTone] = useState<'success' | 'error' | 'info'>('info');
  const [couponLoading, setCouponLoading] = useState(false);
  const [hasPlacedOrder, setHasPlacedOrder] = useState(false);
  const [shippingPreview, setShippingPreview] = useState<ShippingPreview | null>(null);
  const [shippingPreviewLoading, setShippingPreviewLoading] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [saveAddressToAccount, setSaveAddressToAccount] = useState(false);
  const [enabledPaymentMethods, setEnabledPaymentMethods] = useState<string[]>([...DEFAULT_ENABLED_CHECKOUT_PAYMENT_METHODS]);
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());
  const idempotencyKeyFingerprintRef = useRef<string | null>(null);

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

    // Guests are allowed through: checkout proceeds without an account and the
    // order can be claimed later once the contact OTP is verified.
  }, [hasPlacedOrder, isCartReady, isReady, items.length, navigate]);

  useEffect(() => {
    setFormData((current) => ({
      ...current,
      fullName: user?.name || current.fullName,
      email: user?.email || current.email,
      alternatePhone: user?.alternate_phone || current.alternatePhone,
    }));
  }, [user?.alternate_phone, user?.email, user?.name]);

  useEffect(() => {
    if (!Array.isArray(commerceConfig?.enabled_checkout_payment_methods)) return;
    const nextMethods = commerceConfig.enabled_checkout_payment_methods.filter((value: unknown): value is string =>
      isKnownCheckoutPaymentMethod(typeof value === 'string' ? value : ''),
    );
    if (nextMethods.length === 0) return;
    setEnabledPaymentMethods(nextMethods);
    setFormData((current) => ({
      ...current,
      paymentMethod: nextMethods.includes(current.paymentMethod) ? current.paymentMethod : (nextMethods[0] as PaymentMethod),
    }));
  }, [commerceConfig]);

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
  const couponCode = couponCodeInput ?? appliedCoupon?.code ?? '';
  const deliveryFee = shippingPreview?.estimated_fee_payable ?? 0;
  const checkoutTotal = totalPrice + PLATFORM_FEE + deliveryFee;
  const hasShippingPreviewInputs = useMemo(() => {
    const normalizedPhone = formData.phone.replace(/\D/g, '');
    const composedAddress = buildCheckoutAddressSummary({
      upazila: formData.upazila,
      district: formData.district || formData.city,
      division: formData.division,
      address: formData.address,
    });
    return formData.district.trim().length > 0 && composedAddress.length >= 10 && normalizedPhone.length >= 11 && itemCount > 0;
  }, [formData.address, formData.city, formData.district, formData.division, formData.phone, formData.upazila, itemCount]);

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
            zone: formData.upazila || undefined,
            codAmount: Math.max(0, totalPrice + PLATFORM_FEE),
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
  }, [formData.city, formData.district, formData.upazila, hasShippingPreviewInputs, itemCount, items, subtotal, totalPrice]);

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

    if (!hasShippingPreviewInputs) {
      setError('Please provide a complete phone number and delivery address so we can estimate delivery before placing the order.');
      return;
    }

    if (!shippingPreview) {
      setError('Delivery cost is still being estimated for this address. Please wait a moment and try again.');
      return;
    }
    if (shippingPreview.courier_price_verified === false) {
      setError('Live Pathao delivery pricing is unavailable for this address right now. Please try again in a moment.');
      return;
    }

    await processOrder();
  };

  const handleApplyCoupon = async () => {
    const nextCode = couponCode.trim();
    setCouponStatus('');

    if (!nextCode) {
      setCouponStatusTone('error');
      setCouponStatus('Enter a promo or coupon code.');
      return;
    }

    setCouponLoading(true);
    try {
      const response = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: nextCode,
          orderValue: subtotal,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Coupon could not be applied.');
      }

      applyCoupon({
        code: String(payload.code || nextCode).toUpperCase(),
        discount_type: payload.discount_type === 'percentage' ? 'percentage' : 'flat',
        discount_value: Number(payload.discount_value || 0),
        seller_id: payload.seller_id ?? null,
        seller_name: payload.seller_name ?? null,
      } satisfies CheckoutCoupon);
      setCouponStatusTone('success');
      setCouponStatus('Coupon applied successfully.');
    } catch (couponError) {
      removeCoupon();
      setCouponStatusTone('error');
      setCouponStatus(couponError instanceof Error ? couponError.message : 'Coupon could not be applied.');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    removeCoupon();
    setCouponCodeInput('');
    setCouponStatusTone('info');
    setCouponStatus('Coupon removed.');
  };

  const processOrder = async () => {
    setLoading(true);
    const addressSummary = buildCheckoutAddressSummary({
      upazila: formData.upazila,
      district: formData.district || formData.city,
      division: formData.division,
      address: formData.address,
    });

    try {
      if (saveAddressToAccount && !selectedAddressId) {
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

      const orderFingerprint = JSON.stringify({
        items: items.map((item) => [String(item.id), Number(item.quantity)]),
        coupon: appliedCoupon?.code || null,
        paymentMethod: formData.paymentMethod,
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        shippingAddress: addressSummary,
      });
      if (idempotencyKeyFingerprintRef.current !== orderFingerprint) {
        idempotencyKeyRef.current = crypto.randomUUID();
        idempotencyKeyFingerprintRef.current = orderFingerprint;
      }

      const endpoint = isAuthenticated ? '/api/orders' : '/api/orders/guest';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': idempotencyKeyRef.current,
          ...(isAuthenticated ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ...(isAuthenticated ? { total: checkoutTotal } : { email: formData.email, phone: formData.phone }),
          couponCode: appliedCoupon?.code || undefined,
          paymentMethod: formData.paymentMethod,
          deliveryFee,
          fullAddressSummary: addressSummary,
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
            address: addressSummary,
            city: formData.district || formData.city,
          },
          items: items.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            price: item.price,
          })),
          refCode: localStorage.getItem('ref_code') || undefined,
          idempotencyKey: idempotencyKeyRef.current,
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
            total: checkoutTotal,
            placedAt: new Date().toISOString(),
            guest: !isAuthenticated,
            guestEmail: !isAuthenticated ? formData.email : undefined,
            guestPhone: !isAuthenticated ? formData.phone : undefined,
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
    } catch (orderError) {
      setError(orderError instanceof Error ? orderError.message : 'Failed to place order.');
      setRecoveryHint('Please review your delivery details and try again. If the problem continues, contact support from the help page.');
    } finally {
      setLoading(false);
    }
  };

  if (!isReady || !isCartReady) {
    return <CheckoutSkeleton />;
  }

  if (!hasPlacedOrder && items.length === 0) {
    return <CheckoutSkeleton />;
  }

  return (
    <div className="bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_42%,#f8fafc_100%)]">
      <nav className="flex h-[56px] items-center gap-3 border-b border-[#e5e7eb] bg-[#f7f8fa] px-3 text-sm" aria-label="Breadcrumb">
        <Link to="/" aria-label="Home" className="text-[#344054] transition hover:text-[#2563EB]">
          <Home size={18} aria-hidden="true" />
        </Link>
        <ChevronRight size={17} className="text-[#111827]" aria-hidden="true" />
        <span className="font-medium text-black">Checkout</span>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-12">
        <div className="space-y-8">
        
          {!isAuthenticated ? (
            <div className="rounded-[1.5rem] border border-sky-200 bg-sky-50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-sky-900">Checking out as a guest</p>
                  <p className="mt-1 text-sm leading-6 text-sky-700">
                    Your order is confirmed without an account. After placing it you can{' '}
                    <Link
                      to="/login"
                      className="font-semibold text-sky-800 underline-offset-4 hover:underline"
                    >
                      login or register
                    </Link>{' '}
                    to claim and track it with the OTP sent to your email or phone.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

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

          <form id="checkout-form" onSubmit={handleSubmit} className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-6">
              <section className="rounded-[1.75rem] border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <MapPin size={20} />
                  </span>
                  <div>
                    <h2 className="text-xl font-bold text-slate-950">Delivery Information</h2>
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
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-sm font-semibold text-slate-900">Address options</p>
                      <p className="text-xs text-slate-500">
                        Use a saved address or keep this order address for your next checkout.
                      </p>
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
                        autoComplete="name"
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
                        autoComplete="tel"
                        inputMode="numeric"
                        maxLength={15}
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
                        autoComplete="tel-secondary"
                        inputMode="numeric"
                        maxLength={15}
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
                      autoComplete="email"
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
                      autoComplete="street-address"
                      value={formData.address}
                      onChange={handleInputChange}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10"
                      placeholder="House / holding / road / village / landmark"
                    />
                    <p className="text-xs text-slate-500">
                      Checkout will automatically combine your address details with upazila, district, and division for delivery.
                    </p>
                  </div>

                  {isAuthenticated ? (
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
                        src={item.image || '/icon.svg'}
                        className="h-14 w-14 rounded-xl bg-slate-100 object-cover"
                        alt={item.name}
                        width={56}
                        height={56}
                        decoding="async"
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

                <div className="mt-5">
                  <label htmlFor="checkout-coupon" className="text-sm font-semibold text-slate-900">
                    Have a coupon?
                  </label>
                  <div className="mt-3 flex gap-3">
                    <input
                      id="checkout-coupon"
                      type="text"
                      value={couponCode}
                      onChange={(event) => {
                        setCouponCodeInput(event.target.value);
                        if (couponStatus) setCouponStatus('');
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void handleApplyCoupon();
                        }
                      }}
                      placeholder="Enter code"
                      autoComplete="off"
                      spellCheck={false}
                      className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10"
                    />
                    <button
                      type="button"
                      onClick={() => void handleApplyCoupon()}
                      disabled={couponLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {couponLoading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : 'Apply'}
                    </button>
                  </div>
                  {couponStatus ? (
                    <p
                      className={cn(
                        'mt-2 text-sm font-medium',
                        couponStatusTone === 'success' && 'text-emerald-600',
                        couponStatusTone === 'error' && 'text-red-600',
                        couponStatusTone === 'info' && 'text-slate-500',
                      )}
                    >
                      {couponStatus}
                    </p>
                  ) : null}
                  {appliedCoupon ? (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      <span className="font-semibold">{appliedCoupon.code} applied</span>
                      <button type="button" onClick={handleRemoveCoupon} className="font-semibold text-emerald-800 underline-offset-4 hover:underline">
                        Remove
                      </button>
                    </div>
                  ) : null}
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
                    <span>Delivery Fee</span>
                    <span className="font-medium text-primary">
                      {shippingPreviewLoading
                        ? 'Estimating...'
                        : shippingPreview
                          ? shippingPreview.qualifies_for_free_shipping
                            ? 'Free'
                            : formatPrice(shippingPreview.estimated_fee_payable)
                          : 'Add city'}
                    </span>
                  </div>
                  {shippingPreview && shippingPreview.courier_price_verified === false ? (
                    <p className="text-xs leading-5 text-amber-600">Live courier pricing is temporarily unavailable, so this order cannot be placed yet.</p>
                  ) : null}
                  {shippingPreviewLoading ? (
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                      <span>Estimating delivery cost...</span>
                    </div>
                  ) : shippingPreview?.estimated_eta ? (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Truck size={14} className="shrink-0 text-primary" aria-hidden="true" />
                      <span>Estimated delivery: {shippingPreview.estimated_eta}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Platform fee:</span>
                    <span className="font-semibold text-slate-900">{formatPrice(PLATFORM_FEE)}</span>
                  </div>

                  <div className="flex justify-between pt-4 text-slate-950">
                    <span className="text-lg font-bold">Total</span>
                    <span className="text-2xl font-bold text-primary">{formatPrice(checkoutTotal)}</span>
                  </div>
                  {shippingPreview && !shippingPreview.qualifies_for_free_shipping ? (
                    <p className="text-xs leading-5 text-slate-500">
                      Delivery fee is included in the checkout total.
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
              <p className="text-lg font-bold text-slate-950">{formatPrice(checkoutTotal)}</p>
            </div>
            <button
              type="submit"
              form="checkout-form"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 className="animate-spin" size={16} /> : null}
              <span>{loading ? 'Placing...' : 'Place order'}</span>
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};
