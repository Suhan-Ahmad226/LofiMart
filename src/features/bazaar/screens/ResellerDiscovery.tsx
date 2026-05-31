import React from 'react';
import { ShieldCheck, Sparkles } from 'lucide-react';
import { useNavigate } from '@/src/lib/navigation';

const ResellerDiscovery: React.FC = () => {
  const navigate = useNavigate();

  const resellers = [
    {
      name: 'Zakir Premium Picks',
      niche: 'Luxury Fashion',
      rating: 4.9,
      sales: '1.2k',
      initials: 'ZP',
      followers: '8.4k',
    },
    {
      name: 'Sylhet Tech Hub',
      niche: 'Gadgets',
      rating: 4.8,
      sales: '850',
      initials: 'ST',
      followers: '12k',
    },
    {
      name: 'Dhaka Decor Curated',
      niche: 'Home Decor',
      rating: 4.7,
      sales: '2.4k',
      initials: 'DD',
      followers: '5.2k',
    },
    {
      name: 'Handloom Sisters',
      niche: 'Traditional Wear',
      rating: 5,
      sales: '430',
      initials: 'HS',
      followers: '15k',
    },
  ];

  const selectReseller = (name: string) => {
    navigate(`/reseller-dashboard/catalog?partner=${encodeURIComponent(name)}`);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-16 px-4 py-12">
      <div className="mx-auto max-w-3xl space-y-6 text-center">
        <div className="mb-2 inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-600">
          <Sparkles className="mr-2 h-4 w-4" />
          Top Resellers
        </div>
        <h1 className="text-5xl font-black tracking-tight text-gray-900 md:text-6xl">
          Hand-picked <span className="text-emerald-500">collections</span>
        </h1>
        <p className="text-xl font-medium text-gray-500">
          Explore curated product mixes inspired by some of the most active reseller storefronts on the marketplace.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
        {resellers.map((reseller) => (
          <div
            key={reseller.name}
            className="group flex cursor-pointer flex-col items-center space-y-6 rounded-[3rem] border bg-white p-8 text-center shadow-sm transition-all hover:shadow-2xl"
            onClick={() => selectReseller(reseller.name)}
          >
            <div className="relative">
              <div className="h-24 w-24 overflow-hidden rounded-[2rem] shadow-xl transition-transform group-hover:scale-105">
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-500 via-teal-500 to-sky-500 text-2xl font-black text-white">
                  {reseller.initials}
                </div>
              </div>
              <div className="absolute -bottom-2 -right-2 rounded-full bg-white p-1.5 shadow-lg">
                <ShieldCheck className="h-5 w-5 text-emerald-500" />
              </div>
            </div>

            <div>
              <h3 className="text-xl font-black text-gray-900 group-hover:text-emerald-600">{reseller.name}</h3>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{reseller.niche}</p>
            </div>

            <div className="flex w-full gap-4 border-y py-4">
              <div className="flex-1 text-center">
                <p className="text-lg font-black">{reseller.rating}</p>
                <p className="text-[8px] font-bold uppercase text-gray-400">Rating</p>
              </div>
              <div className="w-px bg-gray-100" />
              <div className="flex-1 text-center">
                <p className="text-lg font-black">{reseller.followers}</p>
                <p className="text-[8px] font-bold uppercase text-gray-400">Followers</p>
              </div>
              <div className="w-px bg-gray-100" />
              <div className="flex-1 text-center">
                <p className="text-lg font-black">{reseller.sales}</p>
                <p className="text-[8px] font-bold uppercase text-gray-400">Sales</p>
              </div>
            </div>

            <button className="w-full rounded-2xl bg-emerald-500 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-emerald-600">
              View Store
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ResellerDiscovery;
