import React from 'react';
import { RefreshCcw, ShieldCheck, Clock, AlertCircle } from 'lucide-react';
import { Link } from '../../../lib/navigation';

export const ReturnsPage = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-20 space-y-16">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold font-display">Returns & Refunds</h1>
        <p className="text-xl text-gray-500">We want you to be 100% satisfied with your purchase.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {[
          { icon: <Clock size={32} />, title: '7 Days Return', desc: 'Easy returns within 7 days of delivery' },
          { icon: <ShieldCheck size={32} />, title: 'Full Refund', desc: '100% money back guarantee' },
          { icon: <RefreshCcw size={32} />, title: 'Easy Exchange', desc: 'Swap for a different size or color' },
        ].map((item, i) => (
          <div key={i} className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm text-center space-y-4">
            <div className="text-primary flex justify-center">{item.icon}</div>
            <h3 className="font-bold text-lg">{item.title}</h3>
            <p className="text-sm text-gray-500">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="bg-white p-10 rounded-3xl border border-black/5 shadow-sm space-y-12">
        <section className="space-y-6">
          <h2 className="text-2xl font-bold flex items-center space-x-2">
            <AlertCircle className="text-primary" />
            <span>Return Conditions</span>
          </h2>
          <ul className="space-y-4 text-gray-600">
            <li className="flex items-start space-x-3">
              <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
              <span>The product must be unused, unwashed, and without any flaws.</span>
            </li>
            <li className="flex items-start space-x-3">
              <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
              <span>The product must include the original tags, user manual, warranty cards, and accessories.</span>
            </li>
            <li className="flex items-start space-x-3">
              <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
              <span>The product must be returned in the original and undamaged manufacturer packaging/box.</span>
            </li>
          </ul>
        </section>

        <section className="space-y-6">
          <h2 className="text-2xl font-bold">How to Return?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Initiate Return', desc: 'Go to your orders and click on "Return Item"' },
              { step: '02', title: 'Pack Item', desc: 'Pack the item securely in its original packaging' },
              { step: '03', title: 'Handover', desc: 'Our courier will pick up the item from your doorstep' },
            ].map((item, i) => (
              <div key={i} className="space-y-2">
                <p className="text-4xl font-bold text-primary/20 font-display">{item.step}</p>
                <h4 className="font-bold">{item.title}</h4>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-center space-y-4">
          <h3 className="text-xl font-bold">Need return help for a specific order?</h3>
          <p className="text-sm text-gray-600">
            Open your order details to submit a return request, or contact support with the order reference for manual help.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/account/orders" className="btn-primary px-6 py-3">
              Open My Orders
            </Link>
            <Link
              to={`/contact?subject=${encodeURIComponent('Return Support')}&message=${encodeURIComponent(
                'I need help with a return request for order ASB-.',
              )}`}
              className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Contact support
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
};
