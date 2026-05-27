import React, { createContext, useContext, useState, useEffect } from 'react';
import { CartItem, Product } from '../types';
import { useUser } from './UserContext';
import api from '../lib/api';

interface Coupon {
  code: string;
  discount_type: 'percentage' | 'flat';
  discount_value: number;
  seller_id?: string | null;
  seller_name?: string | null;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (product: Product, quantity?: number) => void;
  setCartItemQuantity: (product: Product, quantity: number) => void;
  replaceCart: (nextItems: CartItem[]) => void;
  removeFromCart: (productId: number, variantKey?: string) => void;
  updateQuantity: (productId: number, quantity: number, variantKey?: string) => void;
  clearCart: () => void;
  applyCoupon: (coupon: Coupon) => void;
  removeCoupon: () => void;
  totalItems: number;
  subtotal: number;
  totalPrice: number;
  discountAmount: number;
  appliedCoupon: Coupon | null;
  isReady: boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = 'cart';
const CART_COUPON_STORAGE_KEY = 'cart_coupon';
const GUEST_CART_SNAPSHOT_KEY = 'guest_cart_snapshot';
const GUEST_CART_SNAPSHOT_OWNER_KEY = 'guest_cart_snapshot_owner';
const GUEST_CART_COUPON_SNAPSHOT_KEY = 'guest_cart_coupon_snapshot';

function readStoredCart() {
  if (typeof window === 'undefined') {
    return [] as CartItem[];
  }

  try {
    const saved = localStorage.getItem(CART_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch (error) {
    console.warn('Failed to hydrate cart from storage:', error);
    return [];
  }
}

function readStoredCoupon(): Coupon | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const saved = localStorage.getItem(CART_COUPON_STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.code !== 'string') {
      return null;
    }
    return parsed as Coupon;
  } catch (error) {
    console.warn('Failed to hydrate coupon from storage:', error);
    return null;
  }
}

function saveGuestCartSnapshot(userId: string, items: CartItem[], coupon: Coupon | null) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(GUEST_CART_SNAPSHOT_OWNER_KEY, userId);
  localStorage.setItem(GUEST_CART_SNAPSHOT_KEY, JSON.stringify(items));
  if (coupon) {
    localStorage.setItem(GUEST_CART_COUPON_SNAPSHOT_KEY, JSON.stringify(coupon));
  } else {
    localStorage.removeItem(GUEST_CART_COUPON_SNAPSHOT_KEY);
  }
}

function restoreGuestCartSnapshot() {
  if (typeof window === 'undefined') {
    return { items: [] as CartItem[], coupon: null as Coupon | null };
  }

  try {
    const savedItems = JSON.parse(localStorage.getItem(GUEST_CART_SNAPSHOT_KEY) || '[]');
    const savedCouponRaw = localStorage.getItem(GUEST_CART_COUPON_SNAPSHOT_KEY);
    const savedCoupon = savedCouponRaw ? (JSON.parse(savedCouponRaw) as Coupon) : null;
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(Array.isArray(savedItems) ? savedItems : []));
    if (savedCoupon) {
      localStorage.setItem(CART_COUPON_STORAGE_KEY, JSON.stringify(savedCoupon));
    } else {
      localStorage.removeItem(CART_COUPON_STORAGE_KEY);
    }
    localStorage.removeItem(GUEST_CART_SNAPSHOT_KEY);
    localStorage.removeItem(GUEST_CART_SNAPSHOT_OWNER_KEY);
    localStorage.removeItem(GUEST_CART_COUPON_SNAPSHOT_KEY);
    return { items: Array.isArray(savedItems) ? (savedItems as CartItem[]) : [], coupon: savedCoupon };
  } catch {
    localStorage.removeItem(GUEST_CART_SNAPSHOT_KEY);
    localStorage.removeItem(GUEST_CART_SNAPSHOT_OWNER_KEY);
    localStorage.removeItem(GUEST_CART_COUPON_SNAPSHOT_KEY);
    return { items: [] as CartItem[], coupon: null as Coupon | null };
  }
}

function buildCartItemKey(item: Pick<CartItem, 'id' | 'selected_variant_key'>) {
  return `${item.id}:${item.selected_variant_key || ''}`;
}

function mergeCartItems(serverItems: CartItem[], guestItems: CartItem[]) {
  const merged = new Map<string, CartItem>();

  for (const item of serverItems) {
    merged.set(buildCartItemKey(item), { ...item });
  }

  for (const item of guestItems) {
    const key = buildCartItemKey(item);
    const existing = merged.get(key);

    if (existing) {
      merged.set(key, {
        ...existing,
        ...item,
        quantity: Math.max(1, existing.quantity, item.quantity),
      });
      continue;
    }

    merged.set(key, { ...item, quantity: Math.max(1, item.quantity) });
  }

  return Array.from(merged.values());
}

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, user, isAuthenticated } = useUser(); // Access token from UserContext
  const [items, setItems] = useState<CartItem[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [hasSyncedServerCart, setHasSyncedServerCart] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    setItems(readStoredCart());
    setAppliedCoupon(readStoredCoupon());
    setIsReady(true);
  }, []);

  useEffect(() => {
    const syncGuestCartIntoAccount = async () => {
      if (!isReady) {
        return;
      }

      if (!isAuthenticated || !token || !user) {
        setHasSyncedServerCart(false);
        const snapshotOwner = typeof window !== 'undefined' ? localStorage.getItem(GUEST_CART_SNAPSHOT_OWNER_KEY) : null;
        if (snapshotOwner) {
          const restored = restoreGuestCartSnapshot();
          setItems(restored.items);
          setAppliedCoupon(restored.coupon);
        } else {
          setItems(readStoredCart());
          setAppliedCoupon(readStoredCoupon());
        }
        return;
      }

      const guestItems = readStoredCart();
      const guestCoupon = readStoredCoupon();
      const existingSnapshotOwner = typeof window !== 'undefined' ? localStorage.getItem(GUEST_CART_SNAPSHOT_OWNER_KEY) : null;
      if (existingSnapshotOwner !== String(user.id)) {
        saveGuestCartSnapshot(String(user.id), guestItems, guestCoupon);
      }

      try {
        const res = await api.get('/cart');
        const serverItems = Array.isArray(res.data?.items) ? (res.data.items as CartItem[]) : [];
        const mergedItems = mergeCartItems(serverItems, guestItems);
        const needsServerUpdate =
          mergedItems.length !== serverItems.length ||
          mergedItems.some((item, index) => {
            const serverItem = serverItems[index];
            return !serverItem || buildCartItemKey(serverItem) !== buildCartItemKey(item) || serverItem.quantity !== item.quantity;
          });

        if (needsServerUpdate) {
          await api.put('/cart', { items: mergedItems });
        }

        setItems(mergedItems);
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(mergedItems));
      } catch (error) {
        const status = (error as any)?.response?.status;
        if (status !== 401 && status !== 403) {
          console.warn('Server cart load failed:', error);
        }
        setItems(guestItems);
      } finally {
        setHasSyncedServerCart(true);
      }
    };

    void syncGuestCartIntoAccount();
  }, [isAuthenticated, isReady, token, user]);

  // Hybrid: Optimistic localStorage + API sync
  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (items.length === 0 && appliedCoupon) {
      setAppliedCoupon(null);
      return;
    }

    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    if (appliedCoupon) {
      localStorage.setItem(CART_COUPON_STORAGE_KEY, JSON.stringify(appliedCoupon));
    } else {
      localStorage.removeItem(CART_COUPON_STORAGE_KEY);
    }

    if (isAuthenticated && token && user && hasSyncedServerCart) {
      void (async () => {
        try {
          await api.put('/cart', { items });
        } catch (error) {
          const status = (error as any)?.response?.status;
          if (status !== 401 && status !== 403) {
            console.warn('Cart sync failed (offline fallback):', error);
          }
        }
      })();
    }
  }, [appliedCoupon, hasSyncedServerCart, isAuthenticated, isReady, items, token, user]);

  const addToCart = (product: Product, quantity: number = 1) => {
    setItems(prev => {
      const existing = prev.find(
        item => item.id === product.id && (item.selected_variant_key || '') === (product.selected_variant_key || ''),
      );
      if (existing) {
        return prev.map(item =>
          item.id === product.id && (item.selected_variant_key || '') === (product.selected_variant_key || '')
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { ...product, quantity }];
    });
  };

  const setCartItemQuantity = (product: Product, quantity: number) => {
    const normalizedQuantity = Math.max(1, quantity);
    setItems(prev => {
      const existing = prev.find(
        item => item.id === product.id && (item.selected_variant_key || '') === (product.selected_variant_key || ''),
      );
      if (existing) {
        return prev.map(item =>
          item.id === product.id && (item.selected_variant_key || '') === (product.selected_variant_key || '')
            ? { ...item, quantity: normalizedQuantity }
            : item
        );
      }
      return [...prev, { ...product, quantity: normalizedQuantity }];
    });
  };

  const replaceCart = (nextItems: CartItem[]) => {
    setItems(
      Array.isArray(nextItems)
        ? nextItems.map((item) => ({
            ...item,
            quantity: Math.max(1, Number(item.quantity) || 1),
          }))
        : [],
    );
    setAppliedCoupon(null);
  };

  const removeFromCart = (productId: number, variantKey?: string) => {
    setItems(prev => prev.filter(item => !(item.id === productId && (item.selected_variant_key || '') === (variantKey || ''))));
  };

  const updateQuantity = (productId: number, quantity: number, variantKey?: string) => {
    if (quantity < 1) return;
    setItems(prev => prev.map(item =>
      item.id === productId && (item.selected_variant_key || '') === (variantKey || '') ? { ...item, quantity } : item
    ));
  };

  const clearCart = () => {
    setItems([]);
    setAppliedCoupon(null);
  };

  const applyCoupon = (coupon: Coupon) => setAppliedCoupon(coupon);
  const removeCoupon = () => setAppliedCoupon(null);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  let discountAmount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.discount_type === 'percentage') {
      discountAmount = (subtotal * appliedCoupon.discount_value) / 100;
    } else {
      discountAmount = appliedCoupon.discount_value;
    }
  }

  const totalPrice = Math.max(0, subtotal - discountAmount);

  return (
    <CartContext.Provider value={{ 
      items, 
      addToCart, 
      setCartItemQuantity,
      replaceCart,
      removeFromCart, 
      updateQuantity, 
      clearCart, 
      applyCoupon,
      removeCoupon,
      totalItems, 
      subtotal,
      totalPrice,
      discountAmount,
      appliedCoupon,
      isReady
    }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within a CartProvider');
  return context;
};
