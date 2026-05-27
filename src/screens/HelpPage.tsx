import React, { useEffect, useMemo, useState } from 'react';
import { Search, MessageCircle, Package, RefreshCcw, CreditCard, Truck } from 'lucide-react';
import { useNavigate } from '@/src/lib/navigation';
import { AnimatedIcon } from '../components/ui/AnimatedIcon';

export const HelpPage = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const topic = params.get('topic');
    if (topic === 'contact-support') {
      setQuery('support');
    }
  }, []);

  const faqs = [
    {
      category: 'Orders & Shipping',
      questions: [
        { q: 'How can I track my order?', a: 'You can track your order by visiting the Track page and entering your Order ID and Email.' },
        { q: 'What are the delivery charges?', a: 'We offer free delivery on orders over 2000 BDT. Below that, fees vary by location.' }
      ]
    },
    {
      category: 'Returns & Refunds',
      questions: [
        { q: 'What is your return policy?', a: 'We have a 7-day easy return policy for most items. Products must be unused and in their original packaging.' },
        { q: 'How long does a refund take?', a: 'Once your return is verified, refunds are processed within 7 to 10 business days.' }
      ]
    },
    {
      category: 'Payments',
      questions: [
        { q: 'Which payment methods do you accept?', a: 'We support cards, mobile wallets, cash on delivery, and local payment options based on checkout availability.' },
        { q: 'Why was my payment declined?', a: 'Declines can happen because of bank checks, incorrect details, or insufficient balance. Try again or choose another method.' }
      ]
    }
  ];

  const filteredFaqs = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return faqs;

    return faqs
      .map((group) => ({
        ...group,
        questions: group.questions.filter((item) =>
          item.q.toLowerCase().includes(term) || item.a.toLowerCase().includes(term) || group.category.toLowerCase().includes(term)
        ),
      }))
      .filter((group) => group.questions.length > 0);
  }, [query]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-20 space-y-16">
      <div className="text-center space-y-6">
        <h1 className="text-4xl md:text-5xl font-bold font-display">How can we help?</h1>
        <div className="relative max-w-2xl mx-auto">
          <AnimatedIcon loop="pulse" className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
            <Search size={20} />
          </AnimatedIcon>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for articles, guides, or FAQs..."
            className="w-full bg-white border border-gray-200 rounded-2xl py-4 pl-12 pr-4 shadow-lg focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {[
          { icon: <Package size={32} />, title: 'Orders', desc: 'Tracking, changes, and cancellations', action: () => navigate('/contact?subject=Order%20Support&message=I%20need%20help%20with%20an%20order.%20My%20order%20ID%20is%20ASB-.') },
          { icon: <RefreshCcw size={32} />, title: 'Returns', desc: 'Policy, process, and status', action: () => navigate('/contact?subject=Return%20Support&message=I%20need%20help%20with%20a%20return%20request%20for%20order%20ASB-.') },
          { icon: <CreditCard size={32} />, title: 'Payments', desc: 'Methods, issues, and refunds', action: () => navigate('/contact?subject=Payment%20Support&message=I%20need%20help%20with%20a%20payment%20issue%20for%20order%20ASB-.') },
        ].map((item) => (
          <button key={item.title} type="button" onClick={item.action} className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm hover:shadow-md transition-all text-center space-y-4">
            <div className="text-primary flex justify-center">
              <AnimatedIcon loop="float" glow>{item.icon}</AnimatedIcon>
            </div>
            <h3 className="font-bold text-lg">{item.title}</h3>
            <p className="text-sm text-gray-500">{item.desc}</p>
          </button>
        ))}
      </div>

      <div className="space-y-12">
        <h2 className="text-3xl font-bold text-center">Frequently Asked Questions</h2>
        {filteredFaqs.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-200 rounded-3xl px-6 py-12 text-center">
            <p className="text-gray-600">No FAQ matched your search. Try another keyword or contact support.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {filteredFaqs.map((cat) => (
              <div key={cat.category} className="space-y-6">
                <h3 className="text-xl font-bold text-primary border-b border-primary/10 pb-2">{cat.category}</h3>
                <div className="space-y-6">
                  {cat.questions.map((item) => (
                    <div key={item.q} className="space-y-2">
                      <p className="font-bold text-gray-900">{item.q}</p>
                      <p className="text-sm text-gray-600 leading-relaxed">{item.a}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-gray-900 rounded-3xl p-8 md:p-12 text-center text-white space-y-6">
        <h2 className="text-3xl font-bold">Still need help?</h2>
        <p className="text-gray-400">Our support team is available 24/7 to assist you with any inquiries.</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            type="button"
            onClick={() =>
              navigate(
                '/contact?subject=General%20Inquiry&message=Hello%20support%20team,%20I%20need%20help%20with...',
              )
            }
            className="btn-primary px-8 py-3 flex items-center space-x-2"
          >
            <AnimatedIcon loop="none"><MessageCircle size={20} /></AnimatedIcon>
            <span>Contact Support</span>
          </button>
          <button type="button" onClick={() => navigate('/track')} className="bg-white/10 hover:bg-white/20 px-8 py-3 rounded-xl font-bold transition-all flex items-center space-x-2">
            <AnimatedIcon loop="none"><Truck size={18} /></AnimatedIcon>
            <span>Track an Order</span>
          </button>
        </div>
      </div>
    </div>
  );
};
