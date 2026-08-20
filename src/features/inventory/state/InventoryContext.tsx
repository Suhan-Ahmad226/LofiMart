import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import {
  InventoryContextState,
  InventoryContextActions,
  Warehouse,
  Supplier,
  InventoryItem,
  PurchaseOrder,
} from '../../../types/inventory';
import { inventoryApi } from '@/features/inventory/services/inventoryApi';
import { useEffect } from 'react';
import { useUser } from '../../../features/shared/state/UserContext';

// initial state
const initialState: InventoryContextState = {
  warehouses: [],
  suppliers: [],
  inventory: [],
  purchaseOrders: [],
  loading: false,
  error: null,
};

// action types
type Action =
  | {
      type: 'SET_ALL';
      payload: {
        warehouses: Warehouse[];
        suppliers: Supplier[];
        inventory: InventoryItem[];
        purchaseOrders: PurchaseOrder[];
      };
    }
  | { type: 'ADD_WAREHOUSE'; payload: Warehouse }
  | { type: 'UPDATE_WAREHOUSE'; payload: Partial<Warehouse> & { id: string } }
  | { type: 'REMOVE_WAREHOUSE'; payload: { id: string } }
  | { type: 'ADD_SUPPLIER'; payload: Supplier }
  | { type: 'UPDATE_SUPPLIER'; payload: Partial<Supplier> & { id: string } }
  | { type: 'REMOVE_SUPPLIER'; payload: { id: string } }
  | { type: 'ADD_INVENTORY_ITEM'; payload: InventoryItem }
  | { type: 'UPDATE_INVENTORY_ITEM'; payload: Partial<InventoryItem> & { id: string } }
  | { type: 'ADJUST_INVENTORY_QUANTITY'; payload: { id: string; delta: number } }
  | { type: 'CREATE_PO'; payload: PurchaseOrder }
  | { type: 'UPDATE_PO'; payload: Partial<PurchaseOrder> & { id: string } }
  | { type: 'CANCEL_PO'; payload: { id: string } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null };

// reducer
function inventoryReducer(state: InventoryContextState, action: Action): InventoryContextState {
  switch (action.type) {
    case 'SET_ALL':
      return {
        ...state,
        warehouses: action.payload.warehouses,
        suppliers: action.payload.suppliers,
        inventory: action.payload.inventory,
        purchaseOrders: action.payload.purchaseOrders,
        error: null,
      };
    case 'ADD_WAREHOUSE':
      return { ...state, warehouses: [...state.warehouses, action.payload] };
    case 'UPDATE_WAREHOUSE':
      return {
        ...state,
        warehouses: state.warehouses.map((w) =>
          w.id === action.payload.id ? { ...w, ...action.payload } : w
        ),
      };
    case 'REMOVE_WAREHOUSE':
      return {
        ...state,
        warehouses: state.warehouses.filter((w) => w.id !== action.payload.id),
      };
    case 'ADD_SUPPLIER':
      return { ...state, suppliers: [...state.suppliers, action.payload] };
    case 'UPDATE_SUPPLIER':
      return {
        ...state,
        suppliers: state.suppliers.map((s) =>
          s.id === action.payload.id ? { ...s, ...action.payload } : s
        ),
      };
    case 'REMOVE_SUPPLIER':
      return {
        ...state,
        suppliers: state.suppliers.filter((s) => s.id !== action.payload.id),
      };
    case 'ADD_INVENTORY_ITEM':
      return { ...state, inventory: [...state.inventory, action.payload] };
    case 'UPDATE_INVENTORY_ITEM':
      return {
        ...state,
        inventory: state.inventory.map((i) =>
          i.id === action.payload.id ? { ...i, ...action.payload } : i
        ),
      };
    case 'ADJUST_INVENTORY_QUANTITY':
      return {
        ...state,
        inventory: state.inventory.map((i) =>
          i.id === action.payload.id
            ? { ...i, quantity: i.quantity + action.payload.delta }
            : i
        ),
      };
    case 'CREATE_PO':
      return { ...state, purchaseOrders: [...state.purchaseOrders, action.payload] };
    case 'UPDATE_PO':
      return {
        ...state,
        purchaseOrders: state.purchaseOrders.map((p) =>
          p.id === action.payload.id ? { ...p, ...action.payload } : p
        ),
      };
    case 'CANCEL_PO':
      return {
        ...state,
        purchaseOrders: state.purchaseOrders.map((p) =>
          p.id === action.payload.id ? { ...p, status: 'cancelled' } : p
        ),
      };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    default:
      return state;
  }
}

// context
const InventoryStateContext = createContext<InventoryContextState | undefined>(undefined);
const InventoryDispatchContext = createContext<React.Dispatch<Action> | undefined>(undefined);

interface InventoryProviderProps {
  children: ReactNode;
}

export const InventoryProvider: React.FC<InventoryProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(inventoryReducer, initialState);
  const { isAuthenticated, user, token } = useUser();

  // Auto-load real data on mount
  useEffect(() => {
    const canAccessInventory =
      isAuthenticated && !!token && (user?.role === 'admin' || user?.role === 'seller');

    if (!canAccessInventory) {
      dispatch({ type: 'SET_LOADING', payload: false });
      dispatch({ type: 'SET_ERROR', payload: null });
      return;
    }

    const loadInventoryData = async () => {
      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        const [warehouses, suppliers, inventory, purchaseOrders] = await Promise.all([
          inventoryApi.fetchWarehouses(),
          inventoryApi.fetchSuppliers(),
          inventoryApi.fetchInventory(),
          inventoryApi.fetchPurchaseOrders()
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
      } catch (error) {
        dispatch({ type: 'SET_ERROR', payload: 'Failed to load inventory data' });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    void loadInventoryData();
  }, [isAuthenticated, token, user?.role]);

  return (
    <InventoryStateContext.Provider value={state}>
      <InventoryDispatchContext.Provider value={dispatch}>
        {children}
      </InventoryDispatchContext.Provider>
    </InventoryStateContext.Provider>
  );
};

// hooks
export const useInventoryState = (): InventoryContextState => {
  const context = useContext(InventoryStateContext);
  if (context === undefined) {
    throw new Error('useInventoryState must be used within InventoryProvider');
  }
  return context;
};

export const useInventoryDispatch = (): React.Dispatch<Action> => {
  const context = useContext(InventoryDispatchContext);
  if (context === undefined) {
    throw new Error('useInventoryDispatch must be used within InventoryProvider');
  }
  return context;
};
