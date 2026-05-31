import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2,
  MessageCircle,
  Minimize2,
  Send,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

let chatBotInstanceClaimed = false;

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  intent?: string;
  confidence?: number;
}

interface ChatBotProps {
  userId?: string;
  userName?: string;
  initialOpen?: boolean;
  showLauncher?: boolean;
}

const quickReplies = [
  'Order Status',
  'Product Question',
  'Shipping Info',
  'Payment Issues',
  'Return or Exchange',
  'Contact Support',
];

const botIntents = {
  order_status: 'Let me help you track your order.',
  product_question: 'I can help you find the right product.',
  shipping: "Here's information about shipping.",
  payment: 'Let me assist with payment issues.',
  returns: 'I can help with returns and exchanges.',
  support: 'Let me escalate this to our support team.',
  greeting: 'Hello! How can I assist you today?',
  fallback: "I'm still learning. Let me connect you with a human agent.",
};

export const ChatBot: React.FC<ChatBotProps> = ({
  userId,
  initialOpen = false,
  showLauncher = true,
}) => {
  const [shouldRender] = useState(() => {
    if (chatBotInstanceClaimed) {
      return false;
    }

    chatBotInstanceClaimed = true;
    return true;
  });
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Hello! I'm Lofi Assistant. How can I help you today?",
      sender: 'bot',
      timestamp: new Date(),
      intent: 'greeting',
      confidence: 1,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(Math.random().toString(36).slice(2, 11));
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    return () => {
      if (shouldRender) {
        chatBotInstanceClaimed = false;
      }
    };
  }, [shouldRender]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    setSpeechEnabled(typeof window !== 'undefined' && 'speechSynthesis' in window);
  }, []);

  const classifyIntent = (text: string): string => {
    const lowerText = text.toLowerCase();

    if (lowerText.includes('order') || lowerText.includes('track')) return 'order_status';
    if (lowerText.includes('product') || lowerText.includes('which') || lowerText.includes('recommend')) return 'product_question';
    if (lowerText.includes('ship') || lowerText.includes('delivery') || lowerText.includes('arrive')) return 'shipping';
    if (lowerText.includes('pay') || lowerText.includes('card') || lowerText.includes('billing')) return 'payment';
    if (lowerText.includes('return') || lowerText.includes('exchange') || lowerText.includes('refund')) return 'returns';
    if (lowerText.includes('agent') || lowerText.includes('human') || lowerText.includes('support')) return 'support';

    return 'fallback';
  };

  const generateBotResponse = (intent: string): string => {
    const baseResponse = botIntents[intent as keyof typeof botIntents] || botIntents.fallback;

    switch (intent) {
      case 'order_status':
        return `${baseResponse}\n\nCould you please provide your order number? You can find it in your confirmation email.`;
      case 'product_question':
        return `${baseResponse}\n\nTell me more about what you're looking for, and I'll suggest some great options.`;
      case 'shipping':
        return `${baseResponse}\n\nStandard Delivery: 3-5 business days\nExpress Delivery: 1-2 business days\n\nWould you like more details?`;
      case 'payment':
        return `${baseResponse}\n\nWe accept:\n- Credit/Debit Cards\n- bKash\n- Nagad\n- Rocket\n\nWhat's the issue you're facing?`;
      case 'returns':
        return `${baseResponse}\n\nReturn Policy:\n- 30-day return window\n- Free return shipping\n- Full refund or exchange\n\nNeed more help?`;
      case 'support':
        return `${baseResponse}\n\nAverage wait time: 2 minutes.\nWould you like me to create a ticket for you?`;
      default:
        return `${baseResponse}\n\nI can help you with:\n- Orders\n- Products\n- Shipping\n- Payments\n- Returns\n\nWhat would you like to know?`;
    }
  };

  const handleSendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = input.trim();
    setInput('');
    setLoading(true);

    const userMsg: Message = {
      id: Date.now().toString(),
      text: userMessage,
      sender: 'user',
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    fetch('/api/ai/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        interaction_type: 'chat',
        session_id: sessionId,
        device_type: 'web',
      }),
    }).catch(() => {
      // Analytics logging is non-blocking for chat UX.
    });

    setTimeout(() => {
      const intent = classifyIntent(userMessage);
      const botResponse = generateBotResponse(intent);

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: botResponse,
        sender: 'bot',
        timestamp: new Date(),
        intent,
        confidence: 0.85,
      };

      setMessages((prev) => [...prev, botMsg]);
      setLoading(false);

      if (speechEnabled && isSpeaking) {
        speakResponse(botResponse);
      }
    }, 800);

    inputRef.current?.focus();
  };

  const handleQuickReply = (reply: string) => {
    setInput(reply.trim());
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const speakResponse = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }
  };

  const endChat = () => {
    const botMsg: Message = {
      id: (Date.now() + 1).toString(),
      text: 'Thank you for chatting with us! Is there anything else I can help you with?',
      sender: 'bot',
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, botMsg]);
  };

  if (!shouldRender) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 font-sans sm:bottom-6 sm:right-6">
      <AnimatePresence>
        {isOpen && !isMinimized && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: 'spring', stiffness: 300 }}
            className="mb-4 flex h-[min(32rem,calc(100vh-8rem))] w-[min(24rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] flex-col rounded-2xl border border-gray-100 bg-white shadow-2xl sm:h-96 sm:w-96 sm:max-w-[calc(100vw-32px)]"
          >
            <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-indigo-600 to-purple-600 p-4 text-white">
              <div className="flex items-center gap-3">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 3, repeat: Infinity }}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20"
                >
                  <MessageCircle className="h-6 w-6" />
                </motion.div>
                <div>
                  <h3 className="text-lg font-bold">Lofi Assistant</h3>
                  <p className="text-xs text-white/80">Always here to help</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {speechEnabled && (
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    onClick={() => setIsSpeaking((value) => !value)}
                    className="rounded-full p-2 transition hover:bg-white/20"
                    title={isSpeaking ? 'Disable voice' : 'Enable voice'}
                  >
                    {isSpeaking ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                  </motion.button>
                )}

                <motion.button
                  whileHover={{ scale: 1.1 }}
                  onClick={() => setIsMinimized(true)}
                  className="rounded-full p-2 transition hover:bg-white/20"
                  title="Minimize chat"
                >
                  <Minimize2 className="h-5 w-5" />
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.1 }}
                  onClick={() => {
                    endChat();
                    setIsOpen(false);
                  }}
                  className="rounded-full p-2 transition hover:bg-white/20"
                  title="Close chat"
                >
                  <X className="h-5 w-5" />
                </motion.button>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto bg-gray-50 p-4">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs rounded-2xl px-4 py-3 ${
                      msg.sender === 'user'
                        ? 'rounded-br-none bg-indigo-600 text-white'
                        : 'rounded-bl-none border border-gray-200 bg-white text-gray-900'
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-sm">{msg.text}</p>
                    <p className={`mt-1 text-xs ${msg.sender === 'user' ? 'text-indigo-100' : 'text-gray-500'}`}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </motion.div>
              ))}

              {loading && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {messages.length < 3 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-2 border-t border-gray-200 px-4 py-3"
              >
                <p className="text-xs font-semibold text-gray-600">Quick options:</p>
                <div className="grid grid-cols-2 gap-2">
                  {quickReplies.slice(0, 4).map((reply) => (
                    <motion.button
                      key={reply}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleQuickReply(reply)}
                      className="rounded-full bg-gray-100 px-3 py-2 text-xs text-gray-700 transition hover:bg-indigo-100"
                    >
                      {reply}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            <form onSubmit={handleSendMessage} className="rounded-b-2xl border-t border-gray-200 bg-white p-4">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  type="submit"
                  disabled={loading}
                  className="rounded-full bg-indigo-600 p-2 text-white transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Send className="h-5 w-5" />
                </motion.button>
              </div>
            </form>
          </motion.div>
        )}

        {isOpen && isMinimized && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="mb-4 flex cursor-pointer items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-white shadow-lg"
            onClick={() => setIsMinimized(false)}
          >
            <MessageCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Lofi Assistant</span>
            <motion.button
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
              className="ml-auto rounded-full p-1 hover:bg-indigo-500"
            >
              <X className="h-4 w-4" />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {!isOpen && showLauncher && (
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(true)}
          className="group relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg hover:shadow-xl"
          title="Open chat assistant"
        >
          <MessageCircle className="h-7 w-7" />
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white"
          >
            1
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            whileHover={{ opacity: 1, x: 0 }}
            className="pointer-events-none absolute right-full mr-4 whitespace-nowrap rounded-lg bg-gray-900 px-3 py-2 text-sm text-white"
          >
            Need help? Chat with us!
          </motion.div>
        </motion.button>
      )}
    </div>
  );
};

export default ChatBot;
