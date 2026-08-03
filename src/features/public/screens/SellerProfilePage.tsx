import React, { useEffect, useState } from 'react';
import { useParams } from '../../../lib/navigation';
import { Store, MapPin, Star, Package, Loader2, ShieldCheck, Clock3 } from 'lucide-react';
import { ProductCard } from '../../../components/ProductCard';
import { Product } from '../../../types';
import OptimizedImage from '../../../components/ui/OptimizedImage';

export const SellerProfilePage = () => {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/sellers/${id}`)
      .then(res => res.json())
      .then(data => {
        setData(data);
        setLoading(false);
      });
  }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="animate-spin text-primary" size={48} />
    </div>
  );

  if (!data || !data.seller) return <div className="text-center py-20">Seller not found</div>;

  return (
    <div className="pb-20">
      {/* Seller Header */}
      <div className="bg-gray-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center md:items-end space-y-6 md:space-y-0 md:space-x-8">
            <div className="w-32 h-32 bg-primary/20 rounded-3xl flex items-center justify-center text-primary font-bold text-5xl border-4 border-white/10">
              {data.seller.avatar_url ? (
                <OptimizedImage src={data.seller.avatar_url} alt={data.seller.name} eager widthHint={256} heightHint={256} quality="auto:best" className="h-full w-full rounded-3xl object-cover" />
              ) : (
                data.seller.name[0]
              )}
            </div>
            <div className="flex-1 text-center md:text-left space-y-2">
              <h1 className="text-4xl font-bold font-display">{data.seller.store_name || data.seller.name}</h1>
              {data.seller.bio && <p className="max-w-2xl text-sm text-gray-300">{data.seller.bio}</p>}
              <div className="flex flex-wrap justify-center md:justify-start gap-4 text-sm text-gray-400">
                <div className="flex items-center space-x-1">
                  <Store size={16} />
                  <span className="capitalize">{data.seller.verification_badge ? 'Verified seller' : 'Marketplace seller'}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <MapPin size={16} />
                  <span>Dhaka, Bangladesh</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Star size={16} className="text-yellow-400" fill="currentColor" />
                  <span>{data.seller.seller_rating || 0} Seller Rating</span>
                </div>
                {data.seller.verification_badge && (
                  <div className="flex items-center space-x-1 text-emerald-300">
                    <ShieldCheck size={16} />
                    <span>Verification badge</span>
                  </div>
                )}
                {data.seller.response_time_hours && (
                  <div className="flex items-center space-x-1">
                    <Clock3 size={16} />
                    <span>Responds in ~{data.seller.response_time_hours}h</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex space-x-4">
              <div className="text-center px-6 py-3 bg-white/5 rounded-2xl border border-white/10">
                <p className="text-2xl font-bold">{data.products.length}</p>
                <p className="text-[10px] uppercase font-bold tracking-wider opacity-50">Products</p>
              </div>
              <div className="text-center px-6 py-3 bg-white/5 rounded-2xl border border-white/10">
                <p className="text-2xl font-bold">1.2k</p>
                <p className="text-[10px] uppercase font-bold tracking-wider opacity-50">Followers</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Products Grid */}
      <div className="max-w-7xl mx-auto px-4 py-12 space-y-8">
        <div className="flex items-center justify-between border-b border-gray-100 pb-6">
          <h2 className="text-2xl font-bold flex items-center space-x-2">
            <Package size={24} className="text-primary" />
            <span>All Products</span>
          </h2>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-500">Sort by:</span>
            <select className="bg-transparent border-none text-sm font-bold focus:ring-0 cursor-pointer">
              <option>Newest</option>
              <option>Price: Low to High</option>
              <option>Price: High to Low</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {data.products.map((product: Product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </div>
  );
};
