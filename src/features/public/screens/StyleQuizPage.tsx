import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowRight, Check, RefreshCcw, ShoppingBag } from 'lucide-react';
import { Link } from '@/src/lib/navigation';
const questions = [
  {
    id: 1,
    question: "What's your primary style vibe?",
    options: [
      { label: "Minimalist & Clean", value: "minimalist", image: "linear-gradient(135deg,#e2e8f0 0%,#f8fafc 100%)" },
      { label: "Tech & Futuristic", value: "tech", image: "linear-gradient(135deg,#0f172a 0%,#2563eb 100%)" },
      { label: "Streetwear & Bold", value: "streetwear", image: "linear-gradient(135deg,#111827 0%,#ef4444 100%)" },
      { label: "Classic & Elegant", value: "classic", image: "linear-gradient(135deg,#faf5ff 0%,#d4af37 100%)" }
    ]
  },
  {
    id: 2,
    question: "Which color palette speaks to you?",
    options: [
      { label: "Monochrome (Black/White)", value: "monochrome", image: "linear-gradient(135deg,#0f172a 0%,#e2e8f0 100%)" },
      { label: "Earth Tones (Beige/Olive)", value: "earth", image: "linear-gradient(135deg,#a3b18a 0%,#e7d7c1 100%)" },
      { label: "Vibrant & Neon", value: "vibrant", image: "linear-gradient(135deg,#ec4899 0%,#8b5cf6 50%,#22d3ee 100%)" },
      { label: "Pastels & Soft", value: "pastel", image: "linear-gradient(135deg,#fbcfe8 0%,#ddd6fe 100%)" }
    ]
  },
  {
    id: 3,
    question: "What's your typical daily activity?",
    options: [
      { label: "Office & Professional", value: "office", image: "linear-gradient(135deg,#cbd5e1 0%,#94a3b8 100%)" },
      { label: "Creative & Artistic", value: "creative", image: "linear-gradient(135deg,#fb7185 0%,#f59e0b 50%,#8b5cf6 100%)" },
      { label: "Active & Fitness", value: "fitness", image: "linear-gradient(135deg,#16a34a 0%,#0ea5e9 100%)" },
      { label: "Casual & Home", value: "casual", image: "linear-gradient(135deg,#f5f5f4 0%,#d6d3d1 100%)" }
    ]
  }
];

export const StyleQuizPage = () => {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [isFinished, setIsFinished] = useState(false);

  const handleOptionSelect = (value: string) => {
    const newAnswers = [...answers, value];
    setAnswers(newAnswers);
    
    if (step < questions.length - 1) {
      setStep(step + 1);
    } else {
      setIsFinished(true);
    }
  };

  const resetQuiz = () => {
    setStep(0);
    setAnswers([]);
    setIsFinished(false);
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4">
      <div className="max-w-4xl w-full">
        <AnimatePresence mode="wait">
          {!isFinished ? (
            <motion.div
              key="quiz"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-[40px] p-8 md:p-12 shadow-2xl shadow-indigo-100 border border-indigo-50"
            >
              <div className="flex items-center gap-2 mb-8">
                <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-indigo-600 uppercase tracking-widest">AI Style Match</h2>
                  <p className="text-xs text-gray-400">Step {step + 1} of {questions.length}</p>
                </div>
              </div>

              <h1 className="text-3xl md:text-4xl font-bold mb-12 text-gray-900">
                {questions[step].question}
              </h1>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {questions[step].options.map((option, idx) => (
                  <motion.button
                    key={option.value}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleOptionSelect(option.value)}
                    className="group relative h-48 rounded-3xl overflow-hidden text-left"
                  >
                    <div
                      className="absolute inset-0 transition-transform duration-500 group-hover:scale-110"
                      style={{ backgroundImage: option.image }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between">
                      <span className="text-white font-bold text-lg">{option.label}</span>
                      <div className="w-8 h-8 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <ArrowRight className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>

              <div className="mt-12 flex gap-2">
                {questions.map((_, idx) => (
                  <div 
                    key={idx} 
                    className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${idx <= step ? 'bg-indigo-600' : 'bg-gray-100'}`} 
                  />
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="results"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-[40px] p-8 md:p-12 shadow-2xl shadow-indigo-100 border border-indigo-50 text-center"
            >
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-8 text-emerald-600">
                <Check className="w-10 h-10" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-4">Your Style Profile is Ready!</h1>
              <p className="text-gray-500 mb-12 max-w-lg mx-auto">
                Our AI has analyzed your choices. You have a <span className="text-indigo-600 font-bold capitalize">{answers[0]}</span> aesthetic with a focus on <span className="text-indigo-600 font-bold capitalize">{answers[2]}</span> utility.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-gray-50 rounded-3xl p-4 border border-gray-100">
                    <div className="aspect-square rounded-2xl bg-gray-200 mb-4 overflow-hidden">
                      <div
                        className="h-full w-full"
                        style={{
                          backgroundImage: [
                            'linear-gradient(135deg,#dbeafe 0%,#ede9fe 100%)',
                            'linear-gradient(135deg,#ecfccb 0%,#dbeafe 100%)',
                            'linear-gradient(135deg,#fee2e2 0%,#fef3c7 100%)',
                          ][i - 1],
                        }}
                      />
                    </div>
                    <p className="font-bold text-sm mb-1">Curated Pick #{i}</p>
                    <p className="text-xs text-gray-400">98% Match</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link 
                  to="/shop" 
                  className="w-full sm:w-auto bg-indigo-600 text-white px-8 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                >
                  <ShoppingBag className="w-5 h-5" />
                  Shop My Collection
                </Link>
                <button 
                  onClick={resetQuiz}
                  className="w-full sm:w-auto bg-gray-100 text-gray-600 px-8 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-gray-200 transition-all"
                >
                  <RefreshCcw className="w-5 h-5" />
                  Retake Quiz
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
