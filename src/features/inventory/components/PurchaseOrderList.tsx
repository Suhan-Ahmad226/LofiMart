import React from 'react';
import { useInventoryState } from '@/src/context/InventoryContext';
import toast from 'react-hot-toast';
import { useInventoryActions } from '@/src/hooks/useInventoryActions';

const PurchaseOrderList: React.FC = () => {
  const { purchaseOrders, warehouses, inventory, suppliers } = useInventoryState();
  const { createPO, cancelPO } = useInventoryActions();
  const [focusedProductId, setFocusedProductId] = React.useState('');
  const [focusedPurchaseOrderId, setFocusedPurchaseOrderId] = React.useState('');
  const [pendingCancelId, setPendingCancelId] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [poForm, setPoForm] = React.useState({
    supplierId: '',
    quantity: '',
    unitCost: '',
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const nextProductId = params.get('product');
    const nextSection = params.get('section');
    const nextPurchaseOrderId = params.get('po');

    if (nextProductId) {
      setFocusedProductId(nextProductId);
    }
    if (nextPurchaseOrderId) {
      setFocusedPurchaseOrderId(nextPurchaseOrderId);
    }

    if (nextSection === 'po' || nextProductId) {
      const timeoutId = window.setTimeout(() => {
        document.getElementById('inventory-po-section')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 150);

      return () => window.clearTimeout(timeoutId);
    }
  }, []);

  const contextualInventoryItem = React.useMemo(
    () => inventory.find((item) => String(item.productId) === focusedProductId),
    [focusedProductId, inventory],
  );

  const contextualWarehouse = React.useMemo(
    () => warehouses.find((warehouse) => warehouse.id === contextualInventoryItem?.warehouseId),
    [contextualInventoryItem?.warehouseId, warehouses],
  );

  React.useEffect(() => {
    if (!focusedPurchaseOrderId) return;

    const matched = purchaseOrders.find((purchaseOrder) => purchaseOrder.id === focusedPurchaseOrderId);
    if (!matched) return;

    const timeoutId = window.setTimeout(() => {
      document.getElementById(`inventory-po-${matched.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [focusedPurchaseOrderId, purchaseOrders]);

  React.useEffect(() => {
    if (!suppliers[0]?.id) return;
    setPoForm((current) => (current.supplierId ? current : { ...current, supplierId: suppliers[0].id }));
  }, [suppliers]);

  React.useEffect(() => {
    if (!focusedProductId) return;
    setPoForm((current) => ({
      ...current,
      quantity: current.quantity || String(Math.max(contextualInventoryItem?.reorderLevel ?? 5, 1)),
    }));
  }, [contextualInventoryItem?.reorderLevel, focusedProductId]);

  const handleCreate = async () => {
    if (!focusedProductId) {
      toast.error('Open the restock workflow from a low-stock product first.');
      return;
    }
    if (!contextualInventoryItem?.warehouseId) {
      toast.error('This product is missing a warehouse link.');
      return;
    }

    const supplierId = poForm.supplierId.trim();
    const quantity = Number.parseInt(poForm.quantity, 10);
    const unitCost = Number(poForm.unitCost);
    if (!supplierId) {
      toast.error('Supplier is required.');
      return;
    }
    if (Number.isNaN(quantity) || quantity <= 0) {
      toast.error('Enter a valid restock quantity.');
      return;
    }
    if (Number.isNaN(unitCost) || unitCost < 0) {
      toast.error('Enter a valid estimated unit cost.');
      return;
    }

    try {
      setSubmitting(true);
      const created = await createPO({
        supplierId,
        warehouseId: contextualInventoryItem.warehouseId,
        items: [{ productId: focusedProductId, quantity, unitCost }],
        status: 'pending',
        expectedDelivery: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setPoForm((current) => ({ ...current, quantity: '', unitCost: '' }));
      if (created?.id) {
        setFocusedPurchaseOrderId(created.id);
      }
      toast.success('Purchase order created.');
    } catch (error) {
      toast.error('Failed to create purchase order.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    await cancelPO(id);
    setPendingCancelId('');
  };

  return (
    <div id="inventory-po-section" className="mt-6 p-4">
      <h2 className="mb-2 text-xl font-semibold">Purchase Orders</h2>
      {focusedProductId ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">Restock workflow ready for product {focusedProductId}</p>
          <p className="mt-1">
            {contextualWarehouse
              ? `Suggested pickup warehouse: ${contextualWarehouse.name}`
              : 'Select a supplier to create a purchase order for this product.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">
            <a href="/admin/inventory?section=suppliers" className="text-slate-700 hover:text-primary hover:underline">
              Open suppliers
            </a>
            <a href={`/admin/inventory?product=${encodeURIComponent(focusedProductId)}`} className="text-slate-700 hover:text-primary hover:underline">
              Open stock row
            </a>
          </div>
        </div>
      ) : null}
      {focusedProductId ? (
        <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1.2fr_1fr_1fr_auto]">
          <select
            value={poForm.supplierId}
            onChange={(event) => setPoForm((current) => ({ ...current, supplierId: event.target.value }))}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
          >
            <option value="">Select supplier</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
          <input
            value={poForm.quantity}
            onChange={(event) => setPoForm((current) => ({ ...current, quantity: event.target.value }))}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
            placeholder="Restock quantity"
          />
          <input
            value={poForm.unitCost}
            onChange={(event) => setPoForm((current) => ({ ...current, unitCost: event.target.value }))}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
            placeholder="Estimated unit cost"
          />
          <button
            className="rounded bg-slate-900 px-3 py-1 text-white disabled:opacity-60"
            onClick={() => void handleCreate()}
            disabled={submitting}
          >
            {submitting ? 'Creating...' : 'Create PO'}
          </button>
        </div>
      ) : (
        <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Open this section from a low-stock product or the restock queue to create a purchase order with the correct product and warehouse context.
        </p>
      )}
      {purchaseOrders.length === 0 ? (
        <p className="mt-4 text-gray-500">No purchase orders.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {purchaseOrders.map((purchaseOrder) => (
            <li
              id={`inventory-po-${purchaseOrder.id}`}
              key={purchaseOrder.id}
              className={`flex items-center justify-between rounded border p-2 transition-colors ${
                purchaseOrder.id === focusedPurchaseOrderId ? 'border-indigo-300 bg-indigo-50 ring-2 ring-indigo-200' : ''
              }`}
            >
              <span>
                PO #{purchaseOrder.id.slice(0, 8)} - {purchaseOrder.status}
              </span>
              {purchaseOrder.status !== 'cancelled' ? (
                pendingCancelId === purchaseOrder.id ? (
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <button className="text-red-600" onClick={() => void handleCancel(purchaseOrder.id)}>
                      Confirm cancel
                    </button>
                    <button className="text-slate-500" onClick={() => setPendingCancelId('')}>
                      Keep
                    </button>
                  </div>
                ) : (
                  <button className="text-red-600" onClick={() => setPendingCancelId(purchaseOrder.id)}>
                    Cancel
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default PurchaseOrderList;
