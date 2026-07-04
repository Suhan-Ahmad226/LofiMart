'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Product } from '@/src/types';

interface CompareContextType {
  items: Product[];
  toggleCompare: (product: Product) => { added: boolean; reason?: string };
  removeFromCompare: (productId: number) => void;
  clearCompare: () => void;
  isInCompare: (productId: number) => boolean;
}

const CompareContext = createContext<CompareContextType | undefined>(undefined);
const STORAGE_KEY = 'compare-products';
const MAX_COMPARE_ITEMS = 4;

export const CompareProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<Product[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      setItems(Array.isArray(parsed) ? parsed : []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const toggleCompare = (product: Product) => {
    const exists = items.some((item) => item.id === product.id);
    if (exists) {
      setItems((current) => current.filter((item) => item.id !== product.id));
      return { added: false };
    }

    if (items.length >= MAX_COMPARE_ITEMS) {
      return { added: false, reason: `You can compare up to ${MAX_COMPARE_ITEMS} products at once.` };
    }

    setItems((current) => [...current, product]);
    return { added: true };
  };

  const removeFromCompare = (productId: number) => {
    setItems((current) => current.filter((item) => item.id !== productId));
  };

  const clearCompare = () => setItems([]);
  const isInCompare = (productId: number) => items.some((item) => item.id === productId);

  return (
    <CompareContext.Provider value={{ items, toggleCompare, removeFromCompare, clearCompare, isInCompare }}>
      {children}
    </CompareContext.Provider>
  );
};

export const useCompare = () => {
  const context = useContext(CompareContext);
  if (!context) {
    throw new Error('useCompare must be used within a CompareProvider');
  }
  return context;
};
