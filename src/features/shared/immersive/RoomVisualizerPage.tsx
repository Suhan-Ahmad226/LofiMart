import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Eye, RotateCcw, Save, Share2, Upload } from 'lucide-react';
import { Link, useNavigate } from '../../../lib/navigation';
import { RoomVisualizer } from '../../../components/3d/RoomVisualizer';
import DemoPageLinks from '../../../components/DemoPageLinks';
import { copyText } from '../../../lib/browser-actions';

interface FurnitureItem {
  id: string;
  name: string;
  modelUrl: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export const RoomVisualizerPage = () => {
  const navigate = useNavigate();
  const [savedDesigns, setSavedDesigns] = useState<FurnitureItem[][]>([]);
  const [currentDesign, setCurrentDesign] = useState<FurnitureItem[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const relatedPages = [
    {
      href: '/product-3d',
      title: '3D Product Hub',
      description: 'Browse immersive product pages before bringing items back into the room planner.',
    },
    {
      href: '/ar-tryon',
      title: 'AR Try-On',
      description: 'Switch from room planning to live camera preview for wearable products.',
    },
    {
      href: '/bazaar/affiliate-catalog',
      title: 'Affiliate Catalog',
      description: 'Open a richer product source page and keep flowing into spatial shopping experiences.',
    },
    {
      href: '/explore',
      title: 'Explore Hub',
      description: 'Return to the main route index to continue browsing immersive and core store pages.',
    },
  ];

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const storedDesigns = window.localStorage.getItem('amarshop_room_designs');
      if (!storedDesigns) {
        return;
      }

      const parsed = JSON.parse(storedDesigns) as FurnitureItem[][];
      setSavedDesigns(parsed);
    } catch (error) {
      console.error('Failed to restore room designs:', error);
    }
  }, []);

  const handleSaveDesign = (design: FurnitureItem[]) => {
    const nextDesigns = [...savedDesigns, design];
    setSavedDesigns(nextDesigns);
    setCurrentDesign(design);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem('amarshop_room_designs', JSON.stringify(nextDesigns));
    }

    setStatusMessage(`Saved design with ${design.length} item${design.length === 1 ? '' : 's'}.`);
  };

  const handleShareDesign = async (design: FurnitureItem[]) => {
    if (typeof window === 'undefined') {
      return;
    }

    const shareUrl = `${window.location.origin}/room-design/${Date.now()}`;
    const copied = await copyText(shareUrl);
    setStatusMessage(
      copied
        ? `Share link copied for a ${design.length}-item design.`
        : 'Could not copy the share link on this device.',
    );
  };

  const handleSaveCurrent = () => {
    if (!currentDesign.length) {
      setStatusMessage('Add and position furniture first, then save the design.');
      return;
    }

    handleSaveDesign(currentDesign);
  };

  const handleShareCurrent = () => {
    if (!currentDesign.length) {
      setStatusMessage('Save or place a design before trying to share it.');
      return;
    }

    void handleShareDesign(currentDesign);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white shadow-sm border-b"
      >
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <Link
              to="/"
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Home
            </Link>

            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900">3D Room Visualizer</h1>
              <p className="text-gray-600">Design your perfect space</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleSaveCurrent}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                <Save className="w-4 h-4 inline mr-2" />
                Save
              </button>
              <button
                onClick={handleShareCurrent}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                <Share2 className="w-4 h-4 inline mr-2" />
                Share
              </button>
            </div>
          </div>

          {statusMessage ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              {statusMessage}
            </div>
          ) : null}
        </div>
      </motion.div>

      <RoomVisualizer onSave={handleSaveDesign} />

      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3 }}
        className="fixed top-24 right-6 hidden xl:block bg-white rounded-xl shadow-lg p-6 max-w-sm"
      >
        <h3 className="font-semibold text-gray-900 mb-4">How to Use</h3>
        <div className="space-y-3 text-sm text-gray-600">
          <div className="flex gap-3">
            <Upload className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium">Upload Room Photo</p>
              <p>Take a photo of your room or start with a guided layout</p>
            </div>
          </div>

          <div className="flex gap-3">
            <Eye className="w-5 h-5 text-green-600 mt-0.5" />
            <div>
              <p className="font-medium">Add Furniture</p>
              <p>Select items from the catalog to place in your room</p>
            </div>
          </div>

          <div className="flex gap-3">
            <RotateCcw className="w-5 h-5 text-purple-600 mt-0.5" />
            <div>
              <p className="font-medium">Adjust & Position</p>
              <p>Move, rotate, and scale items to fit perfectly</p>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t">
          <h4 className="font-medium text-gray-900 mb-2">Pro Tips</h4>
          <ul className="text-xs text-gray-600 space-y-1">
            <li>Use good lighting for better room photos.</li>
            <li>Measure your room for more accurate scaling.</li>
            <li>Save multiple layouts to compare options.</li>
            <li>Share your saved setups for quick feedback.</li>
          </ul>
        </div>
      </motion.div>

      {savedDesigns.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-6 left-6 bg-white rounded-xl shadow-lg p-4 max-w-sm"
        >
          <h3 className="font-semibold text-gray-900 mb-3">Saved Designs ({savedDesigns.length})</h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {savedDesigns.map((design, index) => (
              <div key={`${design.length}-${index}`} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium">Design {index + 1}</span>
                <span className="text-xs text-gray-600">{design.length} items</span>
              </div>
            ))}
          </div>
        </motion.div>
      ) : null}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="fixed bottom-6 right-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl p-4 shadow-lg max-w-xs"
      >
        <h3 className="font-semibold mb-2">Ready to Buy?</h3>
        <p className="text-sm opacity-90 mb-3">Purchase all items in your design with one click</p>
        <button
          onClick={() => navigate('/shop')}
          className="bg-white text-blue-600 px-4 py-2 rounded-lg font-medium text-sm hover:bg-gray-100 transition-colors"
        >
          Buy Complete Set
        </button>
      </motion.div>

      <div className="container mx-auto px-4 pb-12 pt-8">
        <DemoPageLinks
          eyebrow="Connected Experiences"
          title="Branch Into Other Interactive Shopping Experiences"
          description="Room planning is one stop in the journey. These routes connect spatial design with 3D product viewing, AR previews, and broader storefront discovery."
          links={relatedPages}
        />
      </div>
    </div>
  );
};
