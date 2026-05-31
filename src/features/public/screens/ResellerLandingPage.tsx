import React from 'react';
import { motion } from 'framer-motion';
import {
  Zap,
  DollarSign,
  TrendingUp,
  Truck,
  ArrowRight,
  Package,
  Smartphone,
} from 'lucide-react';
import { Link } from '@/src/lib/navigation';

export const ResellerLandingPage = () => {
  const benefits = [
    {
      icon: <DollarSign className="text-emerald-600" />,
      title: 'Zero Investment',
      description: 'Start without buying stock. Inventory, fulfillment, and operations stay with the marketplace.',
    },
    {
      icon: <TrendingUp className="text-blue-600" />,
      title: 'High Profit Margins',
      description: 'Use seller-approved pricing, set your own selling price, and keep the margin after delivery.',
    },
    {
      icon: <Truck className="text-orange-600" />,
      title: 'Direct Shipping',
      description: 'Orders move through the main marketplace logistics flow, so resellers can focus on selling.',
    },
    {
      icon: <Smartphone className="text-purple-600" />,
      title: 'Easy Management',
      description: 'Manage links, manual orders, earnings, and payouts from one reseller dashboard.',
    },
  ];

  const steps = [
    {
      step: '01',
      title: 'Pick Products',
      desc: 'Choose seller-approved reseller products and add them to your storefront.',
    },
    {
      step: '02',
      title: 'Share & Sell',
      desc: 'Use your reseller storefront, direct product links, or manual order workflow to close sales.',
    },
    {
      step: '03',
      title: 'Earn Margin',
      desc: 'After successful delivery, your margin settles into your reseller earnings ledger.',
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      <section className="relative overflow-hidden py-20">
        <div className="absolute right-0 top-0 z-0 h-full w-1/2 -translate-x-[-8%] skew-x-[-12deg] bg-indigo-50/70" />

        <div className="relative z-10 mx-auto grid max-w-7xl gap-12 px-4 lg:grid-cols-2 lg:items-center">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-600">
              <Zap size={16} />
              <span>Built for fast reseller growth</span>
            </div>

            <h1 className="text-5xl font-bold leading-[1.1] tracking-tight lg:text-7xl">
              Start Your <span className="text-indigo-600">Online Business</span> Without Buying Stock
            </h1>

            <p className="max-w-lg text-xl leading-relaxed text-gray-500">
              Add approved products, set your selling price, share your storefront, and earn margin after successful delivery.
            </p>

            <div className="flex flex-col gap-4 sm:flex-row">
              <Link
                to="/reseller-dashboard/overview"
                className="flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-8 py-4 text-lg font-bold text-white shadow-xl shadow-indigo-200 transition-all hover:bg-indigo-700"
              >
                Start Reselling Now
                <ArrowRight size={20} />
              </Link>
              <Link
                to="/reseller-dashboard/shop"
                className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-8 py-4 text-lg font-bold text-gray-900 transition-all hover:bg-gray-50"
              >
                Explore Reseller Tools
              </Link>
            </div>

            <div className="flex items-center gap-8 pt-4">
              <div>
                <p className="text-2xl font-bold">BDT 15M+</p>
                <p className="text-sm text-gray-500">Tracked reseller payouts</p>
              </div>
              <div className="h-10 w-px bg-gray-200" />
              <div>
                <p className="text-2xl font-bold">100k+</p>
                <p className="text-sm text-gray-500">Products available</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="relative">
            <div className="relative z-10 overflow-hidden rounded-[40px] border border-gray-100 bg-[linear-gradient(135deg,#eef2ff_0%,#ffffff_42%,#ecfeff_100%)] p-8 shadow-2xl">
              <div className="grid gap-6">
                <div className="rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.24em] text-indigo-600">Reseller dashboard</p>
                      <h3 className="mt-2 text-2xl font-bold text-slate-950">Sell approved products and keep the margin</h3>
                    </div>
                    <div className="rounded-2xl bg-indigo-50 p-4 text-indigo-600">
                      <Package size={28} />
                    </div>
                  </div>
                  <div className="mt-6 grid grid-cols-3 gap-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">Orders</p>
                      <p className="mt-2 text-xl font-bold text-slate-950">128</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">Margin</p>
                      <p className="mt-2 text-xl font-bold text-slate-950">BDT 42k</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">Live links</p>
                      <p className="mt-2 text-xl font-bold text-slate-950">36</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-[28px] bg-slate-950 p-6 text-white">
                    <p className="text-xs uppercase tracking-[0.24em] text-white/60">Fast start</p>
                    <p className="mt-3 text-lg font-bold">Add products, set your sale price, and start sharing your storefront.</p>
                  </div>
                  <div className="rounded-[28px] bg-emerald-50 p-6 text-emerald-900">
                    <p className="text-xs uppercase tracking-[0.24em] text-emerald-700">Low friction</p>
                    <p className="mt-3 text-lg font-bold">No warehouse buying, no courier booking stress, no stock ownership required.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="animate-bounce-slow absolute -bottom-6 -left-6 z-20 flex items-center gap-4 rounded-3xl border border-gray-100 bg-white p-6 shadow-xl">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                <DollarSign size={24} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Last Commission</p>
                <p className="text-lg font-bold">BDT 2,450</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="bg-gray-50 py-24">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mx-auto mb-20 max-w-3xl text-center">
            <h2 className="mb-6 text-4xl font-bold">Why Resell With Us?</h2>
            <p className="text-lg text-gray-500">
              The reseller flow is built for people who want marketplace leverage without managing stock or courier operations.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {benefits.map((benefit, idx) => (
              <motion.div key={idx} whileHover={{ y: -10 }} className="rounded-[32px] border border-gray-100 bg-white p-8 shadow-sm">
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50">
                  {benefit.icon}
                </div>
                <h3 className="mb-4 text-xl font-bold">{benefit.title}</h3>
                <p className="leading-relaxed text-gray-500">{benefit.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto grid max-w-7xl gap-20 px-4 lg:grid-cols-2 lg:items-center">
          <div className="order-2 lg:order-1">
            <div className="overflow-hidden rounded-[40px] border border-slate-100 bg-[linear-gradient(135deg,#f8fafc_0%,#eef2ff_52%,#ecfeff_100%)] p-8 shadow-lg">
              <div className="grid gap-4">
                {steps.map((item, idx) => (
                  <div key={item.step} className="rounded-[28px] bg-white/90 p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-indigo-600">Step {idx + 1}</p>
                    <h3 className="mt-2 text-xl font-bold text-slate-950">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="order-1 space-y-12 lg:order-2">
            <h2 className="text-4xl font-bold">3 Simple Steps to Start</h2>

            <div className="space-y-8">
              {steps.map((item) => (
                <div key={item.step} className="flex gap-6">
                  <div className="text-4xl font-black text-gray-100">{item.step}</div>
                  <div>
                    <h4 className="mb-2 text-xl font-bold">{item.title}</h4>
                    <p className="text-gray-500">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <Link
              to="/reseller-dashboard/overview"
              className="inline-flex items-center gap-2 rounded-2xl bg-zinc-900 px-8 py-4 font-bold text-white transition-all hover:bg-zinc-800"
            >
              Get Started Now
              <ArrowRight size={20} />
            </Link>
          </div>
        </div>
      </section>

      <section className="px-4 py-24">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[48px] bg-indigo-600 p-12 text-center text-white lg:p-20">
          <div className="pointer-events-none absolute left-0 top-0 h-full w-full opacity-10">
            <div className="absolute left-0 top-0 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white blur-3xl" />
            <div className="absolute bottom-0 right-0 h-64 w-64 translate-x-1/2 translate-y-1/2 rounded-full bg-white blur-3xl" />
          </div>

          <h2 className="relative z-10 mb-8 text-4xl font-bold lg:text-6xl">Ready to become your own boss?</h2>
          <p className="relative z-10 mx-auto mb-12 max-w-2xl text-xl text-indigo-100">
            Launch your reseller storefront, take manual orders, and grow margin without inventory pressure.
          </p>

          <Link
            to="/reseller-dashboard/overview"
            className="relative z-10 inline-flex items-center gap-2 rounded-2xl bg-white px-10 py-5 text-xl font-bold text-indigo-600 shadow-2xl transition-all hover:bg-indigo-50"
          >
            Create My Reseller Shop
            <Zap size={24} />
          </Link>
        </div>
      </section>
    </div>
  );
};
