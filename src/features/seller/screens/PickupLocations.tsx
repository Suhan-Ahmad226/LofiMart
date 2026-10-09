"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, MapPin, Phone, Plus, RefreshCw, Save, Store, Trash2, Truck } from 'lucide-react';
import toast from '@/lib/toast';
import { inventoryApi } from '@/features/inventory/services/inventoryApi';
import api from '../../../lib/api';
import { Warehouse } from '../../../types/inventory';
import { useSearchParams } from '../../../lib/navigation';

type CourierOption = {
  /**
   * Courier-native id, kept as a string.
   *
   * A string even though Pathao's are integers: the point of the generic location
   * and pickup-point endpoints is that the next courier's ids are not assumed to
   * be numeric, and parsing them here would reintroduce that assumption.
   */
  id: string;
  name: string;
  extra?: string;
  cityId?: number;
  zoneId?: number;
  address?: string;
  active?: boolean;
};

type WarehouseFormState = {
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  contactName: string;
  phone: string;
  email: string;
  secondaryPhone: string;
  otpNumber: string;
  maxItems: string;
  maxWeightKg: string;
  storeId: string;
  cityId: string;
  zoneId: string;
  areaId: string;
  insideDhakaFee: string;
  outsideDhakaFee: string;
  insideDhakaEta: string;
  outsideDhakaEta: string;
  freeShippingThresholdOverride: string;
};

const emptyForm: WarehouseFormState = {
  name: '',
  address: '',
  city: 'Dhaka',
  state: '',
  country: 'Bangladesh',
  postalCode: '',
  contactName: '',
  phone: '',
  email: '',
  secondaryPhone: '',
  otpNumber: '',
  maxItems: '',
  maxWeightKg: '',
  storeId: '',
  cityId: '',
  zoneId: '',
  areaId: '',
  insideDhakaFee: '',
  outsideDhakaFee: '',
  insideDhakaEta: '1-2 business days',
  outsideDhakaEta: '2-4 business days',
  freeShippingThresholdOverride: '',
};

function warehouseToForm(warehouse: Warehouse | null): WarehouseFormState {
  if (!warehouse) return emptyForm;
  return {
    name: warehouse.name || '',
    address: warehouse.location.address || '',
    city: warehouse.location.city || 'Dhaka',
    state: warehouse.location.state || '',
    country: warehouse.location.country || 'Bangladesh',
    postalCode: warehouse.location.postalCode || '',
    contactName: warehouse.contact?.name || '',
    phone: warehouse.contact?.phone || '',
    email: warehouse.contact?.email || '',
    secondaryPhone: warehouse.contact?.secondaryPhone || '',
    otpNumber: warehouse.contact?.otpNumber || '',
    maxItems: warehouse.capacity?.maxItems ? String(warehouse.capacity.maxItems) : '',
    maxWeightKg: warehouse.capacity?.maxWeightKg ? String(warehouse.capacity.maxWeightKg) : '',
    storeId: warehouse.courier?.storeId ? String(warehouse.courier.storeId) : '',
    cityId: warehouse.courier?.cityId ? String(warehouse.courier.cityId) : '',
    zoneId: warehouse.courier?.zoneId ? String(warehouse.courier.zoneId) : '',
    areaId: warehouse.courier?.areaId ? String(warehouse.courier.areaId) : '',
    insideDhakaFee: warehouse.shipping?.insideDhakaFee != null ? String(warehouse.shipping.insideDhakaFee) : '',
    outsideDhakaFee: warehouse.shipping?.outsideDhakaFee != null ? String(warehouse.shipping.outsideDhakaFee) : '',
    insideDhakaEta: warehouse.shipping?.insideDhakaEta || '1-2 business days',
    outsideDhakaEta: warehouse.shipping?.outsideDhakaEta || '2-4 business days',
    freeShippingThresholdOverride:
      warehouse.shipping?.freeShippingThresholdOverride != null ? String(warehouse.shipping.freeShippingThresholdOverride) : '',
  };
}

export const SellerPickupLocationsPage = () => {
  const [searchParams] = useSearchParams();
  const urlWarehouse = searchParams.get('warehouse') || '';
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [form, setForm] = useState<WarehouseFormState>(emptyForm);
  const [cities, setCities] = useState<CourierOption[]>([]);
  const [zones, setZones] = useState<CourierOption[]>([]);
  const [areas, setAreas] = useState<CourierOption[]>([]);
  const [stores, setStores] = useState<CourierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingStore, setCreatingStore] = useState(false);
  const [loadingStoreInfo, setLoadingStoreInfo] = useState(false);
  const [linkedStoreInfo, setLinkedStoreInfo] = useState<CourierOption | null>(null);
  const [removingId, setRemovingId] = useState('');
  const [focusedWarehouseId, setFocusedWarehouseId] = useState('');
  const [removeConfirmId, setRemoveConfirmId] = useState('');

  /**
   * The courier this screen configures, resolved from the registry.
   *
   * `null` until it loads, which is why every courier call below is guarded on it
   * — a screen that assumed a courier existed would either 404 or, worse, silently
   * save a mapping against the wrong one.
   */
  const [courier, setCourier] = useState<{ code: string; name: string; shortLabel: string } | null>(
    null,
  );

  const selectedWarehouse = useMemo(
    () => warehouses.find((warehouse) => warehouse.id === selectedWarehouseId) || null,
    [selectedWarehouseId, warehouses],
  );

  const selectedStore = useMemo(
    () => stores.find((store) => String(store.id) === String(form.storeId || '')) || null,
    [stores, form.storeId],
  );

  const suggestedStore = useMemo(() => {
    if (!form.name.trim() && !form.city.trim()) return null;

    const normalizedWarehouseName = form.name.trim().toLowerCase();
    const normalizedCity = form.city.trim().toLowerCase();

    const exactNameMatch = stores.find((store) => store.name.trim().toLowerCase() === normalizedWarehouseName);
    if (exactNameMatch) return exactNameMatch;

    const partialNameMatch = stores.find((store) => store.name.trim().toLowerCase().includes(normalizedWarehouseName));
    if (partialNameMatch) return partialNameMatch;

    const cityMatch = stores.find(
      (store) =>
        normalizedCity &&
        ((store.extra || '').toLowerCase().includes(normalizedCity) || (store.address || '').toLowerCase().includes(normalizedCity)),
    );
    return cityMatch || null;
  }, [stores, form.name, form.city]);

  const loadWarehouses = async () => {
    try {
      setLoading(true);
      const payload = await inventoryApi.fetchWarehouses();
      setWarehouses(payload);
      setSelectedWarehouseId((current) => current || payload[0]?.id || '');
    } catch {
      toast.error('Failed to load pickup locations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWarehouses();
  }, []);

  useEffect(() => {
    if (!urlWarehouse || warehouses.length === 0 || typeof window === 'undefined') return;

    const matched = warehouses.find((warehouse) => warehouse.id === urlWarehouse);
    if (!matched) return;

    setSelectedWarehouseId(matched.id);
    setFocusedWarehouseId(matched.id);

    window.requestAnimationFrame(() => {
      document.getElementById(`seller-warehouse-${matched.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [urlWarehouse, warehouses]);

  useEffect(() => {
    let ignore = false;

    const loadMeta = async () => {
      try {
        setLoadingMeta(true);

        // The courier is resolved from the registry, not hardcoded, so this screen
        // is correct for whichever courier is live.
        const providerResponse = await api.get<{ code: string; name: string; shortLabel: string }[]>(
          '/logistics/providers',
        );
        const provider = providerResponse.data?.[0] ?? null;
        if (ignore) return;

        if (!provider) {
          setCities([]);
          setStores([]);
          toast.error('No courier is available yet. Contact support to enable one.');
          return;
        }

        setCourier(provider);

        const [cityPayload, storePayload] = await Promise.all([
          inventoryApi.fetchCourierLocations({ provider: provider.code, level: 'city' }),
          inventoryApi.fetchCourierStores({ provider: provider.code }),
        ]);

        if (ignore) return;

        setCities((cityPayload?.nodes ?? []).map((node) => ({ id: node.id, name: node.name })));
        setStores(
          (storePayload?.remoteStores ?? []).map((store) => ({
            id: store.externalStoreId,
            name: store.externalStoreName || store.externalStoreId,
            extra: store.active ? 'active' : 'inactive',
            cityId: store.metadata?.cityId ?? undefined,
            zoneId: store.metadata?.zoneId ?? undefined,
            address: store.metadata?.address ?? undefined,
            active: store.active,
          })),
        );
      } catch {
        if (!ignore) {
          toast.error('Failed to load courier reference data.');
        }
      } finally {
        if (!ignore) {
          setLoadingMeta(false);
        }
      }
    };

    void loadMeta();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    setForm(warehouseToForm(selectedWarehouse));
    setLinkedStoreInfo(null);
  }, [selectedWarehouse]);

  useEffect(() => {
    let ignore = false;

    const loadZones = async () => {
      if (!courier || !form.cityId) {
        setZones([]);
        return;
      }

      try {
        const payload = await inventoryApi.fetchCourierLocations({
          provider: courier.code,
          level: 'zone',
          parentId: form.cityId,
        });
        if (ignore) return;
        setZones((payload?.nodes ?? []).map((node) => ({ id: node.id, name: node.name })));
      } catch {
        if (!ignore) {
          setZones([]);
        }
      }
    };

    void loadZones();
    return () => {
      ignore = true;
    };
  }, [form.cityId, courier]);

  useEffect(() => {
    let ignore = false;

    const loadAreas = async () => {
      if (!courier || !form.zoneId) {
        setAreas([]);
        return;
      }

      try {
        const payload = await inventoryApi.fetchCourierLocations({
          provider: courier.code,
          level: 'area',
          parentId: form.zoneId,
        });
        if (ignore) return;
        setAreas(
          (payload?.nodes ?? []).map((node) => ({
            id: node.id,
            name: node.name,
            extra:
              node.homeDeliveryAvailable === false
                ? 'pickup only'
                : node.pickupAvailable === false
                  ? 'home delivery only'
                  : undefined,
          })),
        );
      } catch {
        if (!ignore) {
          setAreas([]);
        }
      }
    };

    void loadAreas();
    return () => {
      ignore = true;
    };
  }, [form.zoneId, courier]);

  const upsertWarehouse = async () => {
    const payload: Omit<Warehouse, 'id'> = {
      name: form.name.trim(),
      location: {
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim() || undefined,
        country: form.country.trim() || 'Bangladesh',
        postalCode: form.postalCode.trim(),
      },
      contact: {
        name: form.contactName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        secondaryPhone: form.secondaryPhone.trim() || undefined,
        otpNumber: form.otpNumber.trim() || undefined,
      },
      shipping: {
        insideDhakaFee: form.insideDhakaFee ? Number(form.insideDhakaFee) : undefined,
        outsideDhakaFee: form.outsideDhakaFee ? Number(form.outsideDhakaFee) : undefined,
        insideDhakaEta: form.insideDhakaEta.trim() || undefined,
        outsideDhakaEta: form.outsideDhakaEta.trim() || undefined,
        freeShippingThresholdOverride: form.freeShippingThresholdOverride ? Number(form.freeShippingThresholdOverride) : undefined,
      },
      capacity: {
        maxItems: form.maxItems ? Number(form.maxItems) : undefined,
        maxWeightKg: form.maxWeightKg ? Number(form.maxWeightKg) : undefined,
      },
      createdAt: selectedWarehouse?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!payload.name || !payload.location.address || !payload.location.city || !payload.location.postalCode) {
      toast.error('Name, address, city, and postal code are required.');
      return;
    }

    if (!courier) {
      toast.error('No courier is available to link this pickup location to.');
      return;
    }

    try {
      setSaving(true);
      let nextWarehouse: Warehouse;
      if (selectedWarehouse) {
        nextWarehouse = await inventoryApi.updateWarehouse(selectedWarehouse.id, payload);
      } else {
        nextWarehouse = await inventoryApi.createWarehouse(payload);
      }

      // The courier link is a separate write: it is keyed by provider, so it
      // cannot live inside the warehouse payload without a second courier
      // overwriting the first courier's mapping.
      await inventoryApi.updateWarehouseCourierConfig(nextWarehouse.id, {
        provider: courier.code,
        // A `pending:` value is a placeholder for a pickup point the courier has
        // not yet issued an id for, so it is never persisted as a real id.
        storeId: form.storeId && !form.storeId.startsWith('pending:') ? form.storeId : null,
        cityId: form.cityId ? Number(form.cityId) : null,
        zoneId: form.zoneId ? Number(form.zoneId) : null,
        areaId: form.areaId ? Number(form.areaId) : null,
        contactName: form.contactName,
        secondaryContact: form.secondaryPhone,
        otpNumber: form.otpNumber,
      });

      toast.success(selectedWarehouse ? 'Pickup location updated.' : 'Pickup location created.');
      await loadWarehouses();
      setSelectedWarehouseId(nextWarehouse.id);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to save pickup location.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateNew = () => {
    setSelectedWarehouseId('');
    setForm(emptyForm);
  };

  const handleRemove = async (warehouseId: string) => {
    try {
      setRemovingId(warehouseId);
      await inventoryApi.deleteWarehouse(warehouseId);
      setRemoveConfirmId('');
      toast.success('Pickup location removed.');
      await loadWarehouses();
      if (selectedWarehouseId === warehouseId) {
        setSelectedWarehouseId('');
        setForm(emptyForm);
      }
    } catch {
      toast.error('Failed to remove pickup location.');
    } finally {
      setRemovingId('');
    }
  };

  const handleRegisterPickupPoint = async () => {
    if (!selectedWarehouse) {
      toast.error('Save the pickup location first.');
      return;
    }
    if (!courier) {
      toast.error('No courier is available to register a pickup point with.');
      return;
    }

    const cityId = Number(form.cityId);
    const zoneId = Number(form.zoneId);
    const areaId = Number(form.areaId);

    // Required, not defaulted. A pickup point registered against a guessed
    // location has the courier collecting from the wrong hub with nothing to
    // detect it.
    if (!cityId || !zoneId || !areaId) {
      toast.error('Choose the city, zone and area before registering a pickup point.');
      return;
    }

    try {
      setCreatingStore(true);
      const payload = await inventoryApi.createCourierStore({
        provider: courier.code,
        warehouseId: selectedWarehouse.id,
        cityId,
        zoneId,
        areaId,
      });

      const nextStoreId = typeof payload.externalStoreId === 'string' ? payload.externalStoreId : '';
      if (nextStoreId) {
        setForm((current) => ({ ...current, storeId: nextStoreId }));
      }

      // "Registered" and "bookable" are different states: the courier reviews new
      // pickup points, and reporting success without saying so would have a seller
      // promise a service that cannot be booked yet.
      toast.success(
        payload.bookable
          ? `${courier.name} pickup point is approved and linked: ${nextStoreId}`
          : `${courier.name} pickup point submitted. It becomes bookable once the courier approves it.`,
      );
      await loadWarehouses();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to register the pickup point.');
    } finally {
      setCreatingStore(false);
    }
  };

  /**
   * Confirms the linked pickup point still exists at the courier.
   *
   * Reads the courier's own store list rather than trusting our mapping, so a
   * pickup point deactivated on the courier's side is visible here instead of
   * failing later as a rejected booking.
   *
   * This replaces a raw "price test" panel. That panel called the courier's price
   * endpoint directly from the browser, which showed a number that nothing
   * guaranteed was the number a customer would be charged — the authoritative
   * figure is the server-side quote used at checkout. Removing it closes a
   * "quoted one price, charged another" gap rather than losing a real capability.
   */
  const handleVerifyLink = async () => {
    if (!form.storeId) {
      toast.error('Register or select a pickup point first.');
      return;
    }
    if (!courier) {
      toast.error('No courier is available to verify against.');
      return;
    }

    try {
      setLoadingStoreInfo(true);
      const payload = await inventoryApi.fetchCourierStores({ provider: courier.code });
      const found = (payload?.remoteStores ?? []).find(
        (store) => store.externalStoreId === form.storeId,
      );

      setLinkedStoreInfo(
        found
          ? {
              id: found.externalStoreId,
              name: found.externalStoreName || found.externalStoreId,
              extra: found.active ? 'active' : 'inactive',
              address: found.metadata?.address ?? undefined,
              active: found.active,
            }
          : null,
      );

      if (found) {
        toast.success(
          found.active
            ? `${courier.name} still lists pickup point ${found.externalStoreId}.`
            : `${courier.name} lists pickup point ${found.externalStoreId}, but it is not active. Bookings will be rejected.`,
        );
      } else {
        toast.error(
          `${courier.name} does not list pickup point ${form.storeId}. It may have been removed on their side.`,
        );
      }
    } catch (error: any) {
      setLinkedStoreInfo(null);
      toast.error(error?.response?.data?.error || 'Failed to verify the pickup point.');
    } finally {
      setLoadingStoreInfo(false);
    }
  };

  const handleApplySuggestedStore = () => {
    if (!suggestedStore) {
      toast.error('No suitable pickup point suggestion found yet.');
      return;
    }

    setForm((current) => ({
      ...current,
      storeId: String(suggestedStore.id),
      cityId: current.cityId || (suggestedStore.cityId ? String(suggestedStore.cityId) : ''),
      zoneId: current.zoneId || (suggestedStore.zoneId ? String(suggestedStore.zoneId) : ''),
    }));
    toast.success(`Suggested pickup point ${suggestedStore.name} applied.`);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-5 sm:space-y-7 lg:space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-primary/70">Pickup operations</p>
          <h1 className="mt-2 text-2xl font-bold leading-tight text-slate-950 sm:text-3xl">Pickup locations and warehouse mapping</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500">
            Manage seller pickup points, save courier contact details, and keep the courier pickup point mapped for live shipment booking.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
          <button
            type="button"
            onClick={() => void loadWarehouses()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto"
          >
            <RefreshCw size={16} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleCreateNew}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 sm:w-auto"
          >
            <Plus size={16} />
            <span>New pickup location</span>
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
        <section className="min-w-0 space-y-3 rounded-3xl border border-black/5 bg-white p-4 shadow-sm md:p-5">
          <div className="flex items-center gap-2">
            <Truck size={18} className="text-primary" />
            <h2 className="font-bold text-slate-950">Your pickup locations</h2>
          </div>
          {warehouses.length ? warehouses.map((warehouse) => {
            const active = warehouse.id === selectedWarehouseId;
            const focused = warehouse.id === focusedWarehouseId;
            return (
              <button
                id={`seller-warehouse-${warehouse.id}`}
                key={warehouse.id}
                type="button"
                onClick={() => {
                  setSelectedWarehouseId(warehouse.id);
                  setFocusedWarehouseId(warehouse.id);
                }}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  focused
                    ? 'border-indigo-300 bg-indigo-50 ring-2 ring-indigo-200'
                    : active
                      ? 'border-rose-200 bg-rose-50'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <Building2 size={16} className="text-slate-500" />
                      <span className="break-words font-semibold text-slate-900">{warehouse.name}</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-slate-500">
                      <MapPin size={14} className="mt-0.5 shrink-0" />
                      <span className="break-words">{warehouse.location.address}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Phone size={14} />
                      <span>{warehouse.contact?.phone || 'No phone added yet'}</span>
                    </div>
                  </div>
                  <div className="space-y-2 text-left sm:text-right">
                    <div className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
                      warehouse.courier?.storeId ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {warehouse.courier?.storeId ? `Pickup point ${warehouse.courier.storeId}` : 'Store pending'}
                    </div>
                    <div className="text-xs text-slate-400">
                      {warehouse.courier?.cityId && warehouse.courier?.zoneId && warehouse.courier?.areaId ? 'Area mapped' : 'Map courier area'}
                    </div>
                    {focused ? (
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600">
                        Focused
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                  <div className="rounded-xl bg-white/70 px-3 py-2">
                    Inside Dhaka: {warehouse.shipping?.insideDhakaFee != null ? `BDT ${warehouse.shipping.insideDhakaFee}` : 'fee missing'} / {warehouse.shipping?.insideDhakaEta || 'ETA missing'}
                  </div>
                  <div className="rounded-xl bg-white/70 px-3 py-2">
                    Outside Dhaka: {warehouse.shipping?.outsideDhakaFee != null ? `BDT ${warehouse.shipping.outsideDhakaFee}` : 'fee missing'} / {warehouse.shipping?.outsideDhakaEta || 'ETA missing'}
                  </div>
                </div>
              </button>
            );
          }) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              No pickup locations yet. Create your first warehouse to start courier booking.
            </div>
          )}
        </section>

        <section className="min-w-0 rounded-3xl border border-black/5 bg-white p-4 shadow-sm md:p-6">
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">
                {selectedWarehouse ? `Edit ${selectedWarehouse.name}` : 'Create new pickup location'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Keep warehouse address, pickup contact, and courier mapping complete for live multi-vendor operations.
              </p>
            </div>
            {selectedWarehouse ? (
              removeConfirmId === selectedWarehouse.id ? (
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  <span className="font-semibold">Remove this pickup location?</span>
                  <button
                    type="button"
                    onClick={() => void handleRemove(selectedWarehouse.id)}
                    disabled={removingId === selectedWarehouse.id}
                    className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-rose-700 disabled:opacity-50"
                  >
                    {removingId === selectedWarehouse.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    <span>Confirm remove</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoveConfirmId('')}
                    className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                  >
                    Keep location
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setRemoveConfirmId(selectedWarehouse.id)}
                  disabled={removingId === selectedWarehouse.id}
                  className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                >
                  {removingId === selectedWarehouse.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  <span>Remove</span>
                </button>
              )
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2 md:gap-4">
            <label className="space-y-2 text-sm">
              <span className="font-medium text-slate-700">Location name</span>
              <input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" placeholder="Dhaka main warehouse" />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-slate-700">City</span>
              <input value={form.city} onChange={(e) => setForm((c) => ({ ...c, city: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" placeholder="Dhaka" />
            </label>
            <label className="space-y-2 text-sm md:col-span-2">
              <span className="font-medium text-slate-700">Address</span>
              <input value={form.address} onChange={(e) => setForm((c) => ({ ...c, address: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" placeholder="Full pickup address" />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-slate-700">State / Area</span>
              <input value={form.state} onChange={(e) => setForm((c) => ({ ...c, state: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" placeholder="Dhaka Division" />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-slate-700">Postal code</span>
              <input value={form.postalCode} onChange={(e) => setForm((c) => ({ ...c, postalCode: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" placeholder="1207" />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-slate-700">Country</span>
              <input value={form.country} onChange={(e) => setForm((c) => ({ ...c, country: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" placeholder="Bangladesh" />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-slate-700">Pickup contact name</span>
              <input value={form.contactName} onChange={(e) => setForm((c) => ({ ...c, contactName: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" placeholder="Warehouse manager" />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-slate-700">Primary phone</span>
              <input value={form.phone} onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" placeholder="01XXXXXXXXX" />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-slate-700">Email</span>
              <input value={form.email} onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" placeholder="warehouse@yourstore.com" />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-slate-700">Secondary phone</span>
              <input value={form.secondaryPhone} onChange={(e) => setForm((c) => ({ ...c, secondaryPhone: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" placeholder="01XXXXXXXXX" />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-slate-700">OTP number</span>
              <input value={form.otpNumber} onChange={(e) => setForm((c) => ({ ...c, otpNumber: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" placeholder="01XXXXXXXXX" />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-slate-700">Max items</span>
              <input value={form.maxItems} onChange={(e) => setForm((c) => ({ ...c, maxItems: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" placeholder="500" />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-slate-700">Max weight (kg)</span>
              <input value={form.maxWeightKg} onChange={(e) => setForm((c) => ({ ...c, maxWeightKg: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" placeholder="1200" />
            </label>
          </div>

          <div className="mt-8 rounded-2xl border border-sky-100 bg-sky-50/60 p-4 md:p-5">
            <div className="flex items-center gap-2 font-semibold text-sky-700">
              <Truck size={16} />
              <span>Shipping rules for this pickup location</span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Set warehouse-level delivery estimates so checkout can show more realistic fee and ETA for this pickup point.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2 md:gap-4">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Inside Dhaka fee (BDT)</span>
                <input value={form.insideDhakaFee} onChange={(e) => setForm((c) => ({ ...c, insideDhakaFee: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" placeholder="60" />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Outside Dhaka fee (BDT)</span>
                <input value={form.outsideDhakaFee} onChange={(e) => setForm((c) => ({ ...c, outsideDhakaFee: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" placeholder="120" />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Inside Dhaka ETA</span>
                <input value={form.insideDhakaEta} onChange={(e) => setForm((c) => ({ ...c, insideDhakaEta: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" placeholder="1-2 business days" />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Outside Dhaka ETA</span>
                <input value={form.outsideDhakaEta} onChange={(e) => setForm((c) => ({ ...c, outsideDhakaEta: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" placeholder="2-4 business days" />
              </label>
              <label className="space-y-2 text-sm md:col-span-2">
                <span className="font-medium text-slate-700">Free shipping threshold override (BDT)</span>
                <input value={form.freeShippingThresholdOverride} onChange={(e) => setForm((c) => ({ ...c, freeShippingThresholdOverride: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" placeholder="Leave blank to use marketplace default" />
              </label>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-rose-100 bg-rose-50/60 p-4 md:p-5">
            <div className="flex items-center gap-2 font-semibold text-rose-700">
              <Store size={16} />
              <span>Courier pickup mapping</span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Map this pickup location to a courier city, zone, area, and pickup point before enabling live auto-booking.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2 md:gap-4">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Linked store ID</span>
                <select value={form.storeId} onChange={(e) => setForm((c) => ({ ...c, storeId: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                  <option value="">No linked pickup point</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name} ({store.id}) {store.extra ? `- ${store.extra}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Courier city</span>
                <select
                  value={form.cityId}
                  onChange={(e) => setForm((c) => ({ ...c, cityId: e.target.value, zoneId: '', areaId: '' }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                >
                  <option value="">Select city</option>
                  {cities.map((city) => (
                    <option key={city.id} value={city.id}>{city.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Courier zone</span>
                <select
                  value={form.zoneId}
                  onChange={(e) => setForm((c) => ({ ...c, zoneId: e.target.value, areaId: '' }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                >
                  <option value="">Select zone</option>
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>{zone.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Courier area</span>
                <select
                  value={form.areaId}
                  onChange={(e) => setForm((c) => ({ ...c, areaId: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                >
                  <option value="">Select area</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>{area.name} {area.extra ? `- ${area.extra}` : ''}</option>
                  ))}
                </select>
              </label>
            </div>

            {suggestedStore && String(suggestedStore.id) !== String(form.storeId || '') ? (
              <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Suggested linked store</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {suggestedStore.name} ({suggestedStore.id})
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {suggestedStore.address || 'No address returned by the courier'}{suggestedStore.extra ? ` â€¢ ${suggestedStore.extra}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleApplySuggestedStore}
                    className="inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-white px-4 py-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50"
                  >
                    <Store size={16} />
                    <span>Use suggested store</span>
                  </button>
                </div>
              </div>
            ) : null}

            {selectedStore ? (
              <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Selected store summary</p>
                <p className="mt-1">
                  {selectedStore.name} ({selectedStore.id})
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedStore.address || 'No store address available'}{selectedStore.extra ? ` â€¢ ${selectedStore.extra}` : ''}
                </p>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleRegisterPickupPoint()}
                disabled={creatingStore || !selectedWarehouse || !form.cityId || !form.zoneId || !form.areaId}
                className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-50"
              >
                {creatingStore ? <Loader2 className="animate-spin" size={16} /> : <Store size={16} />}
                <span>{creatingStore ? 'Registering...' : 'Register pickup point'}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleVerifyLink()}
                disabled={loadingStoreInfo || !form.storeId}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {loadingStoreInfo ? <Loader2 className="animate-spin" size={16} /> : <Building2 size={16} />}
                <span>{loadingStoreInfo ? 'Checking...' : 'Verify pickup point'}</span>
              </button>
              {loadingMeta ? (
                <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-500">
                  <Loader2 className="animate-spin" size={14} />
                  <span>Loading courier reference data...</span>
                </div>
              ) : null}
            </div>

            {linkedStoreInfo ? (
              <div
                className={`mt-4 rounded-2xl border p-4 text-sm ${
                  linkedStoreInfo.active
                    ? 'border-emerald-100 bg-emerald-50 text-emerald-900'
                    : 'border-amber-200 bg-amber-50 text-amber-900'
                }`}
              >
                <p className="font-semibold">
                  {courier?.name ?? 'Courier'} still lists this pickup point
                </p>
                <p className="mt-1">{linkedStoreInfo.name}</p>
                <p className="mt-1 text-xs opacity-80">
                  Address: {linkedStoreInfo.address || 'The courier returned no address'}
                </p>
                <p className="mt-1 text-xs opacity-80">
                  {/* Inactive is called out rather than styled as success: the
                      courier still knows the pickup point, but bookings against it
                      will be refused. */}
                  Status: {linkedStoreInfo.active ? 'Active and bookable' : 'Listed but not active'}
                </p>
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={() => void upsertWarehouse()}
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50 sm:w-auto"
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              <span>{saving ? 'Saving...' : selectedWarehouse ? 'Save changes' : 'Create pickup location'}</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
