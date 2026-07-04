import React, { useState } from 'react';
import { BrainCircuit, Headphones, Mic, MicOff, RefreshCw, Sparkles, Volume2 } from 'lucide-react';

const LiveConcierge: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [isListening, setIsListening] = useState(false);

  const startSession = async () => {
    try {
      setIsActive(true);
      setStatus('Connecting voice assistant...');
      setTimeout(() => {
        setStatus('Listening for your request...');
        setIsListening(true);
      }, 1000);
    } catch {
      setStatus('Please allow microphone access to continue.');
    }
  };

  const stopSession = () => {
    setIsActive(false);
    setIsListening(false);
    setStatus('Ready');
  };

  const quickPrompts = [
    'Find Eid gift ideas under 3000 BDT',
    'Help me compare wireless earbuds',
    'Track my latest order',
    'Recommend a thoughtful home decor gift',
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-12">
      <div className="space-y-4 text-center">
        <div className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-blue-600">
          <Sparkles className="mr-2 h-4 w-4" />
          Voice Assistance
        </div>
        <h1 className="text-5xl font-black tracking-tight text-gray-900">
          Live <span className="text-blue-600">Concierge</span>
        </h1>
        <p className="mx-auto max-w-2xl text-lg font-medium text-gray-500">
          Use voice guidance for product discovery, order help, and faster shopping support.
        </p>
      </div>

      <div className="relative space-y-10 overflow-hidden rounded-[4rem] border-4 border-gray-50 bg-white p-12 text-center shadow-2xl md:p-20">
        <div className={`absolute inset-0 bg-blue-600/5 blur-3xl ${isActive ? 'opacity-100' : 'opacity-0'}`} />

        <div className="relative flex h-48 items-center justify-center">
          <div
            className={`flex h-32 w-32 items-center justify-center rounded-full shadow-2xl transition-all duration-500 ${
              isActive ? 'scale-110 bg-blue-600' : 'scale-100 bg-gray-100'
            }`}
          >
            {isActive ? (
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((bar) => (
                  <div
                    key={bar}
                    className={`w-1.5 rounded-full bg-white transition-all ${
                      isListening ? 'h-8 animate-bounce' : 'h-1.5'
                    }`}
                    style={{ animationDelay: `${bar * 0.1}s` }}
                  />
                ))}
              </div>
            ) : (
              <Headphones className="h-10 w-10 text-gray-400" />
            )}
          </div>
        </div>

        <div className="space-y-4">
          <p className={`text-2xl font-black ${isActive ? 'text-blue-600' : 'text-gray-400'}`}>{status}</p>
          {!isActive ? (
            <button
              onClick={() => void startSession()}
              className="rounded-[2rem] bg-gray-900 px-12 py-5 font-black uppercase tracking-widest text-white shadow-xl hover:bg-blue-600"
            >
              <Mic className="mr-3 inline h-5 w-5" />
              Start Session
            </button>
          ) : (
            <button
              onClick={stopSession}
              className="rounded-[2rem] border border-red-100 bg-red-50 px-12 py-5 font-black uppercase tracking-widest text-red-600 hover:bg-red-100"
            >
              <MicOff className="mr-3 inline h-5 w-5" />
              Stop Session
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-[2rem] border bg-white p-6 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <BrainCircuit className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-gray-900">Smart support</h2>
          <p className="mt-2 text-sm leading-7 text-gray-600">
            Help shoppers move from broad intent to products, recommendations, and order help faster.
          </p>
        </div>
        <div className="rounded-[2rem] border bg-white p-6 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Volume2 className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-gray-900">Natural prompts</h2>
          <p className="mt-2 text-sm leading-7 text-gray-600">
            Voice works best when customers can ask naturally, without learning new commands first.
          </p>
        </div>
        <div className="rounded-[2rem] border bg-white p-6 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <RefreshCw className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-gray-900">Connected flows</h2>
          <p className="mt-2 text-sm leading-7 text-gray-600">
            Use voice to jump into tracking, recommendations, and product search without breaking context.
          </p>
        </div>
      </div>

      <div className="rounded-[2rem] border bg-white p-8 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900">Suggested prompts</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => setStatus(`Prompt selected: ${prompt}`)}
              className="rounded-2xl border bg-gray-50 px-5 py-4 text-left text-sm font-medium text-gray-700 transition hover:bg-blue-50 hover:text-blue-700"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LiveConcierge;
