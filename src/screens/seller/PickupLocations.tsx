"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, MapPin, Phone, Plus, RefreshCw, Save, Store, Trash2, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { inventoryApi } from '../../services/inventoryApi';
import { Warehouse } from '../../types/inventory';

type PathaoOption = {
  id: number;
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
  pathaoStoreId: string;
  pathaoCityId: string;
  pathaoZoneId: string;
  pathaoAreaId: string;
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
  pathaoStoreId: '',
  pathaoCityId: '',
  pathaoZoneId: '',
  pathaoAreaId: '',
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
    pathaoStoreId: warehouse.pathao?.storeId ? String(warehouse.pathao.storeId) : '',
    pathaoCityId: warehouse.pathao?.cityId ? String(warehouse.pathao.cityId) : '',
    pathaoZoneId: warehouse.pathao?.zoneId ? String(warehouse.pathao.zoneId) : '',
    pathaoAreaId: warehouse.pathao?.areaId ? String(warehouse.pathao.areaId) : '',
    insideDhakaFee: warehouse.shipping?.insideDhakaFee != null ? String(warehouse.shipping.insideDhakaFee) : '',
    outsideDhakaFee: warehouse.shipping?.outsideDhakaFee != null ? String(warehouse.shipping.outsideDhakaFee) : '',
    insideDhakaEta: warehouse.shipping?.insideDhakaEta || '1-2 business days',
    outsideDhakaEta: warehouse.shipping?.outsideDhakaEta || '2-4 business days',
    freeShippingThresholdOverride:
      warehouse.shipping?.freeShippingThresholdOverride != null ? String(warehouse.shipping.freeShippingThresholdOverride) : '',
  };
}

export const SellerPickupLocationsPage = () => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [form, setForm] = useState<WarehouseFormState>(emptyForm);
  const [cities, setCities] = useState<PathaoOption[]>([]);
  const [zones, setZones] = useState<PathaoOption[]>([]);
  const [areas, setAreas] = useState<PathaoOption[]>([]);
  const [stores, setStores] = useState<PathaoOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingStore, setCreatingStore] = useState(false);
  const [loadingStoreInfo, setLoadingStoreInfo] = useState(false);
  const [testingPrice, setTestingPrice] = useState(false);
  const [pathaoStoreInfo, setPathaoStoreInfo] = useState<any | null>(null);
  const [pathaoPriceQuote, setPathaoPriceQuote] = useState<any | null>(null);
  const [removingId, setRemovingId] = useState('');
  const [focusedWarehouseId, setFocusedWarehouseId] = useState('');
  const [removeConfirmId, setRemoveConfirmId] = useState('');

  const selectedWarehouse = useMemo(
    () => warehouses.find((warehouse) => warehouse.id === selectedWarehouseId) || null,
    [selectedWarehouseId, warehouses],
  );

  const selectedStore = useMemo(
    () => stores.find((store) => String(store.id) === String(form.pathaoStoreId || '')) || null,
    [stores, form.pathaoStoreId],
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
    if (typeof window === 'undefined' || warehouses.length === 0) return;

    const warehouseId = new URLSearchParams(window.location.search).get('warehouse');
    if (!warehouseId) return;

    const matched = warehouses.find((warehouse) => warehouse.id === warehouseId);
    if (!matched) return;

    setSelectedWarehouseId(matched.id);
    setFocusedWarehouseId(matched.id);

    window.requestAnimationFrame(() => {
      document.getElementById(`seller-warehouse-${matched.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [warehouses]);

  useEffect(() => {
    let ignore = false;

    const loadMeta = async () => {
      try {
        setLoadingMeta(true);
        const [cityPayload, storePayload] = await Promise.all([
          inventoryApi.fetchPathaoCities(),
          inventoryApi.fetchPathaoStores(),
        ]);

        if (ignore) return;

        const cityRows = Array.isArray(cityPayload?.data?.data) ? cityPayload.data.data : [];
        const storeRows = Array.isArray(storePayload?.data?.data) ? storePayload.data.data : [];

        setCities(cityRows.map((item: any) => ({ id: Number(item.city_id), name: String(item.city_name || '') })));
        setStores(
          storeRows.map((item: any) => ({
            id: Number(item.store_id),
            name: String(item.store_name || ''),
            extra: item.is_active === 1 ? 'active' : 'inactive',
            cityId: Number(item.city_id || 0) || undefined,
            zoneId: Number(item.zone_id || 0) || undefined,
            address: String(item.store_address || ''),
            active: item.is_active === 1,
          })),
        );
      } catch {
        if (!ignore) {
          toast.error('Failed to load Pathao reference data.');
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
    setPathaoStoreInfo(null);
    setPathaoPriceQuote(null);
  }, [selectedWarehouse]);

  useEffect(() => {
    let ignore = false;

    const loadZones = async () => {
      const cityId = Number(form.pathaoCityId);
      if (!Number.isFinite(cityId) || cityId <= 0) {
        setZones([]);
        return;
      }

      try {
        const payload = await inventoryApi.fetchPathaoZones(cityId);
        if (ignore) return;
        const rows = Array.isArray(payload?.data?.data) ? payload.data.data : [];
        setZones(rows.map((item: any) => ({ id: Number(item.zone_id), name: String(item.zone_name || '') })));
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
  }, [form.pathaoCityId]);

  useEffect(() => {
    let ignore = false;

    const loadAreas = async () => {
      const zoneId = Number(form.pathaoZoneId);
      if (!Number.isFinite(zoneId) || zoneId <= 0) {
        setAreas([]);
        return;
      }

      try {
        const payload = await inventoryApi.fetchPathaoAreas(zoneId);
        if (ignore) return;
        const rows = Array.isArray(payload?.data?.data) ? payload.data.data : [];
        setAreas(
          rows.map((item: any) => ({
            id: Number(item.area_id),
            name: String(item.area_name || '').trim(),
            extra: item.home_delivery_available ? 'home delivery' : 'pickup only',
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
  }, [form.pathaoZoneId]);

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
      pathao: {
        storeId: form.pathaoStoreId ? Number(form.pathaoStoreId) : undefined,
        cityId: form.pathaoCityId ? Number(form.pathaoCityId) : undefined,
        zoneId: form.pathaoZoneId ? Number(form.pathaoZoneId) : undefined,
        areaId: form.pathaoAreaId ? Number(form.pathaoAreaId) : undefined,
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

    try {
      setSaving(true);
      let nextWarehouse: Warehouse;
      if (selectedWarehouse) {
        nextWarehouse = await inventoryApi.updateWarehouse(selectedWarehouse.id, payload);
      } else {
        nextWarehouse = await inventoryApi.createWarehouse(payload);
      }

      await inventoryApi.updateWarehousePathaoConfig(nextWarehouse.id, {
        storeId: form.pathaoStoreId ? Number(form.pathaoStoreId) : null,
        cityId: form.pathaoCityId ? Number(form.pathaoCityId) : null,
        zoneId: form.pathaoZoneId ? Number(form.pathaoZoneId) : null,
        areaId: form.pathaoAreaId ? Number(form.pathaoAreaId) : null,
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

  const handleCreateStore = async () => {
    if (!selectedWarehouse) {
      toast.error('Save the pickup location first.');
      return;
    }

    try {
      setCreatingStore(true);
      const payload = await inventoryApi.createPathaoStore({ warehouseId: selectedWarehouse.id });
      const nextStoreId = Number(payload?.store_id || 0);
      if (nextStoreId) {
        setForm((current) => ({ ...current, pathaoStoreId: String(nextStoreId) }));
      }
      toast.success(nextStoreId ? `Pathao store created and linked: ${nextStoreId}` : 'Pathao store request sent successfully.');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to create Pathao store.');
    } finally {
      setCreatingStore(false);
    }
  };

  const handleLoadStoreInfo = async () => {
    const storeId = Number(form.pathaoStoreId);
    if (!Number.isFinite(storeId) || storeId <= 0) {
      toast.error('Select or create a linked Pathao store first.');
      return;
    }

    try {
      setLoadingStoreInfo(true);
      const payload = await inventoryApi.fetchPathaoStoreInfo(storeId);
      setPathaoStoreInfo(payload?.data || payload || null);
      toast.success(`Loaded Pathao store ${storeId}.`);
    } catch (error: any) {
      setPathaoStoreInfo(null);
      toast.error(error?.response?.data?.error || 'Failed to load Pathao store info.');
    } finally {
      setLoadingStoreInfo(false);
    }
  };

  const handleRunPriceTest = async () => {
    const storeId = Number(form.pathaoStoreId);
    const cityId = Number(form.pathaoCityId);
    const zoneId = Number(form.pathaoZoneId);

    if (!Number.isFinite(storeId) || storeId <= 0 || !Number.isFinite(cityId) || cityId <= 0 || !Number.isFinite(zoneId) || zoneId <= 0) {
      toast.error('Linked store, Pathao city, and Pathao zone are required for a price test.');
      return;
    }

    try {
      setTestingPrice(true);
      const payload = await inventoryApi.calculatePathaoPrice({
        store_id: storeId,
        item_type: 2,
        delivery_type: 48,
        item_weight: 0.5,
        recipient_city: cityId,
        recipient_zone: zoneId,
      });
      setPathaoPriceQuote(payload?.data || payload || null);
      toast.success('Pathao price test completed.');
    } catch (error: any) {
      setPathaoPriceQuote(null);
      toast.error(error?.response?.data?.error || 'Failed to calculate Pathao price.');
    } finally {
      setTestingPrice(false);
    }
  };

  const handleApplySuggestedStore = () => {
    if (!suggestedStore) {
      toast.error('No suitable Pathao store suggestion found yet.');
      return;
    }

    setForm((current) => ({
      ...current,
      pathaoStoreId: String(suggestedStore.id),
      pathaoCityId: current.pathaoCityId || (suggestedStore.cityId ? String(suggestedStore.cityId) : ''),
      pathaoZoneId: current.pathaoZoneId || (suggestedStore.zoneId ? String(suggestedStore.zoneId) : ''),
    }));
    toast.success(`Suggested Pathao store ${suggestedStore.name} applied.`);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-primary/70">Pickup operations</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">Pickup locations and warehouse mapping</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500">
            Manage seller pickup points, save courier contact details, and keep Pathao store mapping ready for live shipment booking.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void loadWarehouses()}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleCreateNew}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Plus size={16} />
            <span>New pickup location</span>
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
        <section className="space-y-3 rounded-3xl border border-black/5 bg-white p-4 shadow-sm md:p-5">
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
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Building2 size={16} className="text-slate-500" />
                      <span className="font-semibold text-slate-900">{warehouse.name}</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-slate-500">
                      <MapPin size={14} className="mt-0.5 shrink-0" />
                      <span>{warehouse.location.address}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Phone size={14} />
                      <span>{warehouse.contact?.phone || 'No phone added yet'}</span>
                    </div>
                  </div>
                  <div className="space-y-2 text-right">
                    <div className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
                      warehouse.pathao?.storeId ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {warehouse.pathao?.storeId ? `Store ${warehouse.pathao.storeId}` : 'Store pending'}
                    </div>
                    <div className="text-xs text-slate-400">
                      {warehouse.pathao?.cityId && warehouse.pathao?.zoneId && warehouse.pathao?.areaId ? 'Area mapped' : 'Map Pathao area'}
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

        <section className="rounded-3xl border border-black/5 bg-white p-4 shadow-sm md:p-6">
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
              <span>Pathao pickup mapping</span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Map this pickup location to Pathao city, zone, area, and store before enabling live auto-booking.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2 md:gap-4">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Linked store ID</span>
                <select value={form.pathaoStoreId} onChange={(e) => setForm((c) => ({ ...c, pathaoStoreId: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                  <option value="">No linked Pathao store</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name} ({store.id}) {store.extra ? `- ${store.extra}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Pathao city</span>
                <select
                  value={form.pathaoCityId}
                  onChange={(e) => setForm((c) => ({ ...c, pathaoCityId: e.target.value, pathaoZoneId: '', pathaoAreaId: '' }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                >
                  <option value="">Select city</option>
                  {cities.map((city) => (
                    <option key={city.id} value={city.id}>{city.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Pathao zone</span>
                <select
                  value={form.pathaoZoneId}
                  onChange={(e) => setForm((c) => ({ ...c, pathaoZoneId: e.target.value, pathaoAreaId: '' }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                >
                  <option value="">Select zone</option>
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>{zone.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Pathao area</span>
                <select
                  value={form.pathaoAreaId}
                  onChange={(e) => setForm((c) => ({ ...c, pathaoAreaId: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                >
                  <option value="">Select area</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>{area.name} {area.extra ? `- ${area.extra}` : ''}</option>
                  ))}
                </select>
              </label>
            </div>

            {suggestedStore && String(suggestedStore.id) !== String(form.pathaoStoreId || '') ? (
              <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Suggested linked store</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {suggestedStore.name} ({suggestedStore.id})
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {suggestedStore.address || 'No Pathao store address returned'}{suggestedStore.extra ? ` • ${suggestedStore.extra}` : ''}
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
                  {selectedStore.address || 'No store address available'}{selectedStore.extra ? ` • ${selectedStore.extra}` : ''}
                </p>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleCreateStore()}
                disabled={creatingStore || !selectedWarehouse || !form.pathaoCityId || !form.pathaoZoneId || !form.pathaoAreaId}
                className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-50"
              >
                {creatingStore ? <Loader2 className="animate-spin" size={16} /> : <Store size={16} />}
                <span>{creatingStore ? 'Creating store...' : 'Create Pathao store'}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleLoadStoreInfo()}
                disabled={loadingStoreInfo || !form.pathaoStoreId}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {loadingStoreInfo ? <Loader2 className="animate-spin" size={16} /> : <Building2 size={16} />}
                <span>{loadingStoreInfo ? 'Checking store...' : 'Verify linked store'}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleRunPriceTest()}
                disabled={testingPrice || !form.pathaoStoreId || !form.pathaoCityId || !form.pathaoZoneId}
                className="inline-flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
              >
                {testingPrice ? <Loader2 className="animate-spin" size={16} /> : <Truck size={16} />}
                <span>{testingPrice ? 'Running quote...' : 'Run price test'}</span>
              </button>
              {loadingMeta ? (
                <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-500">
                  <Loader2 className="animate-spin" size={14} />
                  <span>Loading Pathao reference data...</span>
                </div>
              ) : null}
            </div>

            {pathaoStoreInfo ? (
              <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
                <p className="font-semibold">Verified Pathao store</p>
                <p className="mt-1">{pathaoStoreInfo.store_name || pathaoStoreInfo.name || `Store ${form.pathaoStoreId}`}</p>
                <p className="mt-1 text-xs text-emerald-700">
                  Address: {pathaoStoreInfo.store_address || pathaoStoreInfo.address || 'Pathao returned no address'}
                </p>
                <p className="mt-1 text-xs text-emerald-700">
                  Status: {Number(pathaoStoreInfo.is_active) === 1 ? 'Active' : 'Pending or inactive'}
                </p>
              </div>
            ) : null}

            {pathaoPriceQuote ? (
              <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-900">
                <p className="font-semibold">Latest Pathao price test</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div className="rounded-xl bg-white/70 px-3 py-2">Final price: BDT {pathaoPriceQuote.final_price ?? pathaoPriceQuote.price ?? 'N/A'}</div>
                  <div className="rounded-xl bg-white/70 px-3 py-2">COD enabled: {Number(pathaoPriceQuote.cod_enabled) === 1 ? 'Yes' : 'No'}</div>
                  <div className="rounded-xl bg-white/70 px-3 py-2">Base price: BDT {pathaoPriceQuote.price ?? 'N/A'}</div>
                  <div className="rounded-xl bg-white/70 px-3 py-2">Additional charge: BDT {pathaoPriceQuote.additional_charge ?? 0}</div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void upsertWarehouse()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
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
