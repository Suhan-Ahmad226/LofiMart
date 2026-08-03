import React, { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, Heart, RefreshCw, Search, ShoppingCart, Sparkles } from 'lucide-react';
import { Product } from '../../../types';
import OptimizedImage from '../../../components/ui/OptimizedImage';
import { CenteredLoader, EmptyState, FormNotice } from '../../../components/ui/FeedbackState';

type GenAIResponse = {
  text: () => string;
};

type GenAIClient = {
  generateContent: (input: { model: string; contents: string[] }) => Promise<GenAIResponse>;
};

declare global {
  interface Window {
    genai?: GenAIClient;
  }
}

const AIGiftFinder: React.FC<{
  onAddToCart: (product: Product) => void;
  onViewProduct: (product: Product) => void;
}> = ({ onAddToCart, onViewProduct }) => {
  const [query, setQuery] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);

  const fallbackSuggestions = useMemo(() => catalog.slice(0, 3), [catalog]);

  useEffect(() => {
    let cancelled = false;

    const loadCatalog = async () => {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const response = await fetch('/api/products');
        const payload = await response.json().catch(() => null);

        if (!response.ok || !Array.isArray(payload)) {
          throw new Error('Gift catalog could not be loaded right now.');
        }

        if (!cancelled) {
          setCatalog(payload);
        }
      } catch (error) {
        if (!cancelled) {
          setCatalog([]);
          setCatalogError(error instanceof Error ? error.message : 'Gift catalog could not be loaded right now.');
        }
      } finally {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      }
    };

    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  const findGifts = async () => {
    if (!query.trim() || catalog.length === 0) return;

    setIsAnalyzing(true);
    try {
      if (window.genai) {
        const response = await window.genai.generateContent({
          model: 'gemini-1.5-pro',
          contents: [
            `Gift recommendation for: "${query}". Catalog: ${JSON.stringify(
              catalog.slice(0, 12).map((product) => ({
                id: product.id,
                name: product.name,
                price: product.price,
                category: product.category,
              })),
            )}. Return JSON { "ids": [], "explanation": "" }.`,
          ],
        });

        const result = JSON.parse(response.text()) as { ids?: number[]; explanation?: string };
        const matchedProducts = catalog.filter((product) => result.ids?.includes(product.id));
        setSuggestions(matchedProducts.length > 0 ? matchedProducts : fallbackSuggestions);
        setAiAnalysis(result.explanation || 'These recommendations balance usefulness, quality, and gift appeal.');
      } else {
        setSuggestions(fallbackSuggestions);
        setAiAnalysis('Popular gift-ready products selected from the current live catalog.');
      }
    } catch {
      setSuggestions(fallbackSuggestions);
      setAiAnalysis('Popular gift-ready products selected from the current live catalog.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-16 px-4 py-12">
      <div className="mx-auto max-w-3xl space-y-6 text-center">
        <div className="mb-2 inline-flex items-center rounded-full border border-red-100 bg-red-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-red-500">
          <Sparkles className="mr-2 h-4 w-4" /> AI Gift Finder
        </div>
        <h1 className="text-5xl font-black tracking-tight text-gray-900 md:text-6xl">
          Smart <span className="text-red-500">Gift</span> Suggestions
        </h1>
        <p className="text-xl font-medium leading-relaxed text-gray-500">
          Describe who the gift is for and get quick, practical product ideas from the live bazaar catalog.
        </p>
      </div>

      {catalogLoading ? (
        <CenteredLoader
          label="Loading gift-ready products..."
          className="mx-auto max-w-3xl rounded-[3rem] border border-gray-100 bg-white/80 p-12 shadow-sm"
        />
      ) : catalogError ? (
        <FormNotice tone="error" className="mx-auto max-w-3xl">
          <div>
            <p className="font-semibold">Catalog unavailable</p>
            <p className="mt-1">{catalogError}</p>
          </div>
        </FormNotice>
      ) : catalog.length === 0 ? (
        <EmptyState
          title="No gift-ready products available yet"
          description="Publish more live products first, then this assistant will start suggesting them here."
          className="mx-auto max-w-3xl rounded-[3rem] border border-dashed border-gray-200 bg-white p-12 shadow-sm"
        />
      ) : (
        <>
          <div className="relative mx-auto max-w-3xl">
            <div className="absolute inset-0 scale-110 rounded-full bg-red-500/10 blur-[100px]" />
            <div className="relative flex flex-col gap-4 rounded-[3rem] border-2 border-gray-100 bg-white p-4 shadow-2xl md:flex-row">
              <div className="flex flex-1 items-center px-6">
                <BrainCircuit className="mr-4 h-7 w-7 shrink-0 text-red-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && void findGifts()}
                  placeholder="Example: a practical tech gift for a younger sister"
                  className="w-full bg-transparent py-4 text-lg font-bold text-gray-800 outline-none"
                />
              </div>
              <button
                onClick={() => void findGifts()}
                disabled={isAnalyzing || !query.trim()}
                className="flex items-center justify-center rounded-[2rem] bg-gray-900 px-10 py-5 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-red-600 disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <RefreshCw className="mr-3 h-5 w-5 animate-spin" />
                ) : (
                  <Search className="mr-3 h-5 w-5" />
                )}
                Find gifts
              </button>
            </div>
          </div>

          {suggestions.length > 0 ? (
            <div className="space-y-12">
              {aiAnalysis ? (
                <div className="rounded-[3.5rem] border border-red-100 bg-red-50 p-8 md:p-12">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-red-600">AI Analysis</h4>
                  <p className="text-lg font-medium text-red-900">"{aiAnalysis}"</p>
                </div>
              ) : null}
              <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                {suggestions.map((product) => (
                  <div
                    key={product.id}
                    className="group overflow-hidden rounded-[3rem] border bg-white shadow-sm transition hover:shadow-2xl"
                  >
                    <div className="relative aspect-square overflow-hidden bg-gray-50">
                      <OptimizedImage
                        src={product.image}
                        alt={product.name}
                        widthHint={720}
                        heightHint={720}
                        className="h-full w-full object-cover transition-transform group-hover:scale-110"
                      />
                      <button className="absolute right-4 top-4 rounded-full bg-white p-2 shadow-xl">
                        <Heart className="h-5 w-5 text-gray-400" />
                      </button>
                    </div>
                    <div className="space-y-4 p-6">
                      <button onClick={() => onViewProduct(product)} className="text-left">
                        <h3 className="line-clamp-2 font-black text-gray-900">{product.name}</h3>
                      </button>
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-black">BDT {product.price.toFixed(2)}</span>
                        <button
                          onClick={() => onAddToCart(product)}
                          className="rounded-xl bg-gray-900 p-3 text-white"
                        >
                          <ShoppingCart className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};

export default AIGiftFinder;
