import { useState, useCallback } from 'react';

export interface StyleProfile {
  preferences: string[];
  colorPreferences: string[];
  occasions: string[];
  budget: number;
  bodyType: string;
  style: string;
}

export interface OutfitRecommendation {
  id: string;
  name: string;
  items: string[];
  colors: string[];
  occasion: string;
  price: number;
  image: string;
  matchScore: number;
  reason: string;
  shopQuery: string;
}

interface UseAIStylistReturn {
  styleProfile: StyleProfile | null;
  recommendations: OutfitRecommendation[];
  isLoading: boolean;
  error: string | null;
  setStyleProfile: (profile: StyleProfile) => void;
  generateRecommendations: () => Promise<void>;
  updatePreferences: (key: keyof StyleProfile, value: any) => void;
  clearRecommendations: () => void;
}

// Local recommendation engine used when a dedicated styling service is not configured.
const generateLocalRecommendations = (profile: StyleProfile): OutfitRecommendation[] => {
  const occasions = {
    casual: ['T-shirt', 'Jeans', 'Sneakers', 'Jacket'],
    formal: ['Dress Shirt', 'Blazer', 'Trousers', 'Leather Shoes'],
    evening: ['Evening Gown', 'Heels', 'Clutch', 'Jewelry'],
    sporty: ['Athletic Top', 'Leggings', 'Sports Shoes', 'Sports Jacket'],
  };

  const colorSchemes = {
    neutral: ['Black', 'White', 'Gray', 'Beige'],
    warm: ['Orange', 'Brown', 'Gold', 'Cream'],
    cool: ['Blue', 'Purple', 'Silver', 'White'],
    vibrant: ['Red', 'Yellow', 'Green', 'Pink'],
  };

  const recommendations: OutfitRecommendation[] = profile.occasions.map((occasion, idx) => {
    const baseScore = 0.75 + Math.random() * 0.25;
    const schemeKey = (profile.colorPreferences[0] || 'neutral').toLowerCase();
    const colors = colorSchemes[schemeKey as keyof typeof colorSchemes] || colorSchemes.neutral;
    const primaryColor = colors[0];
    const leadItem = (occasions[occasion as keyof typeof occasions] || occasions.casual)[0];
    const shopQuery = `${primaryColor} ${profile.style} ${leadItem}`;

    return {
      id: `outfit-${idx}`,
      name: `${occasion.charAt(0).toUpperCase() + occasion.slice(1)} Collection - ${profile.style}`,
      items: occasions[occasion as keyof typeof occasions] || occasions.casual,
      colors: colors,
      occasion: occasion,
      price: profile.budget,
      matchScore: baseScore,
      reason: `Built around your ${profile.style} style, ${occasion} needs, and ${primaryColor.toLowerCase()} color preference.`,
      image: `https://images.unsplash.com/photo-${1500+ idx}?w=400&h=500&fit=crop`,
      shopQuery,
    };
  });

  return recommendations;
};

export const useAIStylist = (): UseAIStylistReturn => {
  const [styleProfile, setStyleProfileState] = useState<StyleProfile | null>(null);
  const [recommendations, setRecommendations] = useState<OutfitRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setStyleProfile = useCallback((profile: StyleProfile) => {
    setStyleProfileState(profile);
    setError(null);
  }, []);

  const generateRecommendations = useCallback(async () => {
    if (!styleProfile) {
      setError('Please set your style profile first');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const newRecommendations = generateLocalRecommendations(styleProfile);
      setRecommendations(newRecommendations);
    } catch (err) {
      setError('Failed to generate recommendations');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [styleProfile]);

  const updatePreferences = useCallback(
    (key: keyof StyleProfile, value: any) => {
      setStyleProfileState((prev) =>
        prev
          ? {
              ...prev,
              [key]: value,
            }
          : null
      );
    },
    []
  );

  const clearRecommendations = useCallback(() => {
    setRecommendations([]);
    setError(null);
  }, []);

  return {
    styleProfile,
    recommendations,
    isLoading,
    error,
    setStyleProfile,
    generateRecommendations,
    updatePreferences,
    clearRecommendations,
  };
};
