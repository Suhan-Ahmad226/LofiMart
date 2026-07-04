import React, { useEffect, useState } from 'react';
import { Copy, Download, Facebook, FileText, Image as ImageIcon, Instagram, Share2, Twitter, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useUser } from '@/src/context/UserContext';
import { copyText } from '@/src/lib/browser-actions';

export const ResellerPromotions = () => {
  const { token } = useUser();
  const [code, setCode] = useState('');
  const [clicks, setClicks] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const shopLink = code ? `${origin}/r/${code}` : '';
  const inviteLink = code ? `${origin}/register?ref=${code}` : '';

  const copyLink = async (link: string) => {
    const copied = await copyText(link);
    if (!copied) {
      toast.error('Could not copy the link on this device.');
      return;
    }
    toast.success('Link copied to clipboard.');
  };

  useEffect(() => {
    const loadLink = async () => {
      if (!token) {
        setError('Please log in as a reseller to load your referral tools.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        const response = await fetch('/api/reseller/referral-link', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to fetch referral link');
        }
        setCode(payload.code);
        setClicks(payload.clicks || 0);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Failed to load referral tools');
        setCode('');
        setClicks(0);
      } finally {
        setLoading(false);
      }
    };

    void loadLink();
  }, [token]);

  const marketingMaterials = [
    { title: 'Summer Sale Banner', type: 'Image', size: '1.2 MB', icon: <ImageIcon className="text-blue-600" /> },
    { title: 'Product Catalog PDF', type: 'Document', size: '4.5 MB', icon: <FileText className="text-red-600" /> },
    { title: 'Social Media Kit', type: 'Archive', size: '12.8 MB', icon: <Download className="text-purple-600" /> },
    { title: 'Brand Guidelines', type: 'Document', size: '2.1 MB', icon: <FileText className="text-emerald-600" /> },
  ];

  const socialCaption =
    'Check out my curated LofiMart collection. Trusted products, smooth checkout, and hand-picked recommendations for your audience.';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Promotions & Tools</h1>
        <p className="text-gray-500">Access marketing assets and referral tools to grow your reseller business.</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</div>
      ) : null}

      <div className="rounded-[40px] border border-black/5 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <Share2 size={20} className="text-primary" />
            Your Referral Links
          </h3>
          <div className="text-xs font-bold text-gray-500">Clicks: {clicks}</div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Loading your links...</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Shop Link</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={shopLink}
                  placeholder="Login as reseller to generate your link"
                  className="flex-1 rounded-xl border-none bg-gray-50 px-4 py-3 text-sm font-medium text-gray-600"
                />
                <button
                  disabled={!shopLink}
                  onClick={() => shopLink && void copyLink(shopLink)}
                  className="rounded-xl bg-primary p-3 text-white transition-all hover:bg-primary/90 disabled:opacity-50"
                >
                  <Copy size={18} />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Invite Link</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={inviteLink}
                  placeholder="Login as reseller to generate your link"
                  className="flex-1 rounded-xl border-none bg-gray-50 px-4 py-3 text-sm font-medium text-gray-600"
                />
                <button
                  disabled={!inviteLink}
                  onClick={() => inviteLink && void copyLink(inviteLink)}
                  className="rounded-xl bg-primary p-3 text-white transition-all hover:bg-primary/90 disabled:opacity-50"
                >
                  <Copy size={18} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <h3 className="text-lg font-bold">Marketing Materials</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {marketingMaterials.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                className="group flex items-center justify-between rounded-3xl border border-black/5 bg-white p-6 shadow-sm transition-all hover:border-primary/20"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-50 transition-all group-hover:bg-primary/5">
                    {item.icon}
                  </div>
                  <div>
                    <p className="text-sm font-bold">{item.title}</p>
                    <p className="text-xs text-gray-500">
                      {item.type} â€¢ {item.size}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => toast.success(`${item.title} is ready for download.`)}
                  className="p-2 text-gray-400 transition-colors hover:text-primary"
                >
                  <Download size={20} />
                </button>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <h3 className="text-lg font-bold">Quick Share</h3>
          <div className="space-y-6 rounded-[40px] border border-black/5 bg-white p-8 shadow-sm">
            <p className="text-sm italic text-gray-500">"{socialCaption}"</p>
            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={() => shopLink && void copyLink(shopLink)}
                className="flex flex-col items-center gap-2 rounded-2xl bg-blue-50 p-4 text-blue-600 transition-all hover:bg-blue-100"
              >
                <Facebook size={24} />
                <span className="text-[10px] font-bold uppercase">Facebook</span>
              </button>
              <button
                onClick={() => shopLink && void copyLink(shopLink)}
                className="flex flex-col items-center gap-2 rounded-2xl bg-sky-50 p-4 text-sky-500 transition-all hover:bg-sky-100"
              >
                <Twitter size={24} />
                <span className="text-[10px] font-bold uppercase">Twitter</span>
              </button>
              <button
                onClick={() => shopLink && void copyLink(shopLink)}
                className="flex flex-col items-center gap-2 rounded-2xl bg-pink-50 p-4 text-pink-600 transition-all hover:bg-pink-100"
              >
                <Instagram size={24} />
                <span className="text-[10px] font-bold uppercase">Instagram</span>
              </button>
            </div>
            <button
              onClick={() => toast.success('Campaign post draft generated for your next promotion.')}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-900 py-4 font-bold text-white transition-all hover:bg-black"
            >
              <Zap size={18} className="text-yellow-400" />
              <span>Generate Campaign Draft</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
