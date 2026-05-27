import { useInventoryDispatch } from '../context/InventoryContext';
import { inventoryApi } from '../services/inventoryApi';
import { Warehouse, Supplier, InventoryItem, PurchaseOrder } from '../types/inventory';

export function useInventoryActions() {
  const dispatch = useInventoryDispatch();

  const loadAll = async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const [warehouses, suppliers, inventory, purchaseOrders] = await Promise.all([
        inventoryApi.fetchWarehouses(),
        inventoryApi.fetchSuppliers(),
        inventoryApi.fetchInventory(),
        inventoryApi.fetchPurchaseOrders(),
      ]);
      dispatch({
        type: 'SET_ALL',
        payload: {
          warehouses,
          suppliers,
          inventory,
          purchaseOrders,
        },
      });
    } catch (err: any) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const addWarehouse = async (warehouse: Omit<Warehouse, 'id'>) => {
    const createdWarehouse = await inventoryApi.createWarehouse(warehouse);
    dispatch({ type: 'ADD_WAREHOUSE', payload: createdWarehouse });
  };

  const removeWarehouse = async (id: string) => {
    await inventoryApi.deleteWarehouse(id);
    dispatch({ type: 'REMOVE_WAREHOUSE', payload: { id } });
  };

  const addSupplier = async (supplier: Supplier) => {
    await inventoryApi.createSupplier(supplier);
    dispatch({ type: 'ADD_SUPPLIER', payload: supplier });
  };

  const addInventoryItem = async (item: InventoryItem) => {
    await inventoryApi.createInventoryItem(item);
    dispatch({ type: 'ADD_INVENTORY_ITEM', payload: item });
  };

  const adjustQuantity = async (id: string, delta: number) => {
    await inventoryApi.adjustInventoryQuantity(id, delta);
    dispatch({ type: 'ADJUST_INVENTORY_QUANTITY', payload: { id, delta } });
  };

  const createPO = async (po: Omit<PurchaseOrder, 'id'>) => {
    const created = await inventoryApi.createPurchaseOrder(po);
    dispatch({ type: 'CREATE_PO', payload: created });
    return created;
  };

  const cancelPO = async (id: string) => {
    await inventoryApi.cancelPurchaseOrder(id);
    dispatch({ type: 'CANCEL_PO', payload: { id } });
  };

  return {
    loadAll,
    addWarehouse,
    removeWarehouse,
    addSupplier,
    addInventoryItem,
    adjustQuantity,
    createPO,
    cancelPO,
  };
}
