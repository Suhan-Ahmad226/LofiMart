import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, MapPin, Phone, RefreshCw, Save, Store, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useInventoryState } from '../../context/InventoryContext';
import { useInventoryActions } from '../../hooks/useInventoryActions';
import { inventoryApi } from '../../services/inventoryApi';

type PathaoOption = {
  id: number;
  name: string;
  extra?: string;
};

type PathaoFormState = {
  contactName: string;
  secondaryContact: string;
  otpNumber: string;
  cityId: string;
  zoneId: string;
  areaId: string;
  storeId: string;
  insideDhakaFee: string;
  outsideDhakaFee: string;
  insideDhakaEta: string;
  outsideDhakaEta: string;
  freeShippingThresholdOverride: string;
};

const WarehouseList: React.FC = () => {
  const { warehouses } = useInventoryState();
  const { addWarehouse, removeWarehouse, loadAll } = useInventoryActions();
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [newWarehouse, setNewWarehouse] = useState({
    name: '',
    address: '',
    city: 'Dhaka',
    postalCode: '1200',
  });
  const [creatingWarehouse, setCreatingWarehouse] = useState(false);
  const [pendingDeleteWarehouseId, setPendingDeleteWarehouseId] = useState('');
  const [form, setForm] = useState<PathaoFormState>({
    contactName: '',
    secondaryContact: '',
    otpNumber: '',
    cityId: '',
    zoneId: '',
    areaId: '',
    storeId: '',
    insideDhakaFee: '',
    outsideDhakaFee: '',
    insideDhakaEta: '1-2 business days',
    outsideDhakaEta: '2-4 business days',
    freeShippingThresholdOverride: '',
  });
  const [cities, setCities] = useState<PathaoOption[]>([]);
  const [zones, setZones] = useState<PathaoOption[]>([]);
  const [areas, setAreas] = useState<PathaoOption[]>([]);
  const [stores, setStores] = useState<PathaoOption[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingStore, setCreatingStore] = useState(false);
  const [focusedWarehouseId, setFocusedWarehouseId] = useState('');

  const handleAddWarehouse = async () => {
    const name = newWarehouse.name.trim();
    const address = newWarehouse.address.trim();
    const city = newWarehouse.city.trim() || 'Dhaka';
    const postalCode = newWarehouse.postalCode.trim() || '1200';
    if (!name) {
      toast.error('Warehouse name is required.');
      return;
    }
    if (!address) {
      toast.error('Warehouse address is required.');
      return;
    }

    const now = new Date().toISOString();
    try {
      setCreatingWarehouse(true);
      await addWarehouse({
        name,
        location: {
          address,
          city,
          country: 'Bangladesh',
          postalCode,
        },
        createdAt: now,
        updatedAt: now,
      });
      setNewWarehouse({
        name: '',
        address: '',
        city: 'Dhaka',
        postalCode: '1200',
      });
      toast.success('Warehouse created. Update its address and Pathao mapping next.');
    } catch {
      toast.error('Failed to create warehouse.');
    } finally {
      setCreatingWarehouse(false);
    }
  };

  const handleRemoveWarehouse = async (warehouseId: string) => {
    try {
      await removeWarehouse(warehouseId);
      toast.success('Warehouse removed.');
      setPendingDeleteWarehouseId('');
      if (selectedWarehouseId === warehouseId) {
        setSelectedWarehouseId('');
      }
    } catch {
      toast.error('Failed to remove warehouse.');
    }
  };

  const selectedWarehouse = useMemo(
    () => warehouses.find((warehouse) => warehouse.id === selectedWarehouseId) || warehouses[0] || null,
    [selectedWarehouseId, warehouses],
  );

  useEffect(() => {
    if (!selectedWarehouseId && warehouses[0]?.id) {
      setSelectedWarehouseId(warehouses[0].id);
    }
  }, [selectedWarehouseId, warehouses]);

  useEffect(() => {
    if (typeof window === 'undefined' || warehouses.length === 0) return;

    const warehouseId = new URLSearchParams(window.location.search).get('warehouse');
    if (!warehouseId) return;

    const matched = warehouses.find((warehouse) => warehouse.id === warehouseId);
    if (!matched) return;

    setSelectedWarehouseId(matched.id);
    setFocusedWarehouseId(matched.id);

    window.requestAnimationFrame(() => {
      document.getElementById(`admin-warehouse-${matched.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [warehouses]);

  useEffect(() => {
    if (!selectedWarehouse) return;

    setForm({
      contactName: selectedWarehouse.contact?.name || '',
      secondaryContact: selectedWarehouse.contact?.secondaryPhone || '',
      otpNumber: selectedWarehouse.contact?.otpNumber || '',
      cityId: selectedWarehouse.pathao?.cityId ? String(selectedWarehouse.pathao.cityId) : '',
      zoneId: selectedWarehouse.pathao?.zoneId ? String(selectedWarehouse.pathao.zoneId) : '',
      areaId: selectedWarehouse.pathao?.areaId ? String(selectedWarehouse.pathao.areaId) : '',
      storeId: selectedWarehouse.pathao?.storeId ? String(selectedWarehouse.pathao.storeId) : '',
      insideDhakaFee: selectedWarehouse.shipping?.insideDhakaFee != null ? String(selectedWarehouse.shipping.insideDhakaFee) : '',
      outsideDhakaFee: selectedWarehouse.shipping?.outsideDhakaFee != null ? String(selectedWarehouse.shipping.outsideDhakaFee) : '',
      insideDhakaEta: selectedWarehouse.shipping?.insideDhakaEta || '1-2 business days',
      outsideDhakaEta: selectedWarehouse.shipping?.outsideDhakaEta || '2-4 business days',
      freeShippingThresholdOverride:
        selectedWarehouse.shipping?.freeShippingThresholdOverride != null
          ? String(selectedWarehouse.shipping.freeShippingThresholdOverride)
          : '',
    });
  }, [selectedWarehouse]);

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
          })),
        );
      } catch (error) {
        toast.error('Failed to load Pathao cities or stores.');
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
    let ignore = false;

    const loadZones = async () => {
      const cityId = Number(form.cityId);
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
  }, [form.cityId]);

  useEffect(() => {
    let ignore = false;

    const loadAreas = async () => {
      const zoneId = Number(form.zoneId);
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
  }, [form.zoneId]);

  const handleSave = async () => {
    if (!selectedWarehouse) return;

    try {
      setSaving(true);
      await inventoryApi.updateWarehouse(selectedWarehouse.id, {
        name: selectedWarehouse.name,
        location: selectedWarehouse.location,
        contact: selectedWarehouse.contact,
        pathao: selectedWarehouse.pathao,
        shipping: {
          insideDhakaFee: form.insideDhakaFee ? Number(form.insideDhakaFee) : undefined,
          outsideDhakaFee: form.outsideDhakaFee ? Number(form.outsideDhakaFee) : undefined,
          insideDhakaEta: form.insideDhakaEta.trim() || undefined,
          outsideDhakaEta: form.outsideDhakaEta.trim() || undefined,
          freeShippingThresholdOverride: form.freeShippingThresholdOverride ? Number(form.freeShippingThresholdOverride) : undefined,
        },
        capacity: selectedWarehouse.capacity,
        createdAt: selectedWarehouse.createdAt,
        updatedAt: new Date().toISOString(),
      });
      await inventoryApi.updateWarehousePathaoConfig(selectedWarehouse.id, {
        contactName: form.contactName,
        secondaryContact: form.secondaryContact,
        otpNumber: form.otpNumber,
        cityId: form.cityId ? Number(form.cityId) : null,
        zoneId: form.zoneId ? Number(form.zoneId) : null,
        areaId: form.areaId ? Number(form.areaId) : null,
        storeId: form.storeId ? Number(form.storeId) : null,
      });
      await loadAll();
      toast.success('Warehouse courier and shipping configuration saved.');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to save warehouse shipping configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateStore = async () => {
    if (!selectedWarehouse) return;

    try {
      setCreatingStore(true);
      const payload = await inventoryApi.createPathaoStore({ warehouseId: selectedWarehouse.id });
      const nextStoreId = Number(payload?.store_id || 0);
      if (nextStoreId) {
        setForm((current) => ({ ...current, storeId: String(nextStoreId) }));
      }
      toast.success(nextStoreId ? `Pathao store created and linked: ${nextStoreId}` : 'Pathao store request sent successfully.');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to create Pathao store.');
    } finally {
      setCreatingStore(false);
    }
  };

  if (warehouses.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Warehouses</h2>
        <p className="mt-3 text-sm text-slate-500">No warehouses configured yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-3xl border border-black/5 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Warehouse and Pathao Mapping</h2>
          <p className="mt-1 text-sm text-slate-500">
            Link each seller pickup location with Pathao city, zone, area, and merchant store for live bookings.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-rose-600">
          <Truck size={14} />
          <span>Pathao Ready</span>
        </div>
      </div>

      <div className="flex justify-end">
        <div className="grid w-full gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1.2fr_1.8fr_1fr_0.8fr_auto]">
          <input
            value={newWarehouse.name}
            onChange={(event) => setNewWarehouse((current) => ({ ...current, name: event.target.value }))}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
            placeholder="Warehouse name"
          />
          <input
            value={newWarehouse.address}
            onChange={(event) => setNewWarehouse((current) => ({ ...current, address: event.target.value }))}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
            placeholder="Pickup address"
          />
          <input
            value={newWarehouse.city}
            onChange={(event) => setNewWarehouse((current) => ({ ...current, city: event.target.value }))}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
            placeholder="City"
          />
          <input
            value={newWarehouse.postalCode}
            onChange={(event) => setNewWarehouse((current) => ({ ...current, postalCode: event.target.value }))}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
            placeholder="Postal code"
          />
          <button
            type="button"
            onClick={() => void handleAddWarehouse()}
            disabled={creatingWarehouse}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {creatingWarehouse ? 'Adding...' : 'Add Warehouse'}
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-3">
          {warehouses.map((warehouse) => {
            const active = warehouse.id === selectedWarehouse?.id;
            const focused = warehouse.id === focusedWarehouseId;
            return (
              <button
                id={`admin-warehouse-${warehouse.id}`}
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
                      <span>{warehouse.location.address || 'Address not configured yet'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Phone size={14} />
                      <span>{warehouse.contact?.phone || 'No primary phone'}</span>
                    </div>
                  </div>
                  <div className="space-y-2 text-right">
                    <div className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${warehouse.pathao?.storeId ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {warehouse.pathao?.storeId ? `Store ${warehouse.pathao.storeId}` : 'Store not linked'}
                    </div>
                    <div className="text-xs text-slate-400">
                      {warehouse.pathao?.cityId && warehouse.pathao?.zoneId && warehouse.pathao?.areaId ? 'Area mapped' : 'Area mapping pending'}
                    </div>
                    <div className="text-xs text-slate-400">
                      {warehouse.shipping?.insideDhakaFee != null && warehouse.shipping?.outsideDhakaFee != null ? 'Rules ready' : 'Rules pending'}
                    </div>
                    {focused ? (
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600">
                        Focused
                      </div>
                    ) : null}
                    {pendingDeleteWarehouseId === warehouse.id ? (
                      <div className="flex items-center justify-end gap-2 text-[10px] font-bold uppercase tracking-[0.16em]">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleRemoveWarehouse(warehouse.id);
                          }}
                          className="text-rose-600 hover:text-rose-700"
                        >
                          Confirm remove
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setPendingDeleteWarehouseId('');
                          }}
                          className="text-slate-500 hover:text-slate-700"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setPendingDeleteWarehouseId(warehouse.id);
                        }}
                        className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-500 hover:text-rose-600"
                      >
                        Remove
                      </button>
                    )}
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
          })}
        </div>

        {selectedWarehouse ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{selectedWarehouse.name}</h3>
                <p className="mt-1 text-sm text-slate-500">Configure pickup contact, Pathao area mapping, and merchant store link.</p>
              </div>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <RefreshCw size={14} />
                <span>Reload data</span>
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Contact name</span>
                <input
                  value={form.contactName}
                  onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                  placeholder="Pickup contact person"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Secondary phone</span>
                <input
                  value={form.secondaryContact}
                  onChange={(event) => setForm((current) => ({ ...current, secondaryContact: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                  placeholder="01XXXXXXXXX"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">OTP number</span>
                <input
                  value={form.otpNumber}
                  onChange={(event) => setForm((current) => ({ ...current, otpNumber: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                  placeholder="01XXXXXXXXX"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Linked store ID</span>
                <select
                  value={form.storeId}
                  onChange={(event) => setForm((current) => ({ ...current, storeId: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                >
                  <option value="">No linked Pathao store</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name} ({store.id}) {store.extra ? `- ${store.extra}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">City</span>
                <select
                  value={form.cityId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      cityId: event.target.value,
                      zoneId: '',
                      areaId: '',
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                >
                  <option value="">Select city</option>
                  {cities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Zone</span>
                <select
                  value={form.zoneId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      zoneId: event.target.value,
                      areaId: '',
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                >
                  <option value="">Select zone</option>
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Area</span>
                <select
                  value={form.areaId}
                  onChange={(event) => setForm((current) => ({ ...current, areaId: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                >
                  <option value="">Select area</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name} {area.extra ? `- ${area.extra}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 rounded-2xl border border-rose-100 bg-white p-4 text-sm text-slate-600">
              <div className="flex items-center gap-2 font-semibold text-rose-600">
                <Store size={16} />
                <span>Pathao store sync</span>
              </div>
              <p className="mt-2">
                Save the city, zone, and area first. Then you can auto-create a Pathao store directly from this warehouse and link the returned `store_id`.
              </p>
            </div>

            <div className="mt-5 rounded-2xl border border-sky-100 bg-white p-4">
              <div className="flex items-center gap-2 font-semibold text-sky-700">
                <Truck size={16} />
                <span>Shipping rules</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Configure warehouse-specific delivery fee and ETA so checkout can show a more realistic preview.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span className="font-medium text-slate-700">Inside Dhaka fee (BDT)</span>
                  <input
                    value={form.insideDhakaFee}
                    onChange={(event) => setForm((current) => ({ ...current, insideDhakaFee: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                    placeholder="60"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="font-medium text-slate-700">Outside Dhaka fee (BDT)</span>
                  <input
                    value={form.outsideDhakaFee}
                    onChange={(event) => setForm((current) => ({ ...current, outsideDhakaFee: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                    placeholder="120"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="font-medium text-slate-700">Inside Dhaka ETA</span>
                  <input
                    value={form.insideDhakaEta}
                    onChange={(event) => setForm((current) => ({ ...current, insideDhakaEta: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                    placeholder="1-2 business days"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="font-medium text-slate-700">Outside Dhaka ETA</span>
                  <input
                    value={form.outsideDhakaEta}
                    onChange={(event) => setForm((current) => ({ ...current, outsideDhakaEta: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                    placeholder="2-4 business days"
                  />
                </label>
                <label className="space-y-2 text-sm md:col-span-2">
                  <span className="font-medium text-slate-700">Free shipping threshold override (BDT)</span>
                  <input
                    value={form.freeShippingThresholdOverride}
                    onChange={(event) => setForm((current) => ({ ...current, freeShippingThresholdOverride: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                    placeholder="Leave blank to use marketplace default"
                  />
                </label>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                <span>{saving ? 'Saving...' : 'Save warehouse config'}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleCreateStore()}
                disabled={creatingStore || !form.cityId || !form.zoneId || !form.areaId}
                className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {creatingStore ? <Loader2 className="animate-spin" size={16} /> : <Store size={16} />}
                <span>{creatingStore ? 'Creating store...' : 'Create Pathao store'}</span>
              </button>
            </div>

            {loadingMeta ? (
              <div className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-slate-500">
                <Loader2 className="animate-spin" size={14} />
                <span>Loading Pathao reference data...</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default WarehouseList;
