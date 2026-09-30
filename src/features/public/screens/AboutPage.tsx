import React, { useEffect, useMemo, useState } from 'react';
import { Link } from '../../../lib/navigation';
import { motion } from 'framer-motion';
import { Shield, Truck, Clock, Heart, ArrowRight, type LucideIcon } from 'lucide-react';
import { AnimatedIcon } from '@/features/shared/ui/AnimatedIcon';
import OptimizedImage from '@/features/shared/ui/OptimizedImage';

type TrustCard = {
  icon: 'shield' | 'truck' | 'clock' | 'heart';
  title_en: string;
  title_bn?: string;
  description_en: string;
  description_bn?: string;
};

type LocalizedStat = {
  value: string;
  label_en: string;
  label_bn?: string;
  description_en?: string;
  description_bn?: string;
};

type TeamMember = {
  name: string;
  role_en: string;
  role_bn?: string;
  bio_en?: string;
  bio_bn?: string;
  image: string;
};

type AboutContent = {
  hero_title: string;
  hero_highlight: string;
  hero_description: string;
  hero_image: string;
  mission_title: string;
  mission_body: string;
  why_title: string;
  why_body: string;
  story_image: string;
  hero_title_bn: string;
  hero_highlight_bn: string;
  hero_description_bn: string;
  mission_title_bn: string;
  mission_body_bn: string;
  why_title_bn: string;
  why_body_bn: string;
  trust_cards: TrustCard[];
  stats: LocalizedStat[];
  team: TeamMember[];
  cta_en: Record<string, string>;
  cta_bn: Record<string, string>;
};

const trustCardIcons: Record<TrustCard['icon'], LucideIcon> = {
  shield: Shield,
  truck: Truck,
  clock: Clock,
  heart: Heart,
};

const defaultContent: AboutContent = {
  hero_title: "Empowering Bangladesh's",
  hero_highlight: 'Digital Marketplace',
  hero_description:
    'LofiMart is more than just an e-commerce platform. We are a bridge between local artisans, passionate sellers, and millions of customers.',
  hero_image: 'https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=1400&q=80',
  mission_title: 'Our Mission',
  mission_body:
    'Founded in 2024, LofiMart was born out of a simple idea: to make quality products accessible to everyone in Bangladesh, regardless of their location. We believe in the power of technology to transform lives and businesses.',
  why_title: 'Why Choose Us?',
  why_body:
    'We prioritize quality over quantity. Every seller on our platform goes through a rigorous verification process to ensure that you receive only the best products.',
  story_image: 'https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80',
  hero_title_bn: 'বাংলাদেশের',
  hero_highlight_bn: 'ডিজিটাল মার্কেটপ্লেসকে এগিয়ে নিচ্ছি',
  hero_description_bn:
    'LofiMart শুধু একটি ই-কমার্স প্ল্যাটফর্ম নয়। আমরা স্থানীয় উদ্যোক্তা, বিশ্বস্ত বিক্রেতা এবং লক্ষ গ্রাহকের মাঝে একটি শক্তিশালী সংযোগ গড়ে তুলি।',
  mission_title_bn: 'আমাদের লক্ষ্য',
  mission_body_bn:
    'বাংলাদেশের প্রতিটি মানুষের কাছে মানসম্মত পণ্য পৌঁছে দিতে এবং স্থানীয় উদ্যোক্তাদের জন্য টেকসই ডিজিটাল বিক্রয় পরিবেশ তৈরি করাই LofiMart-এর মূল লক্ষ্য।',
  why_title_bn: 'কেন LofiMart?',
  why_body_bn:
    'আমরা যাচাইকৃত বিক্রেতা, নিরাপদ পেমেন্ট, নির্ভরযোগ্য ডেলিভারি এবং উন্নত কাস্টমার সাপোর্টের মাধ্যমে একটি আস্থাভিত্তিক কেনাকাটার অভিজ্ঞতা তৈরি করি।',
  trust_cards: [
    { icon: 'shield', title_en: 'Trusted', title_bn: 'বিশ্বস্ত', description_en: 'Verified sellers and secure payments', description_bn: 'যাচাইকৃত সেলার এবং নিরাপদ পেমেন্ট' },
    { icon: 'truck', title_en: 'Fast Delivery', title_bn: 'দ্রুত ডেলিভারি', description_en: 'Nationwide shipping in 3-5 days', description_bn: 'সারাদেশে ৩-৫ দিনের ডেলিভারি' },
    { icon: 'clock', title_en: '24/7 Support', title_bn: '২৪/৭ সাপোর্ট', description_en: 'Always here to help you', description_bn: 'সবসময় সাহায্যের জন্য প্রস্তুত' },
    { icon: 'heart', title_en: 'Local First', title_bn: 'লোকাল ফার্স্ট', description_en: 'Supporting Bangladeshi brands', description_bn: 'বাংলাদেশি ব্র্যান্ডকে এগিয়ে নেওয়া' },
  ],
  stats: [],
  team: [],
  cta_en: {
    title: 'Build with us, shop with confidence',
    body: 'Whether you are discovering new products or growing as a seller, LofiMart gives you a more trusted commerce experience.',
    primary_label: 'Start Shopping',
    primary_link: '/shop',
    secondary_label: 'Become a Seller',
    secondary_link: '/seller/dashboard',
  },
  cta_bn: {
    title: 'আস্থার সাথে কেনাকাটা করুন, আমাদের সাথে বড় হোন',
    body: 'নতুন পণ্য খুঁজে পাওয়া হোক বা একজন বিক্রেতা হিসেবে বৃদ্ধি, LofiMart আপনাকে আরও নির্ভরযোগ্য কমার্স অভিজ্ঞতা দেয়।',
    primary_label: 'শপিং শুরু করুন',
    primary_link: '/shop',
    secondary_label: 'সেলার হোন',
    secondary_link: '/seller/dashboard',
  },
};

export const AboutPage = () => {
  const [content, setContent] = useState<AboutContent>(defaultContent);
  const [language, setLanguage] = useState<'en' | 'bn'>('en');

  useEffect(() => {
    fetch('/api/public/about-page')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setContent({ ...defaultContent, ...data }))
      .catch(() => undefined);
  }, []);

  const localized = useMemo(() => {
    if (language === 'bn') {
      return {
        heroTitle: content.hero_title_bn,
        heroHighlight: content.hero_highlight_bn,
        heroDescription: content.hero_description_bn,
        missionTitle: content.mission_title_bn,
        missionBody: content.mission_body_bn,
        whyTitle: content.why_title_bn,
        whyBody: content.why_body_bn,
        cta: content.cta_bn,
        trustCards: content.trust_cards,
        teamTitle: 'আমাদের টিম',
        statsTitle: 'বিশ্বাসের ভিত্তি',
      };
    }

    return {
      heroTitle: content.hero_title,
      heroHighlight: content.hero_highlight,
      heroDescription: content.hero_description,
      missionTitle: content.mission_title,
      missionBody: content.mission_body,
      whyTitle: content.why_title,
      whyBody: content.why_body,
      cta: content.cta_en,
      trustCards: content.trust_cards,
      teamTitle: 'Meet Our Team',
      statsTitle: 'Built on Trust',
    };
  }, [content, language]);

  return (
    <div className="pb-20">
      <div className="relative overflow-hidden bg-gray-950 py-24 text-white">
        <div className="absolute inset-0">
          <OptimizedImage src={content.hero_image} alt="About LofiMart" eager widthHint={1600} heightHint={900} quality="auto:best" className="h-full w-full object-cover opacity-25" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(0,0,0,0.82),rgba(15,23,42,0.78),rgba(5,150,105,0.36))]" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4">
          <div className="mb-8 flex justify-end">
            <div className="inline-flex rounded-full bg-white/10 p-1 backdrop-blur">
              <button onClick={() => setLanguage('en')} className={`rounded-full px-4 py-2 text-sm font-semibold ${language === 'en' ? 'bg-white text-gray-950' : 'text-white/80'}`}>EN</button>
              <button onClick={() => setLanguage('bn')} className={`rounded-full px-4 py-2 text-sm font-semibold ${language === 'bn' ? 'bg-white text-gray-950' : 'text-white/80'}`}>বাংলা</button>
            </div>
          </div>
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-5xl font-bold font-display md:text-7xl">
                {localized.heroTitle} <br /> <span className="text-primary">{localized.heroHighlight}</span>
              </motion.h1>
              <p className="max-w-2xl text-xl text-gray-200">{localized.heroDescription}</p>
            </div>
            <div className="rounded-[2rem] border border-white/10 bg-white/10 p-4 backdrop-blur-sm shadow-2xl">
              <OptimizedImage src={content.hero_image} alt="LofiMart marketplace" eager widthHint={960} heightHint={720} quality="auto:best" className="h-[360px] w-full rounded-[1.5rem] object-cover" />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto -mt-12 max-w-7xl px-4">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
          {localized.trustCards.map((item, i) => {
            const Icon = trustCardIcons[item.icon] || Shield;
            return (
              <div key={i} className="space-y-4 rounded-2xl border border-black/5 bg-white p-8 text-center shadow-xl">
                <div className="flex justify-center text-primary"><AnimatedIcon loop="float" glow><Icon size={32} /></AnimatedIcon></div>
                <h3 className="text-lg font-bold">{language === 'bn' ? item.title_bn || item.title_en : item.title_en}</h3>
                <p className="text-sm text-gray-500">{language === 'bn' ? item.description_bn || item.description_en : item.description_en}</p>
              </div>
            );
          })}
        </div>
      </div>

      {content.stats.length > 0 && (
        <div className="mx-auto max-w-7xl px-4 pt-16">
          <div className="rounded-[2rem] border border-black/5 bg-white p-8 shadow-sm">
            <h2 className="text-3xl font-bold">{localized.statsTitle}</h2>
            <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {content.stats.map((stat, index) => (
                <div key={index} className="rounded-3xl bg-secondary/60 p-6">
                  <p className="text-3xl font-bold text-primary">{stat.value}</p>
                  <p className="mt-2 font-semibold text-gray-900">{language === 'bn' ? stat.label_bn || stat.label_en : stat.label_en}</p>
                  <p className="mt-1 text-sm text-gray-500">{language === 'bn' ? stat.description_bn || stat.description_en : stat.description_en}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-24 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-sm">
          <OptimizedImage src={content.story_image} alt="LofiMart story" widthHint={1000} heightHint={900} className="h-full min-h-[420px] w-full object-cover" />
        </div>

        <div className="space-y-10">
          <section className="space-y-4 rounded-[2rem] border border-black/5 bg-white p-8 shadow-sm">
            <h2 className="text-3xl font-bold">{localized.missionTitle}</h2>
            <p className="leading-relaxed text-gray-600">{localized.missionBody}</p>
          </section>
          <section className="space-y-4 rounded-[2rem] border border-black/5 bg-white p-8 shadow-sm">
            <h2 className="text-3xl font-bold">{localized.whyTitle}</h2>
            <p className="leading-relaxed text-gray-600">{localized.whyBody}</p>
          </section>
        </div>
      </div>

      {content.team.length > 0 && (
        <div className="mx-auto max-w-7xl px-4 pb-16">
          <h2 className="text-3xl font-bold">{localized.teamTitle}</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {content.team.map((member, index) => (
              <div key={index} className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-sm">
                <OptimizedImage src={member.image} alt={member.name} widthHint={720} heightHint={720} className="h-72 w-full object-cover" />
                <div className="p-6">
                  <h3 className="text-xl font-bold">{member.name}</h3>
                  <p className="mt-1 text-sm font-semibold text-primary">{language === 'bn' ? member.role_bn || member.role_en : member.role_en}</p>
                  <p className="mt-3 text-sm leading-6 text-gray-600">{language === 'bn' ? member.bio_bn || member.bio_en : member.bio_en}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4">
        <div className="rounded-[2rem] bg-[linear-gradient(135deg,#102418_0%,#163322_55%,#1a1a1a_100%)] p-8 text-white shadow-xl">
          <h2 className="text-3xl font-bold">{localized.cta.title}</h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-white/80">{localized.cta.body}</p>
          <div className="mt-6 flex flex-wrap gap-4">
            <Link to={localized.cta.primary_link || '/shop'} className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-gray-950">
              {localized.cta.primary_label}
              <ArrowRight size={16} />
            </Link>
            <Link to={localized.cta.secondary_link || '/seller/dashboard'} className="inline-flex items-center rounded-2xl border border-white/20 px-5 py-3 text-sm font-semibold text-white">
              {localized.cta.secondary_label}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
