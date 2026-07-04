import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, BarChart3, Eye, FileText, Loader2, Plus, Save, Trash2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useUser } from '@/src/context/UserContext';
import CloudinaryUpload from '@/src/components/media/CloudinaryUpload';
import OptimizedImage from '@/src/components/ui/OptimizedImage';

type LocalizedStat = {
  value: string;
  label_en: string;
  label_bn: string;
  description_en: string;
  description_bn: string;
};

type TeamMember = {
  name: string;
  role_en: string;
  role_bn: string;
  bio_en: string;
  bio_bn: string;
  image: string;
};

type CtaContent = {
  title: string;
  body: string;
  primary_label: string;
  primary_link: string;
  secondary_label: string;
  secondary_link: string;
};

type TrustCard = {
  icon: 'shield' | 'truck' | 'clock' | 'heart';
  title_en: string;
  title_bn: string;
  description_en: string;
  description_bn: string;
};

type AboutContentForm = {
  about_hero_title: string;
  about_hero_highlight: string;
  about_hero_description: string;
  about_hero_image: string;
  about_mission_title: string;
  about_mission_body: string;
  about_why_title: string;
  about_why_body: string;
  about_story_image: string;
  about_hero_title_bn: string;
  about_hero_highlight_bn: string;
  about_hero_description_bn: string;
  about_mission_title_bn: string;
  about_mission_body_bn: string;
  about_why_title_bn: string;
  about_why_body_bn: string;
};

const defaultStats: LocalizedStat[] = [
  {
    value: '10K+',
    label_en: 'Customers served',
    label_bn: 'Satisfied customers',
    description_en: 'Growing orders across Bangladesh',
    description_bn: 'Growing orders across Bangladesh',
  },
  {
    value: '500+',
    label_en: 'Verified sellers',
    label_bn: 'Verified sellers',
    description_en: 'Curated and reviewed merchants',
    description_bn: 'Curated and reviewed merchants',
  },
];

const defaultTeam: TeamMember[] = [
  {
    name: 'Ayesha Rahman',
    role_en: 'Marketplace Operations Lead',
    role_bn: 'Marketplace Operations Lead',
    bio_en: 'Builds reliable seller and customer experiences end to end.',
    bio_bn: 'Builds reliable seller and customer experiences end to end.',
    image: '',
  },
];

const defaultCtaEn: CtaContent = {
  title: 'Build with us, shop with confidence',
  body: 'Whether you are discovering new products or growing as a seller, LofiMart gives you a more trusted commerce experience.',
  primary_label: 'Start Shopping',
  primary_link: '/shop',
  secondary_label: 'Become a Seller',
  secondary_link: '/seller/dashboard',
};

const defaultCtaBn: CtaContent = {
  title: 'Build with us, shop with confidence',
  body: 'Whether you are discovering new products or growing as a seller, LofiMart gives you a more trusted commerce experience.',
  primary_label: 'Start Shopping',
  primary_link: '/shop',
  secondary_label: 'Become a Seller',
  secondary_link: '/seller/dashboard',
};

const defaultTrustCards: TrustCard[] = [
  { icon: 'shield', title_en: 'Trusted', title_bn: 'Trusted', description_en: 'Verified sellers and secure payments', description_bn: 'Verified sellers and secure payments' },
  { icon: 'truck', title_en: 'Fast Delivery', title_bn: 'Fast delivery', description_en: 'Nationwide shipping in 3-5 days', description_bn: 'Nationwide shipping in 3-5 days' },
  { icon: 'clock', title_en: '24/7 Support', title_bn: '24/7 support', description_en: 'Always here to help you', description_bn: 'Always here to help you' },
  { icon: 'heart', title_en: 'Local First', title_bn: 'Local first', description_en: 'Supporting Bangladeshi brands', description_bn: 'Supporting Bangladeshi brands' },
];

const defaultForm: AboutContentForm = {
  about_hero_title: "Empowering Bangladesh's",
  about_hero_highlight: 'Digital Marketplace',
  about_hero_description:
    'LofiMart is more than just an e-commerce platform. We are a bridge between local artisans, passionate sellers, and millions of customers.',
  about_hero_image: '',
  about_mission_title: 'Our Mission',
  about_mission_body:
    'Founded in 2024, LofiMart was born out of a simple idea: to make quality products accessible to everyone in Bangladesh, regardless of their location.',
  about_why_title: 'Why Choose Us?',
  about_why_body:
    'We prioritize quality over quantity. Every seller on our platform goes through a rigorous verification process to ensure that you receive only the best products.',
  about_story_image: '',
  about_hero_title_bn: 'Bangladesh',
  about_hero_highlight_bn: 'Digital marketplace',
  about_hero_description_bn:
    'LofiMart is more than just an e-commerce platform. We connect local entrepreneurs, trusted sellers, and customers.',
  about_mission_title_bn: 'Our mission',
  about_mission_body_bn:
    'We want to make quality products accessible and create a reliable digital selling environment for local businesses.',
  about_why_title_bn: 'Why LofiMart',
  about_why_body_bn:
    'We build trust with verified sellers, secure payments, reliable delivery, and thoughtful support.',
};

const fallbackHeroImage = 'https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=1400&q=80';
const fallbackStoryImage = 'https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80';
const fallbackTeamImage = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80';

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <span className="text-primary">{icon}</span>
        <span>{title}</span>
      </h2>
      {subtitle ? <p className="text-sm text-gray-500">{subtitle}</p> : null}
    </div>
  );
}

export const AdminAboutContentPage = () => {
  const { token } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AboutContentForm>(defaultForm);
  const [stats, setStats] = useState<LocalizedStat[]>(defaultStats);
  const [team, setTeam] = useState<TeamMember[]>(defaultTeam);
  const [ctaEn, setCtaEn] = useState<CtaContent>(defaultCtaEn);
  const [ctaBn, setCtaBn] = useState<CtaContent>(defaultCtaBn);
  const [trustCards, setTrustCards] = useState<TrustCard[]>(defaultTrustCards);

  useEffect(() => {
    if (!token) return;

    fetch('/api/admin/content/about', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load about content');
        return res.json();
      })
      .then((data) => {
        setForm({
          ...defaultForm,
          ...data,
        });
        setStats(parseJson<LocalizedStat[]>(data.about_stats_json, defaultStats));
        setTeam(parseJson<TeamMember[]>(data.about_team_json, defaultTeam));
        setCtaEn(parseJson<CtaContent>(data.about_cta_en_json, defaultCtaEn));
        setCtaBn(parseJson<CtaContent>(data.about_cta_bn_json, defaultCtaBn));
        setTrustCards(parseJson<TrustCard[]>(data.about_trust_cards_json, defaultTrustCards));
      })
      .catch(() => {
        setForm(defaultForm);
        setStats(defaultStats);
        setTeam(defaultTeam);
        setCtaEn(defaultCtaEn);
        setCtaBn(defaultCtaBn);
        setTrustCards(defaultTrustCards);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const updateField = (key: keyof AboutContentForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateStat = (index: number, key: keyof LocalizedStat, value: string) => {
    setStats((current) => current.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  };

  const updateTeam = (index: number, key: keyof TeamMember, value: string) => {
    setTeam((current) => current.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  };

  const updateTrustCard = (index: number, key: keyof TrustCard, value: string) => {
    setTrustCards((current) => current.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  };

  const moveStat = (index: number, direction: -1 | 1) => {
    setStats((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const moveTeamMember = (index: number, direction: -1 | 1) => {
    setTeam((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const moveTrustCard = (index: number, direction: -1 | 1) => {
    setTrustCards((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const payload = useMemo(
    () => ({
      ...form,
      about_stats_json: JSON.stringify(stats),
      about_team_json: JSON.stringify(team),
      about_cta_en_json: JSON.stringify(ctaEn),
      about_cta_bn_json: JSON.stringify(ctaBn),
      about_trust_cards_json: JSON.stringify(trustCards),
    }),
    [form, stats, team, ctaEn, ctaBn, trustCards],
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await fetch('/api/admin/content/about', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Failed to save about content');
      toast.success('About page updated successfully.');
    } catch {
      toast.error('Failed to update about page.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  const inputClass = 'w-full rounded-xl border border-gray-200 px-4 py-3 text-sm';
  const textAreaClass = 'h-28 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm';
  const preview = {
    en: {
      heroTitle: form.about_hero_title,
      heroHighlight: form.about_hero_highlight,
      heroDescription: form.about_hero_description,
      missionTitle: form.about_mission_title,
      missionBody: form.about_mission_body,
      whyTitle: form.about_why_title,
      whyBody: form.about_why_body,
      cta: ctaEn,
    },
    bn: {
      heroTitle: form.about_hero_title_bn,
      heroHighlight: form.about_hero_highlight_bn,
      heroDescription: form.about_hero_description_bn,
      missionTitle: form.about_mission_title_bn,
      missionBody: form.about_mission_body_bn,
      whyTitle: form.about_why_title_bn,
      whyBody: form.about_why_body_bn,
      cta: ctaBn,
    },
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">About Page Content</h1>
        <p className="text-sm text-gray-500">Manage bilingual content, trust stats, team members, and CTA sections with a live preview-friendly editor.</p>
      </div>

      <form onSubmit={handleSave} className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6 rounded-2xl border border-black/5 bg-white p-8 shadow-sm">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="space-y-4 rounded-2xl border border-gray-100 p-6">
            <SectionTitle icon={<FileText size={20} />} title="English Content" />
            <input className={inputClass} value={form.about_hero_title} onChange={(e) => updateField('about_hero_title', e.target.value)} placeholder="Hero title" />
            <input className={inputClass} value={form.about_hero_highlight} onChange={(e) => updateField('about_hero_highlight', e.target.value)} placeholder="Hero highlight" />
            <textarea className={textAreaClass} value={form.about_hero_description} onChange={(e) => updateField('about_hero_description', e.target.value)} placeholder="Hero description" />
            <input className={inputClass} value={form.about_mission_title} onChange={(e) => updateField('about_mission_title', e.target.value)} placeholder="Mission title" />
            <textarea className={textAreaClass} value={form.about_mission_body} onChange={(e) => updateField('about_mission_body', e.target.value)} placeholder="Mission body" />
            <input className={inputClass} value={form.about_why_title} onChange={(e) => updateField('about_why_title', e.target.value)} placeholder="Why title" />
            <textarea className={textAreaClass} value={form.about_why_body} onChange={(e) => updateField('about_why_body', e.target.value)} placeholder="Why body" />
          </div>

          <div className="space-y-4 rounded-2xl border border-gray-100 p-6">
            <SectionTitle icon={<FileText size={20} />} title="Bangla Content" subtitle="You can keep Bangla copy in Romanized Bangla or Bengali script." />
            <input className={inputClass} value={form.about_hero_title_bn} onChange={(e) => updateField('about_hero_title_bn', e.target.value)} placeholder="Hero title (BN)" />
            <input className={inputClass} value={form.about_hero_highlight_bn} onChange={(e) => updateField('about_hero_highlight_bn', e.target.value)} placeholder="Hero highlight (BN)" />
            <textarea className={textAreaClass} value={form.about_hero_description_bn} onChange={(e) => updateField('about_hero_description_bn', e.target.value)} placeholder="Hero description (BN)" />
            <input className={inputClass} value={form.about_mission_title_bn} onChange={(e) => updateField('about_mission_title_bn', e.target.value)} placeholder="Mission title (BN)" />
            <textarea className={textAreaClass} value={form.about_mission_body_bn} onChange={(e) => updateField('about_mission_body_bn', e.target.value)} placeholder="Mission body (BN)" />
            <input className={inputClass} value={form.about_why_title_bn} onChange={(e) => updateField('about_why_title_bn', e.target.value)} placeholder="Why title (BN)" />
            <textarea className={textAreaClass} value={form.about_why_body_bn} onChange={(e) => updateField('about_why_body_bn', e.target.value)} placeholder="Why body (BN)" />
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-gray-100 p-6">
          <SectionTitle icon={<FileText size={20} />} title="Images" />
          <input className={inputClass} value={form.about_hero_image} onChange={(e) => updateField('about_hero_image', e.target.value)} placeholder="Hero image URL" />
          {form.about_hero_image ? <OptimizedImage src={form.about_hero_image} alt="Hero preview" widthHint={800} heightHint={320} className="h-40 w-full rounded-2xl object-cover" /> : null}
          <CloudinaryUpload label="Upload hero image" helper="Upload a polished brand image for the hero section." onUploaded={(url) => updateField('about_hero_image', url)} />
          <input className={inputClass} value={form.about_story_image} onChange={(e) => updateField('about_story_image', e.target.value)} placeholder="Story image URL" />
          {form.about_story_image ? <OptimizedImage src={form.about_story_image} alt="Story preview" widthHint={800} heightHint={320} className="h-40 w-full rounded-2xl object-cover" /> : null}
          <CloudinaryUpload label="Upload story image" helper="Use a team, marketplace, or brand photo for the story section." onUploaded={(url) => updateField('about_story_image', url)} />
        </div>

        <div className="space-y-4 rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between gap-4">
            <SectionTitle icon={<FileText size={20} />} title="Trust Cards" subtitle="These four cards sit below the About hero section." />
            <button
              type="button"
              onClick={() =>
                setTrustCards((current) => [
                  ...current,
                  { icon: 'shield', title_en: '', title_bn: '', description_en: '', description_bn: '' },
                ])
              }
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold hover:border-primary hover:text-primary"
            >
              <Plus size={16} />
              Add card
            </button>
          </div>
          <div className="space-y-4">
            {trustCards.map((card, index) => (
              <div key={index} className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-100 p-5 xl:grid-cols-[160px_1fr_1fr_auto_auto_auto]">
                <select className={inputClass} value={card.icon} onChange={(e) => updateTrustCard(index, 'icon', e.target.value as TrustCard['icon'])}>
                  <option value="shield">Shield</option>
                  <option value="truck">Truck</option>
                  <option value="clock">Clock</option>
                  <option value="heart">Heart</option>
                </select>
                <input className={inputClass} value={card.title_en} onChange={(e) => updateTrustCard(index, 'title_en', e.target.value)} placeholder="Title EN" />
                <input className={inputClass} value={card.title_bn} onChange={(e) => updateTrustCard(index, 'title_bn', e.target.value)} placeholder="Title BN" />
                <input className={inputClass} value={card.description_en} onChange={(e) => updateTrustCard(index, 'description_en', e.target.value)} placeholder="Description EN" />
                <input className={inputClass} value={card.description_bn} onChange={(e) => updateTrustCard(index, 'description_bn', e.target.value)} placeholder="Description BN" />
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => moveTrustCard(index, -1)}
                    className="rounded-xl border border-gray-200 px-3 py-3 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={index === 0}
                    aria-label="Move trust card up"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveTrustCard(index, 1)}
                    className="rounded-xl border border-gray-200 px-3 py-3 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={index === trustCards.length - 1}
                    aria-label="Move trust card down"
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrustCards((current) => current.filter((_, i) => i !== index))}
                    className="rounded-xl border border-red-200 px-3 py-3 text-red-600 hover:bg-red-50"
                    aria-label="Remove trust card"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between gap-4">
            <SectionTitle icon={<BarChart3 size={20} />} title="Trust Stats" subtitle="Add or remove highlight metrics shown on the About page." />
            <button
              type="button"
              onClick={() =>
                setStats((current) => [
                  ...current,
                  { value: '', label_en: '', label_bn: '', description_en: '', description_bn: '' },
                ])
              }
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold hover:border-primary hover:text-primary"
            >
              <Plus size={16} />
              Add stat
            </button>
          </div>
          <div className="space-y-4">
            {stats.map((stat, index) => (
              <div key={index} className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-100 p-5 xl:grid-cols-5">
                <input className={inputClass} value={stat.value} onChange={(e) => updateStat(index, 'value', e.target.value)} placeholder="Value" />
                <input className={inputClass} value={stat.label_en} onChange={(e) => updateStat(index, 'label_en', e.target.value)} placeholder="Label EN" />
                <input className={inputClass} value={stat.label_bn} onChange={(e) => updateStat(index, 'label_bn', e.target.value)} placeholder="Label BN" />
                <input className={inputClass} value={stat.description_en} onChange={(e) => updateStat(index, 'description_en', e.target.value)} placeholder="Description EN" />
                <div className="flex gap-3">
                  <input className={`${inputClass} flex-1`} value={stat.description_bn} onChange={(e) => updateStat(index, 'description_bn', e.target.value)} placeholder="Description BN" />
                  <button
                    type="button"
                    onClick={() => moveStat(index, -1)}
                    className="rounded-xl border border-gray-200 px-3 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Move stat up"
                    disabled={index === 0}
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStat(index, 1)}
                    className="rounded-xl border border-gray-200 px-3 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Move stat down"
                    disabled={index === stats.length - 1}
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setStats((current) => current.filter((_, i) => i !== index))}
                    className="rounded-xl border border-red-200 px-3 text-red-600 hover:bg-red-50"
                    aria-label="Remove stat"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between gap-4">
            <SectionTitle icon={<Users size={20} />} title="Team Members" subtitle="Manage team cards visually instead of editing JSON." />
            <button
              type="button"
              onClick={() =>
                setTeam((current) => [
                  ...current,
                  { name: '', role_en: '', role_bn: '', bio_en: '', bio_bn: '', image: '' },
                ])
              }
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold hover:border-primary hover:text-primary"
            >
              <Plus size={16} />
              Add member
            </button>
          </div>
          <div className="space-y-6">
            {team.map((member, index) => (
              <div key={index} className="space-y-4 rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Team Member {index + 1}</h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => moveTeamMember(index, -1)}
                      className="rounded-xl border border-gray-200 px-3 py-2 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Move member up"
                      disabled={index === 0}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveTeamMember(index, 1)}
                      className="rounded-xl border border-gray-200 px-3 py-2 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Move member down"
                      disabled={index === team.length - 1}
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTeam((current) => current.filter((_, i) => i !== index))}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={16} />
                      Remove
                    </button>
                  </div>
                </div>
                <div className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50">
                  <img
                    src={member.image || fallbackTeamImage}
                    alt={member.name || `Team member ${index + 1}`}
                    className="h-56 w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <input className={inputClass} value={member.name} onChange={(e) => updateTeam(index, 'name', e.target.value)} placeholder="Name" />
                  <input className={inputClass} value={member.image} onChange={(e) => updateTeam(index, 'image', e.target.value)} placeholder="Optional manual image URL" />
                  <input className={inputClass} value={member.role_en} onChange={(e) => updateTeam(index, 'role_en', e.target.value)} placeholder="Role EN" />
                  <input className={inputClass} value={member.role_bn} onChange={(e) => updateTeam(index, 'role_bn', e.target.value)} placeholder="Role BN" />
                  <textarea className={textAreaClass} value={member.bio_en} onChange={(e) => updateTeam(index, 'bio_en', e.target.value)} placeholder="Bio EN" />
                  <textarea className={textAreaClass} value={member.bio_bn} onChange={(e) => updateTeam(index, 'bio_bn', e.target.value)} placeholder="Bio BN" />
                </div>
                <CloudinaryUpload
                  label="Upload member image"
                  helper="Pick a file directly. We will upload it and fill the image URL automatically."
                  onUploaded={(url) => updateTeam(index, 'image', url)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="space-y-4 rounded-2xl border border-gray-100 p-6">
            <SectionTitle icon={<FileText size={20} />} title="CTA Content (EN)" />
            <input className={inputClass} value={ctaEn.title} onChange={(e) => setCtaEn((current) => ({ ...current, title: e.target.value }))} placeholder="CTA title" />
            <textarea className={textAreaClass} value={ctaEn.body} onChange={(e) => setCtaEn((current) => ({ ...current, body: e.target.value }))} placeholder="CTA body" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <input className={inputClass} value={ctaEn.primary_label} onChange={(e) => setCtaEn((current) => ({ ...current, primary_label: e.target.value }))} placeholder="Primary label" />
              <input className={inputClass} value={ctaEn.primary_link} onChange={(e) => setCtaEn((current) => ({ ...current, primary_link: e.target.value }))} placeholder="Primary link" />
              <input className={inputClass} value={ctaEn.secondary_label} onChange={(e) => setCtaEn((current) => ({ ...current, secondary_label: e.target.value }))} placeholder="Secondary label" />
              <input className={inputClass} value={ctaEn.secondary_link} onChange={(e) => setCtaEn((current) => ({ ...current, secondary_link: e.target.value }))} placeholder="Secondary link" />
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-gray-100 p-6">
            <SectionTitle icon={<FileText size={20} />} title="CTA Content (BN)" />
            <input className={inputClass} value={ctaBn.title} onChange={(e) => setCtaBn((current) => ({ ...current, title: e.target.value }))} placeholder="CTA title BN" />
            <textarea className={textAreaClass} value={ctaBn.body} onChange={(e) => setCtaBn((current) => ({ ...current, body: e.target.value }))} placeholder="CTA body BN" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <input className={inputClass} value={ctaBn.primary_label} onChange={(e) => setCtaBn((current) => ({ ...current, primary_label: e.target.value }))} placeholder="Primary label BN" />
              <input className={inputClass} value={ctaBn.primary_link} onChange={(e) => setCtaBn((current) => ({ ...current, primary_link: e.target.value }))} placeholder="Primary link BN" />
              <input className={inputClass} value={ctaBn.secondary_label} onChange={(e) => setCtaBn((current) => ({ ...current, secondary_label: e.target.value }))} placeholder="Secondary label BN" />
              <input className={inputClass} value={ctaBn.secondary_link} onChange={(e) => setCtaBn((current) => ({ ...current, secondary_link: e.target.value }))} placeholder="Secondary link BN" />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 px-8 py-3">
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            <span>Save About Page</span>
          </button>
        </div>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
            <SectionTitle icon={<Eye size={20} />} title="Live Preview" subtitle="A quick visual preview of how the About page content is shaping up." />
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-black/5 bg-gray-950 text-white shadow-xl">
            <div className="relative">
              <OptimizedImage src={form.about_hero_image || fallbackHeroImage} alt="Hero preview" widthHint={1120} heightHint={480} className="h-56 w-full object-cover opacity-40" />
              <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-slate-900/70 to-emerald-900/40" />
              <div className="absolute inset-0 flex flex-col justify-end p-6">
                <p className="text-xs uppercase tracking-[0.25em] text-white/60">English Preview</p>
                <h3 className="mt-3 text-3xl font-bold leading-tight">
                  {preview.en.heroTitle} <span className="text-primary">{preview.en.heroHighlight}</span>
                </h3>
                <p className="mt-3 text-sm leading-6 text-white/80">{preview.en.heroDescription}</p>
              </div>
            </div>
            <div className="space-y-6 p-6">
              <div className="grid gap-3 md:grid-cols-2">
                {trustCards.slice(0, 4).map((card, index) => (
                  <div key={index} className="rounded-2xl bg-white/5 p-4">
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">{card.icon}</p>
                    <p className="mt-2 font-semibold">{card.title_en || 'Trust card title'}</p>
                    <p className="mt-1 text-xs text-white/60">{card.description_en || 'Short supporting description'}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl bg-white p-5 text-gray-900">
                <h4 className="text-xl font-bold">{preview.en.missionTitle}</h4>
                <p className="mt-2 text-sm leading-6 text-gray-600">{preview.en.missionBody}</p>
              </div>
              <div className="overflow-hidden rounded-2xl border border-white/10">
                <OptimizedImage src={form.about_story_image || fallbackStoryImage} alt="Story preview" widthHint={880} heightHint={360} className="h-44 w-full object-cover" />
              </div>
              <div className="rounded-2xl bg-emerald-950/60 p-5">
                <h4 className="text-xl font-bold">{preview.en.cta.title}</h4>
                <p className="mt-2 text-sm leading-6 text-white/75">{preview.en.cta.body}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <span className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-950">{preview.en.cta.primary_label || 'Primary CTA'}</span>
                  <span className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white">{preview.en.cta.secondary_label || 'Secondary CTA'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
            <p className="text-xs uppercase tracking-[0.25em] text-gray-400">Bangla Preview</p>
            <h3 className="mt-3 text-2xl font-bold leading-tight">
              {preview.bn.heroTitle} <span className="text-primary">{preview.bn.heroHighlight}</span>
            </h3>
            <p className="mt-3 text-sm leading-6 text-gray-600">{preview.bn.heroDescription}</p>
            <div className="mt-5 grid gap-3">
              {team.slice(0, 2).map((member, index) => (
                <div key={index} className="flex items-center gap-4 rounded-2xl border border-gray-100 p-3">
                  <img
                    src={member.image || fallbackTeamImage}
                    alt={member.name || `Preview member ${index + 1}`}
                    className="h-16 w-16 rounded-2xl object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <p className="font-semibold text-gray-900">{member.name || 'Team member name'}</p>
                    <p className="text-sm text-primary">{member.role_bn || member.role_en || 'Role'}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-2xl bg-gray-50 p-4">
              <h4 className="font-bold text-gray-900">{preview.bn.cta.title}</h4>
              <p className="mt-2 text-sm leading-6 text-gray-600">{preview.bn.cta.body}</p>
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
};
