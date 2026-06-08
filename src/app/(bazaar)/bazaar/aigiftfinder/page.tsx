'use client';

import AIGiftFinder from '@/src/features/bazaar/screens/AIGiftFinder';
import { useCart } from '@/src/context/CartContext';
import { useNavigate } from '@/src/lib/navigation';
import { Product } from '@/src/types';

export default function AIGiftFinderPage() {
  const { addToCart } = useCart();
  const navigate = useNavigate();

  const handleAddToCart = (product: Product) => {
    addToCart(product, 1);
  };

  const handleViewProduct = (product: Product) => {
    navigate(`/product/${product.slug}`);
  };

  return <AIGiftFinder onAddToCart={handleAddToCart} onViewProduct={handleViewProduct} />;
}
