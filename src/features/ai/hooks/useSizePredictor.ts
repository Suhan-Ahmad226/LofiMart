import { useState, useCallback } from 'react';

export interface BodyMeasurements {
  height: number; // cm
  weight: number; // kg
  chest: number; // cm
  waist: number; // cm
  hips: number; // cm
  inseam: number; // cm
}

export interface SizePrediction {
  topSize: string;
  bottomSize: string;
  shoeSize: string;
  confidence: number;
  recommendations: string[];
  fitNotes: string;
}

interface UseSizePredictorReturn {
  measurements: BodyMeasurements | null;
  prediction: SizePrediction | null;
  isLoading: boolean;
  error: string | null;
  setMeasurements: (measurements: BodyMeasurements) => void;
  predictSize: () => Promise<void>;
  updateMeasurement: (key: keyof BodyMeasurements, value: number) => void;
  clearPrediction: () => void;
  getSizeChart: (brand: string) => Record<string, string[]>;
}

// Standard size charts for different brands/regions
const sizeCharts = {
  standard: {
    XS: ['85-90', '60-65', '85-90'],
    S: ['90-95', '65-70', '90-95'],
    M: ['95-100', '70-75', '95-100'],
    L: ['100-105', '75-80', '100-105'],
    XL: ['105-110', '80-85', '105-110'],
    XXL: ['110-115', '85-90', '110-115'],
  },
  european: {
    '32': ['85-90', '60-65', '85-90'],
    '34': ['90-95', '65-70', '90-95'],
    '36': ['95-100', '70-75', '95-100'],
    '38': ['100-105', '75-80', '100-105'],
    '40': ['105-110', '80-85', '105-110'],
    '42': ['110-115', '85-90', '110-115'],
  },
};

// AI Size Prediction Algorithm (simplified ML model)
const predictSizeAI = (measurements: BodyMeasurements): SizePrediction => {
  const bmi = measurements.weight / ((measurements.height / 100) ** 2);
  const avgMeasurement = (measurements.chest + measurements.waist + measurements.hips) / 3;

  let topSize = 'M';
  let bottomSize = 'M';
  let shoeSize = '8';
  let confidence = 0.85;

  // Determine top size based on chest and height
  if (measurements.chest < 90) {
    topSize = 'XS';
  } else if (measurements.chest < 95) {
    topSize = 'S';
  } else if (measurements.chest < 105) {
    topSize = 'M';
  } else if (measurements.chest < 115) {
    topSize = 'L';
  } else {
    topSize = 'XL';
  }

  // Determine bottom size based on waist and inseam
  if (measurements.waist < 65) {
    bottomSize = 'XS';
  } else if (measurements.waist < 70) {
    bottomSize = 'S';
  } else if (measurements.waist < 80) {
    bottomSize = 'M';
  } else if (measurements.waist < 85) {
    bottomSize = 'L';
  } else {
    bottomSize = 'XL';
  }

  // Estimate shoe size (US sizing)
  const shoeBaseSize = 6 + Math.round((measurements.height - 150) / 5);
  shoeSize = Math.max(5, Math.min(15, shoeBaseSize)).toString();

  // Adjust confidence based on how standard the measurements are
  if (bmi > 18.5 && bmi < 25) confidence = 0.92;
  else if (bmi > 25 && bmi < 30) confidence = 0.88;
  else confidence = 0.75;

  const recommendations = [];
  if (measurements.chest - measurements.waist > 20) {
    recommendations.push('Consider fitted styles to accentuate your shape');
  }
  if (measurements.hips > measurements.chest) {
    recommendations.push('Peplum styles and flared pants complement your figure');
  }
  if (measurements.height < 160) {
    recommendations.push('Vertical stripes and high-waisted bottoms elongate your frame');
  }
  if (bmi > 25) {
    recommendations.push('Dark colors and structured fabrics provide a slimming effect');
  }

  return {
    topSize,
    bottomSize,
    shoeSize,
    confidence,
    recommendations,
    fitNotes: `Based on your measurements, we recommend ${topSize} for tops and ${bottomSize} for bottoms. Always check brand-specific sizing guides as they may vary.`,
  };
};

export const useSizePredictor = (): UseSizePredictorReturn => {
  const [measurements, setMeasurementsState] = useState<BodyMeasurements | null>(null);
  const [prediction, setPrediction] = useState<SizePrediction | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setMeasurements = useCallback((measurements: BodyMeasurements) => {
    // Validate measurements
    if (measurements.height < 130 || measurements.height > 230) {
      setError('Height should be between 130cm and 230cm');
      return;
    }
    if (measurements.weight < 30 || measurements.weight > 200) {
      setError('Weight should be between 30kg and 200kg');
      return;
    }

    setMeasurementsState(measurements);
    setError(null);
  }, []);

  const predictSize = useCallback(async () => {
    if (!measurements) {
      setError('Please set your measurements first');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Simulate ML processing
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Run AI prediction
      const newPrediction = predictSizeAI(measurements);
      setPrediction(newPrediction);
    } catch (err) {
      setError('Failed to predict size');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [measurements]);

  const updateMeasurement = useCallback(
    (key: keyof BodyMeasurements, value: number) => {
      setMeasurementsState((prev) =>
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

  const clearPrediction = useCallback(() => {
    setPrediction(null);
    setError(null);
  }, []);

  const getSizeChart = useCallback((brand: string) => {
    return sizeCharts[brand as keyof typeof sizeCharts] || sizeCharts.standard;
  }, []);

  return {
    measurements,
    prediction,
    isLoading,
    error,
    setMeasurements,
    predictSize,
    updateMeasurement,
    clearPrediction,
    getSizeChart,
  };
};
