import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle, Loader2, Ruler, ShieldCheck } from 'lucide-react';
import { useNavigate } from '@/src/lib/navigation';
import { useSizePredictor } from '@/src/hooks/useSizePredictor';
import { ProductCard } from '@/src/components/ProductCard';
import type { Product } from '@/src/types';

const measurementFields = [
  { name: 'height', label: 'Height', unit: 'cm', min: 130, max: 230 },
  { name: 'weight', label: 'Weight', unit: 'kg', min: 30, max: 200 },
  { name: 'chest', label: 'Chest', unit: 'cm', min: 70, max: 130 },
  { name: 'waist', label: 'Waist', unit: 'cm', min: 50, max: 120 },
  { name: 'hips', label: 'Hips', unit: 'cm', min: 70, max: 140 },
  { name: 'inseam', label: 'Inseam', unit: 'cm', min: 60, max: 100 },
] as const;

const presets = [
  {
    label: 'Petite Fit',
    values: { height: 160, weight: 55, chest: 85, waist: 65, hips: 90, inseam: 75 },
  },
  {
    label: 'Balanced Fit',
    values: { height: 175, weight: 70, chest: 95, waist: 75, hips: 100, inseam: 80 },
  },
  {
    label: 'Tall Fit',
    values: { height: 180, weight: 90, chest: 105, waist: 85, hips: 110, inseam: 83 },
  },
  {
    label: 'Classic Menswear',
    values: { height: 180, weight: 85, chest: 100, waist: 80, hips: 95, inseam: 82 },
  },
];

export const SizePredictor: React.FC = () => {
  const navigate = useNavigate();
  const { measurements, prediction, isLoading, error, setMeasurements, predictSize, clearPrediction } = useSizePredictor();
  const [step, setStep] = useState<'input' | 'result'>('input');
  const [products, setProducts] = useState<Product[]>([]);
  const [formData, setFormData] = useState({
    height: 170,
    weight: 70,
    chest: 95,
    waist: 75,
    hips: 100,
    inseam: 80,
  });

  useEffect(() => {
    fetch('/api/products')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => setProducts([]));
  }, []);

  const handleInputChange = (field: string, value: number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    setMeasurements(formData);
    setStep('result');
  };

  const handlePredict = async () => {
    await predictSize();
  };

  const handleStartOver = () => {
    setStep('input');
    clearPrediction();
  };

  const handleShopBySize = () => {
    if (!prediction) return;
    const query = `size ${prediction.topSize} ${prediction.bottomSize}`;
    navigate(`/shop?q=${encodeURIComponent(query)}`);
  };

  const matchedProducts = useMemo(() => {
    if (!prediction) return [];

    return products
      .filter((product) => {
        const haystack = `${product.name} ${product.category} ${product.description}`.toLowerCase();
        return (
          haystack.includes('shirt') ||
          haystack.includes('dress') ||
          haystack.includes('jeans') ||
          haystack.includes('pant') ||
          haystack.includes('fashion') ||
          haystack.includes('clothing')
        );
      })
      .slice(0, 4);
  }, [prediction, products]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-cyan-50 to-white py-8">
      <div className="mx-auto max-w-5xl px-4">
        <div className="mb-8 rounded-[2rem] border border-black/5 bg-white/90 p-8 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700">
                <Ruler className="h-4 w-4" />
                Fit guidance before checkout
              </div>
              <h1 className="mt-4 text-4xl font-bold text-gray-900">AI Size Predictor</h1>
              <p className="mt-3 text-sm leading-7 text-gray-600">
                Enter a measurement profile, review estimated sizes, and give shoppers more confidence before they choose apparel or footwear.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">Shopper Benefit</p>
                <p className="mt-2 text-sm leading-6 text-gray-700">Helps reduce size guesswork when trying to decide between similar fits.</p>
              </div>
              <div className="rounded-2xl bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">Commercial Benefit</p>
                <p className="mt-2 text-sm leading-6 text-gray-700">Supports stronger conversion confidence and can lower return pressure over time.</p>
              </div>
            </div>
          </div>
        </div>

        {step === 'input' && (
          <motion.div
            className="mx-auto max-w-3xl rounded-[2rem] bg-white p-8 shadow-lg"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="mb-8 flex items-start gap-4">
              <div className="rounded-2xl bg-blue-100 p-3 text-blue-600">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">Enter your measurement profile</h2>
                <p className="mt-2 text-sm leading-7 text-gray-600">
                  Use real measurements when possible. If you want a quick preview, start with one of the preset profiles below and then fine-tune.
                </p>
              </div>
            </div>

            <div className="space-y-6">
              {measurementFields.map((field) => (
                <div key={field.name} className="rounded-2xl bg-gray-50 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700">{field.label}</label>
                    <span className="text-lg font-semibold text-blue-600">
                      {formData[field.name]} {field.unit}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={field.min}
                    max={field.max}
                    value={formData[field.name]}
                    onChange={(e) => handleInputChange(field.name, Number(e.target.value))}
                    className="w-full cursor-pointer appearance-none rounded-lg bg-gray-200"
                  />
                  <div className="mt-1 flex justify-between text-xs text-gray-500">
                    <span>{field.min}</span>
                    <span>{field.max}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 border-t pt-6">
              <p className="mb-3 text-sm font-medium text-gray-700">Quick presets</p>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {presets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setFormData(preset.values)}
                    className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium transition-colors hover:bg-gray-200"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              className="mt-8 w-full rounded-xl bg-blue-600 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Review measurements
            </button>
          </motion.div>
        )}

        {step === 'result' && measurements && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="rounded-[2rem] bg-white p-6 shadow">
              <h2 className="mb-4 text-2xl font-semibold text-gray-900">Your measurement summary</h2>
              <div className="mb-6 grid gap-4 md:grid-cols-3">
                {measurementFields.map((field) => (
                  <div key={field.name} className="rounded-2xl bg-gray-50 p-4">
                    <p className="text-sm text-gray-600">{field.label}</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {measurements[field.name]} {field.unit}
                    </p>
                  </div>
                ))}
              </div>

              {!prediction && (
                <button
                  type="button"
                  onClick={handlePredict}
                  disabled={isLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-semibold text-white transition-colors disabled:bg-gray-400 hover:bg-blue-700"
                >
                  {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Ruler className="h-5 w-5" />}
                  {isLoading ? 'Analyzing fit profile...' : 'Predict my size'}
                </button>
              )}
            </div>

            {error ? (
              <div className="flex gap-3 rounded-lg border border-red-400 bg-red-100 px-6 py-4 text-red-700">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <div>{error}</div>
              </div>
            ) : null}

            {prediction && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-[2rem] bg-gradient-to-br from-green-50 to-blue-50 p-8 shadow-lg"
              >
                <div className="mb-6 flex items-start gap-3">
                  <CheckCircle className="mt-1 h-6 w-6 flex-shrink-0 text-green-600" />
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">Fit recommendation summary</h3>
                    <p className="text-gray-600">
                      Confidence: <span className="font-semibold text-green-600">{Math.round(prediction.confidence * 100)}%</span>
                    </p>
                  </div>
                </div>

                <div className="mb-8 grid gap-6 md:grid-cols-3">
                  <div className="rounded-2xl bg-white p-6 shadow">
                    <h4 className="mb-1 text-sm font-medium text-gray-600">Tops and dresses</h4>
                    <p className="text-4xl font-bold text-blue-600">{prediction.topSize}</p>
                    <p className="mt-2 text-xs text-gray-500">Recommended top fit</p>
                  </div>
                  <div className="rounded-2xl bg-white p-6 shadow">
                    <h4 className="mb-1 text-sm font-medium text-gray-600">Bottoms and jeans</h4>
                    <p className="text-4xl font-bold text-blue-600">{prediction.bottomSize}</p>
                    <p className="mt-2 text-xs text-gray-500">Recommended waist range</p>
                  </div>
                  <div className="rounded-2xl bg-white p-6 shadow">
                    <h4 className="mb-1 text-sm font-medium text-gray-600">Shoes</h4>
                    <p className="text-4xl font-bold text-blue-600">US {prediction.shoeSize}</p>
                    <p className="mt-2 text-xs text-gray-500">Recommended shoe size</p>
                  </div>
                </div>

                <div className="mb-6 rounded-2xl border border-blue-300 bg-blue-100 p-4">
                  <p className="font-medium text-gray-900">Fit note</p>
                  <p className="mt-1 text-sm text-gray-700">{prediction.fitNotes}</p>
                </div>

                {prediction.recommendations.length > 0 && (
                  <div>
                    <h4 className="mb-3 font-semibold text-gray-900">Practical recommendations</h4>
                    <ul className="space-y-2">
                      {prediction.recommendations.map((rec) => (
                        <li key={rec} className="flex items-start gap-2 text-gray-700">
                          <span className="mt-1 h-2 w-2 rounded-full bg-blue-600" />
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-8 flex gap-3">
                  <button
                    type="button"
                    onClick={handleStartOver}
                    className="flex-1 rounded-xl bg-gray-200 px-6 py-3 font-semibold text-gray-900 transition-colors hover:bg-gray-300"
                  >
                    Edit measurements
                  </button>
                  <button
                    type="button"
                    onClick={handleShopBySize}
                    className="flex-1 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
                  >
                    Shop by size
                  </button>
                </div>

                {matchedProducts.length ? (
                  <div className="mt-8">
                    <h4 className="mb-4 font-semibold text-gray-900">Products you can check next</h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      {matchedProducts.map((product) => (
                        <div key={product.id} className="overflow-hidden rounded-2xl border border-black/5 bg-white">
                          <ProductCard product={product} />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default SizePredictor;
