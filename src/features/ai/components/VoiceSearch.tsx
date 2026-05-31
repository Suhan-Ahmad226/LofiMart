import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle,
  Lightbulb,
  Mic,
  MicOff,
  Search as SearchIcon,
  Volume2,
} from 'lucide-react';
import { useVoiceSearch } from '@/src/hooks/useVoiceSearch';

interface VoiceSearchProps {
  onSearch?: (query: string) => void;
  placeholder?: string;
}

const exampleQueries = [
  'Show me blue running shoes',
  'Find winter jackets under 5000 taka',
  'Look for wireless earbuds with good battery life',
  'Search for black panjabi for Eid',
];

export const VoiceSearch: React.FC<VoiceSearchProps> = ({
  onSearch,
  placeholder = "Say what you're looking for...",
}) => {
  const { isListening, transcript, confidence, error, startListening, stopListening, resetTranscript, isSupported } =
    useVoiceSearch();

  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const handleStartListening = () => {
    resetTranscript();
    startListening();
  };

  const handleStopListening = () => {
    stopListening();
  };

  const handleSearch = (query: string) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    setSearchQuery(trimmedQuery);
    onSearch?.(trimmedQuery);

    setSearchResults([
      `Ready to search for "${trimmedQuery}"`,
      'Matching products across the storefront',
      'Relevant categories and trending results',
      'Filters you can refine after search',
    ]);
  };

  const handleUseTranscript = () => {
    if (!transcript) return;
    handleSearch(transcript);
    handleStopListening();
  };

  useEffect(() => {
    if (transcript && transcript.length > 3 && !isListening) {
      const timer = window.setTimeout(() => {
        if (transcript && !isListening) {
          handleSearch(transcript);
        }
      }, 500);

      return () => window.clearTimeout(timer);
    }
  }, [isListening, transcript]);

  if (!isSupported) {
    return (
      <div className="flex gap-3 rounded-lg border border-yellow-400 bg-yellow-100 px-6 py-4 text-yellow-800">
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        <div>
          <p className="font-semibold">Voice Search Not Supported</p>
          <p className="text-sm">Your browser does not support voice recognition. Please use Chrome, Edge, or Safari.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <div className="space-y-3">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={isListening ? handleStopListening : handleStartListening}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-4 text-lg font-semibold transition-all ${
              isListening
                ? 'animate-pulse bg-red-600 text-white hover:bg-red-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isListening ? (
              <>
                <MicOff className="h-6 w-6" />
                Stop Listening
              </>
            ) : (
              <>
                <Mic className="h-6 w-6" />
                Start Listening
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSearch(exampleQueries[0])}
            className="flex items-center gap-2 rounded-lg bg-gray-100 px-6 py-4 font-semibold transition-colors hover:bg-gray-200"
          >
            <Volume2 className="h-5 w-5" />
            <span className="hidden sm:inline">Try Example</span>
          </button>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <SearchIcon className="h-4 w-4 text-primary" />
            Voice query ideas
          </div>
          <p className="mt-2 text-sm text-gray-500">{placeholder}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {exampleQueries.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => handleSearch(example)}
                className="rounded-full bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200"
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence>
          {transcript && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-lg border border-blue-200 bg-blue-50 p-4"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">You said:</p>
                  <p className="mt-1 text-lg text-gray-900">{transcript}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-gray-200">
                      <div
                        className="h-2 rounded-full bg-blue-600 transition-all duration-300"
                        style={{ width: `${confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-600">{Math.round(confidence * 100)}%</span>
                  </div>
                </div>
              </div>

              {isListening ? (
                <div className="mt-3 flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-8 flex-1 animate-pulse rounded bg-blue-400"
                      style={{ animationDelay: `${i * 100}ms` }}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={handleUseTranscript}
                    className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700"
                  >
                    Search
                  </button>
                  <button
                    type="button"
                    onClick={resetTranscript}
                    className="flex-1 rounded-lg bg-gray-300 px-4 py-2 font-medium text-gray-900 transition-colors hover:bg-gray-400"
                  >
                    Clear
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {isListening ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center gap-2 font-medium text-red-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />
            Listening...
          </motion.div>
        ) : null}

        <AnimatePresence>
          {error ? (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex gap-2 rounded-lg border border-red-400 bg-red-100 px-4 py-3 text-red-700"
            >
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <p>{error}</p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {searchResults.length > 0 ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="border-t pt-4">
          <div className="mb-4 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <p className="font-semibold text-gray-900">{searchResults[0]}</p>
          </div>

          <div className="space-y-2">
            {searchResults.slice(1).map((result, idx) => (
              <motion.div
                key={result}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="rounded-lg bg-gray-50 px-4 py-3 font-medium text-gray-700"
              >
                {result}
              </motion.div>
            ))}
          </div>
        </motion.div>
      ) : null}

      <div className="space-y-3 rounded-lg bg-gray-50 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          Voice search tips
        </div>
        <ul className="space-y-2 text-sm text-gray-700">
          <li>Say clear, natural phrases like "Show me blue running shoes".</li>
          <li>Mention product type, color, budget, or brand for better search quality.</li>
          <li>Speak at a steady pace and wait a moment before stopping the microphone.</li>
          <li>One focused request works better than multiple requests in the same command.</li>
        </ul>
        {searchQuery ? (
          <p className="text-xs text-gray-500">
            Latest query: <span className="font-semibold text-gray-700">{searchQuery}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
};

export default VoiceSearch;
