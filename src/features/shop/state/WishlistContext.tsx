import React, { createContext, useContext, useState, useEffect } from 'react';
import { Product } from '../../../types';
import { useUser } from '../../../features/shared/state/UserContext';
import toast from '@/lib/toast';

interface WishlistContextType {
  items: Product[];
  addToWishlist: (product: Product) => Promise<void>;
  removeFromWishlist: (productId: Product['id']) => Promise<void>;
  isInWishlist: (productId: Product['id']) => boolean;
  toggleWishlist: (product: Product) => Promise<void>;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

const WISHLIST_STORAGE_KEY = 'wishlist';
const GUEST_WISHLIST_SNAPSHOT_KEY = 'guest_wishlist_snapshot';
const GUEST_WISHLIST_SNAPSHOT_OWNER_KEY = 'guest_wishlist_snapshot_owner';

function dedupeWishlist(products: Product[]) {
  const seen = new Set<Product['id']>();
  return products.filter((product) => {
    if (seen.has(product.id)) {
      return false;
    }
    seen.add(product.id);
    return true;
  });
}

function saveGuestWishlistSnapshot(userId: string, items: Product[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(GUEST_WISHLIST_SNAPSHOT_OWNER_KEY, userId);
  localStorage.setItem(GUEST_WISHLIST_SNAPSHOT_KEY, JSON.stringify(dedupeWishlist(items)));
}

function restoreGuestWishlistSnapshot() {
  if (typeof window === 'undefined') {
    return [] as Product[];
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(GUEST_WISHLIST_SNAPSHOT_KEY) || '[]') as Product[];
    const restored = Array.isArray(parsed) ? dedupeWishlist(parsed) : [];
    localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(restored));
    localStorage.removeItem(GUEST_WISHLIST_SNAPSHOT_KEY);
    localStorage.removeItem(GUEST_WISHLIST_SNAPSHOT_OWNER_KEY);
    return restored;
  } catch {
    localStorage.removeItem(GUEST_WISHLIST_SNAPSHOT_KEY);
    localStorage.removeItem(GUEST_WISHLIST_SNAPSHOT_OWNER_KEY);
    return [] as Product[];
  }
}

export const WishlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<Product[]>([]);
  const { token, isAuthenticated, user } = useUser();

  const readLocalWishlist = () => {
    if (typeof window === 'undefined') {
      return [] as Product[];
    }

    try {
      const parsed = JSON.parse(localStorage.getItem(WISHLIST_STORAGE_KEY) || '[]') as Product[];
      return Array.isArray(parsed) ? dedupeWishlist(parsed) : [];
    } catch {
      return [];
    }
  };

  useEffect(() => {
    const syncWishlist = async () => {
      if (isAuthenticated && token && user) {
        const localItems = readLocalWishlist();
        const existingSnapshotOwner = typeof window !== 'undefined' ? localStorage.getItem(GUEST_WISHLIST_SNAPSHOT_OWNER_KEY) : null;
        if (existingSnapshotOwner !== String(user.id)) {
          saveGuestWishlistSnapshot(String(user.id), localItems);
        }
        
        // Fetch server items
        try {
          const res = await fetch('/api/wishlist', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.status === 401 || res.status === 403) {
            setItems(localItems);
            return;
          }
          if (!res.ok) {
            throw new Error(`Wishlist sync failed with status ${res.status}`);
          }
          const serverItems = dedupeWishlist(await res.json());
          
          // Merge local into server if any
          if (localItems.length > 0) {
            for (const item of localItems) {
              if (!serverItems.some((si: any) => si.id === item.id)) {
                await fetch('/api/wishlist', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                  },
                  body: JSON.stringify({ productId: item.id })
                });
                serverItems.push(item);
              }
            }
          }
          
          const mergedItems = dedupeWishlist(serverItems);
          setItems(mergedItems);
          localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(mergedItems));
        } catch {
          setItems(localItems);
        }
      } else {
        const snapshotOwner = typeof window !== 'undefined' ? localStorage.getItem(GUEST_WISHLIST_SNAPSHOT_OWNER_KEY) : null;
        if (snapshotOwner) {
          setItems(restoreGuestWishlistSnapshot());
        } else {
          setItems(readLocalWishlist());
        }
      }
    };

    syncWishlist();
  }, [isAuthenticated, token, user]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addToWishlist = async (product: Product) => {
    const notifyAdded = () => {
      toast.success(product.name ? `${product.name} added to wishlist` : 'Added to wishlist');
    };

    if (isAuthenticated && token && user) {
      try {
        const res = await fetch('/api/wishlist', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ productId: product.id })
        });
        if (res.ok) {
          setItems(prev => {
            const next = [...prev.filter(i => i.id !== product.id), product];
            return next;
          });
          notifyAdded();
        } else if (res.status === 401 || res.status === 403) {
          setItems(prev => (prev.find(item => item.id === product.id) ? prev : [...prev, product]));
          notifyAdded();
        }
      } catch {
        setItems(prev => (prev.find(item => item.id === product.id) ? prev : [...prev, product]));
        notifyAdded();
      }
    } else {
      const alreadySaved = items.some(item => item.id === product.id);
      setItems(prev => {
        if (prev.find(item => item.id === product.id)) return prev;
        return [...prev, product];
      });
      if (!alreadySaved) {
        notifyAdded();
      }
    }
  };

  const removeFromWishlist = async (productId: Product['id']) => {
    const removed = items.find((it) => it.id === productId);
    const notifyRemoved = () => {
      if (!removed) return;
      toast.success(removed.name ? `${removed.name} removed from wishlist` : 'Removed from wishlist', {
        action: {
          label: 'Undo',
          onClick: () => setItems((current) => [removed, ...current]),
        },
      });
    };

    if (isAuthenticated && token && user) {
      try {
        const res = await fetch(`/api/wishlist/${productId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok || res.status === 401 || res.status === 403) {
          setItems(prev => prev.filter(item => item.id !== productId));
          notifyRemoved();
        }
      } catch {
        setItems(prev => prev.filter(item => item.id !== productId));
        notifyRemoved();
      }
    } else {
      setItems(prev => prev.filter(item => item.id !== productId));
      notifyRemoved();
    }
  };

  const isInWishlist = (productId: Product['id']) => {
    return items.some(item => item.id === productId);
  };

  const toggleWishlist = async (product: Product) => {
    if (isInWishlist(product.id)) {
      await removeFromWishlist(product.id);
    } else {
      await addToWishlist(product);
    }
  };

  return (
    <WishlistContext.Provider value={{ 
      items, 
      addToWishlist, 
      removeFromWishlist, 
      isInWishlist,
      toggleWishlist
    }}>
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => {
  const context = useContext(WishlistContext);
  if (!context) throw new Error('useWishlist must be used within a WishlistProvider');
  return context;
};
