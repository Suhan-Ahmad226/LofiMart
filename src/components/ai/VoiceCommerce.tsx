import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  ChevronDown,
  Filter,
  Home,
  Mic,
  MicOff,
  Search,
  ShoppingBag,
  SlidersHorizontal,
} from 'lucide-react';
import { useVoiceSearch } from '../../hooks/useVoiceSearch';
import { useVoiceCommerce } from '../../hooks/useVoiceCommerce';

const commandExamples = {
  search: [
    'Show me blue running shoes',
    'Find winter jackets under 5000 taka',
    'Look for Nike shoes size 10',
  ],
  cart: [
    'Add this to my cart',
    'Go to my cart',
    'Checkout please',
    'Remove this item',
  ],
  filter: [
    'Sort by price low to high',
    'Show only available items',
    'Filter by size medium',
    'Show bestsellers',
  ],
  navigation: [
    'Go to home',
    'Show my account',
    'Open my wishlist',
    'Go to shop',
  ],
};

export const VoiceCommerce: React.FC = () => {
  const { isListening, transcript, startListening, stopListening, resetTranscript, isSupported } =
    useVoiceSearch();
  const { session, isProcessing, lastCommand, error, processCommand, startSession } = useVoiceCommerce();
  const [showHistory, setShowHistory] = useState(false);

  const handleCommandStart = () => {
    startSession();
    resetTranscript();
    startListening();
  };

  const handleCommandStop = async () => {
    stopListening();
    if (transcript) {
      await processCommand(transcript);
    }
  };

  if (!isSupported) {
    return (
      <div className="rounded-lg border border-yellow-400 bg-yellow-100 px-6 py-4 text-yellow-800">
        Voice commerce requires a modern browser with speech recognition support.
      </div>
    );
  }

  const getCommandBadgeClass = (type: string) => {
    switch (type) {
      case 'search':
        return 'bg-blue-100 text-blue-700';
      case 'add-to-cart':
        return 'bg-emerald-100 text-emerald-700';
      case 'checkout':
        return 'bg-amber-100 text-amber-700';
      case 'navigate':
        return 'bg-violet-100 text-violet-700';
      case 'filter':
        return 'bg-cyan-100 text-cyan-700';
      case 'sort':
        return 'bg-fuchsia-100 text-fuchsia-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getCommandLabel = (type: string) => {
    switch (type) {
      case 'search':
        return 'Search';
      case 'add-to-cart':
        return 'Add to cart';
      case 'checkout':
        return 'Checkout';
      case 'navigate':
        return 'Navigation';
      case 'filter':
        return 'Filter';
      case 'sort':
        return 'Sort';
      default:
        return 'Command';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 py-8">
      <div className="mx-auto max-w-4xl px-4">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-purple-200 bg-white px-4 py-2 text-sm font-semibold text-purple-700 shadow-sm">
            <Mic className="h-4 w-4" />
            Conversational shopping controls
          </div>
          <h1 className="mb-2 text-4xl font-bold text-gray-900">Voice Shopping</h1>
          <p className="text-gray-600">Test search, navigation, cart, and filter commands in one guided experience.</p>
        </div>

        <motion.div
          className="mb-8 rounded-lg bg-white p-8 shadow-lg"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex flex-col items-center gap-6">
            <button
              type="button"
              onClick={isListening ? handleCommandStop : handleCommandStart}
              disabled={isProcessing}
              className={`relative h-24 w-24 rounded-full font-semibold transition-all transform hover:scale-105 ${
                isListening
                  ? 'animate-pulse bg-red-600 text-white hover:bg-red-700'
                  : 'bg-purple-600 text-white hover:bg-purple-700'
              } ${isProcessing ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                {isListening ? <MicOff className="h-10 w-10" /> : <Mic className="h-10 w-10" />}
              </div>
              {isListening ? <div className="absolute inset-0 rounded-full border-4 border-red-400 animate-pulse" /> : null}
            </button>

            <div className="text-center">
              {isListening ? <p className="animate-pulse text-lg font-semibold text-red-600">Listening...</p> : null}
              {isProcessing ? <p className="text-lg font-semibold text-purple-600">Processing command...</p> : null}
              {!isListening && !isProcessing && !transcript ? (
                <p className="text-gray-600">Start the microphone, say one command clearly, then stop listening.</p>
              ) : null}
            </div>

            <AnimatePresence>
              {transcript ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full rounded-lg border-2 border-purple-200 bg-purple-50 p-4"
                >
                  <p className="mb-1 text-sm text-gray-600">You said:</p>
                  <p className="text-xl font-semibold text-gray-900">{transcript}</p>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {lastCommand ? (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="w-full rounded-lg border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className={`rounded-full px-3 py-1 text-xs font-semibold ${getCommandBadgeClass(lastCommand.type)}`}>
                      {getCommandLabel(lastCommand.type)}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{lastCommand.intent}</p>
                      <p className="mt-1 text-sm text-gray-600">Confidence: {Math.round(lastCommand.confidence * 100)}%</p>
                      <div className="mt-2 h-1.5 rounded-full bg-gray-200">
                        <div className="h-1.5 rounded-full bg-green-600" style={{ width: `${lastCommand.confidence * 100}%` }} />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {error ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex w-full gap-2 rounded-lg border border-red-400 bg-red-100 px-4 py-3 text-red-700"
                >
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <p>{error}</p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </motion.div>

        <div className="mb-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Search className="h-5 w-5" />
              Search Commands
            </h3>
            <div className="space-y-2">
              {commandExamples.search.map((cmd) => (
                <div key={cmd} className="rounded bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700">
                  {cmd}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <ShoppingBag className="h-5 w-5" />
              Cart Commands
            </h3>
            <div className="space-y-2">
              {commandExamples.cart.map((cmd) => (
                <div key={cmd} className="rounded bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700">
                  {cmd}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Filter className="h-5 w-5" />
              Filter Commands
            </h3>
            <div className="space-y-2">
              {commandExamples.filter.map((cmd) => (
                <div key={cmd} className="rounded bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700">
                  {cmd}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Home className="h-5 w-5" />
              Navigation Commands
            </h3>
            <div className="space-y-2">
              {commandExamples.navigation.map((cmd) => (
                <div key={cmd} className="rounded bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700">
                  {cmd}
                </div>
              ))}
            </div>
          </div>
        </div>

        {session.commands.length > 0 ? (
          <div className="rounded-lg bg-white p-6 shadow">
            <button
              type="button"
              onClick={() => setShowHistory((current) => !current)}
              className="flex w-full items-center justify-between text-lg font-semibold text-gray-900"
            >
              <span>Command History ({session.commands.length})</span>
              <ChevronDown className={`h-5 w-5 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showHistory ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 space-y-2 border-t pt-4"
                >
                  {session.commands.map((cmd) => (
                    <div key={cmd.id} className="flex items-start gap-3 rounded-lg bg-gray-50 p-3 text-sm">
                      <div className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getCommandBadgeClass(cmd.type)}`}>
                        {getCommandLabel(cmd.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900">{cmd.text}</p>
                        <p className="mt-0.5 text-xs text-gray-600">{Math.round(cmd.confidence * 100)}% confidence</p>
                      </div>
                    </div>
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="mt-4 grid grid-cols-3 gap-4 border-t pt-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">{session.commands.length}</p>
                <p className="text-xs text-gray-600">Commands</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{session.cartItems}</p>
                <p className="text-xs text-gray-600">Items Added</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">
                  {new Date(session.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="text-xs text-gray-600">Session Start</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-8 rounded-lg border border-black/5 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            Practical guidance
          </div>
          <ul className="mt-3 space-y-2 text-sm leading-7 text-gray-600">
            <li>Keep commands short and focused so the system can classify intent more reliably.</li>
            <li>Use voice shopping for discovery and navigation first, then connect deeper cart logic gradually.</li>
            <li>Review command history to understand the phrases shoppers naturally use most often.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default VoiceCommerce;
