'use client';

import AIGiftFinder from '../../../../features/bazaar/screens/AIGiftFinder';
import { useCart } from '../../../../features/shop/state/CartContext';
import { useNavigate } from '../../../../lib/navigation';
import { Product } from '../../../../types';

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
