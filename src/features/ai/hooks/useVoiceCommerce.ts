import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

export interface VoiceCommand {
  text: string;
  type: 'search' | 'add-to-cart' | 'checkout' | 'navigate' | 'filter' | 'sort' | 'unknown';
  intent: string;
  confidence: number;
  id: string;
  timestamp: Date;
}

export interface VoiceCommerceSession {
  id: string;
  startTime: Date;
  commands: VoiceCommand[];
  cartItems: number;
  lastAction: string | null;
}

interface UseVoiceCommerceReturn {
  session: VoiceCommerceSession;
  isProcessing: boolean;
  lastCommand: VoiceCommand | null;
  error: string | null;
  processCommand: (text: string) => Promise<VoiceCommand>;
  startSession: () => void;
  endSession: () => void;
  clearHistory: () => void;
}

// NLP Intent Recognition Engine
const recognizeIntent = (text: string): { type: string; intent: string; confidence: number } => {
  const normalizedText = text.toLowerCase().trim();

  // Search intents
  if (normalizedText.match(/^(search|find|show|look for|find me).*/)) {
    const query = normalizedText.replace(/^(search|find|show|look for|find me)\s+/i, '');
    return {
      type: 'search',
      intent: query,
      confidence: 0.9,
    };
  }

  // Add to cart intents
  if (normalizedText.match(/(add|put|get|buy).*(cart|bag|basket)/i)) {
    return {
      type: 'add-to-cart',
      intent: 'add-current-product',
      confidence: 0.85,
    };
  }

  // Checkout intents
  if (normalizedText.match(/(checkout|pay|purchase|complete|order)/i)) {
    return {
      type: 'checkout',
      intent: 'proceed-to-checkout',
      confidence: 0.88,
    };
  }

  // Navigation intents
  if (normalizedText.match(/(go to|navigate|visit|show me|open).*(home|shop|cart|account|profile)/i)) {
    const target = normalizedText.match(/(home|shop|cart|account|profile)/i)?.[1] || 'home';
    return {
      type: 'navigate',
      intent: `navigate-to-${target}`,
      confidence: 0.87,
    };
  }

  // Filter intents
  if (normalizedText.match(/(filter|show|only|size|color|price|brand).*/i)) {
    const filterType = normalizedText.match(
      /(small|medium|large|red|blue|green|cheap|expensive|brand|under|over)/i
    )?.[1] || 'general';
    return {
      type: 'filter',
      intent: `filter-by-${filterType}`,
      confidence: 0.8,
    };
  }

  // Sort intents
  if (normalizedText.match(/(sort|order|arrange).*(price|new|popular|rating)/i)) {
    const sortBy = normalizedText.match(/(price|new|popular|rating)/i)?.[1] || 'popular';
    return {
      type: 'sort',
      intent: `sort-by-${sortBy}`,
      confidence: 0.82,
    };
  }

  // Unknown
  return {
    type: 'unknown',
    intent: normalizedText,
    confidence: 0.5,
  };
};

export const useVoiceCommerce = (): UseVoiceCommerceReturn => {
  const [session, setSession] = useState<VoiceCommerceSession>({
    id: uuidv4(),
    startTime: new Date(),
    commands: [],
    cartItems: 0,
    lastAction: null,
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [lastCommand, setLastCommand] = useState<VoiceCommand | null>(null);
  const [error, setError] = useState<string | null>(null);

  const processCommand = useCallback(
    async (text: string): Promise<VoiceCommand> => {
      if (!text || text.trim().length === 0) {
        setError('Empty command text');
        return {} as VoiceCommand;
      }

      setIsProcessing(true);
      setError(null);

      try {
        // Simulate NLP processing
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Recognize intent
        const { type, intent, confidence } = recognizeIntent(text);

        // Create command object
        const command: VoiceCommand = {
          text,
          type: type as any,
          intent,
          confidence,
          id: uuidv4(),
          timestamp: new Date(),
        };

        // Update session
        setSession((prev) => ({
          ...prev,
          commands: [...prev.commands, command],
          lastAction: intent,
          cartItems: type === 'add-to-cart' ? prev.cartItems + 1 : prev.cartItems,
        }));

        setLastCommand(command);
        return command;
      } catch (err) {
        setError('Failed to process command');
        console.error(err);
        return {} as VoiceCommand;
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  const startSession = useCallback(() => {
    setSession({
      id: uuidv4(),
      startTime: new Date(),
      commands: [],
      cartItems: 0,
      lastAction: null,
    });
    setLastCommand(null);
    setError(null);
  }, []);

  const endSession = useCallback(() => {
    setLastCommand(null);
    setError(null);
  }, []);

  const clearHistory = useCallback(() => {
    setSession((prev) => ({
      ...prev,
      commands: [],
      lastAction: null,
    }));
    setLastCommand(null);
  }, []);

  return {
    session,
    isProcessing,
    lastCommand,
    error,
    processCommand,
    startSession,
    endSession,
    clearHistory,
  };
};
