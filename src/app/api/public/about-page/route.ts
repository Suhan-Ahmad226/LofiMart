import { NextResponse } from 'next/server';
import { prismaDirect } from '../../../../features/shared/services/database/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const settingKeys = [
  'about_hero_title',
  'about_hero_highlight',
  'about_hero_description',
  'about_hero_image',
  'about_mission_title',
  'about_mission_body',
  'about_why_title',
  'about_why_body',
  'about_story_image',
  'about_hero_title_bn',
  'about_hero_highlight_bn',
  'about_hero_description_bn',
  'about_mission_title_bn',
  'about_mission_body_bn',
  'about_why_title_bn',
  'about_why_body_bn',
  'about_stats_json',
  'about_team_json',
  'about_cta_en_json',
  'about_cta_bn_json',
  'about_trust_cards_json',
] as const;

function parseJson(value: string | undefined, fallback: unknown[] | Record<string, string>) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function GET() {
  try {
    const settings = await prismaDirect.platformSetting.findMany({
      where: { key: { in: [...settingKeys] } },
    });

    const map = settings.reduce<Record<string, string>>((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {});

    return NextResponse.json({
      hero_title: map.about_hero_title || "Empowering Bangladesh's",
      hero_highlight: map.about_hero_highlight || "Digital Marketplace",
      hero_description:
        map.about_hero_description ||
        "LofiMart is more than just an e-commerce platform. We are a bridge between local artisans, passionate sellers, and millions of customers.",
      hero_image:
        map.about_hero_image ||
        "https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=1400&q=80",
      mission_title: map.about_mission_title || "Our Mission",
      mission_body:
        map.about_mission_body ||
        "Founded in 2024, LofiMart was born out of a simple idea: to make quality products accessible to everyone in Bangladesh, regardless of their location. We believe in the power of technology to transform lives and businesses. Our mission is to provide a seamless, secure, and enjoyable shopping experience while fostering the growth of local entrepreneurs.",
      why_title: map.about_why_title || "Why Choose Us?",
      why_body:
        map.about_why_body ||
        "We prioritize quality over quantity. Every seller on our platform goes through a rigorous verification process to ensure that you receive only the best products. From traditional Jamdani sarees to the latest tech gadgets, we curate our collection to meet the diverse needs of our community.",
      story_image:
        map.about_story_image ||
        "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80",
      hero_title_bn: map.about_hero_title_bn || "বাংলাদেশের",
      hero_highlight_bn: map.about_hero_highlight_bn || "ডিজিটাল মার্কেটপ্লেসকে এগিয়ে নিচ্ছি",
      hero_description_bn:
        map.about_hero_description_bn ||
        "LofiMart শুধু একটি ই-কমার্স প্ল্যাটফর্ম নয়। আমরা স্থানীয় উদ্যোক্তা, বিশ্বস্ত বিক্রেতা এবং লক্ষ গ্রাহকের মাঝে একটি শক্তিশালী সংযোগ গড়ে তুলি।",
      mission_title_bn: map.about_mission_title_bn || "আমাদের লক্ষ্য",
      mission_body_bn:
        map.about_mission_body_bn ||
        "বাংলাদেশের প্রতিটি মানুষের কাছে মানসম্মত পণ্য পৌঁছে দিতে এবং স্থানীয় উদ্যোক্তাদের জন্য টেকসই ডিজিটাল বিক্রয় পরিবেশ তৈরি করাই LofiMart-এর মূল লক্ষ্য।",
      why_title_bn: map.about_why_title_bn || "কেন LofiMart?",
      why_body_bn:
        map.about_why_body_bn ||
        "আমরা যাচাইকৃত বিক্রেতা, নিরাপদ পেমেন্ট, নির্ভরযোগ্য ডেলিভারি এবং উন্নত কাস্টমার সাপোর্টের মাধ্যমে একটি আস্থাভিত্তিক কেনাকাটার অভিজ্ঞতা তৈরি করি।",
      stats: parseJson(map.about_stats_json, [
        { value: "10K+", label_en: "Customers served", label_bn: "সন্তুষ্ট গ্রাহক", description_en: "Growing orders across Bangladesh", description_bn: "সারা দেশে বাড়ছে অর্ডার" },
        { value: "500+", label_en: "Verified sellers", label_bn: "যাচাইকৃত সেলার", description_en: "Curated and reviewed merchants", description_bn: "যাচাই করা বিক্রেতা নেটওয়ার্ক" },
        { value: "64", label_en: "District reach", label_bn: "জেলা কভারেজ", description_en: "Delivery support across the country", description_bn: "দেশব্যাপী ডেলিভারি নেটওয়ার্ক" },
        { value: "24/7", label_en: "Support coverage", label_bn: "সাপোর্ট সুবিধা", description_en: "Always-on customer assistance", description_bn: "সবসময় প্রস্তুত সহায়তা" },
      ]),
      team: parseJson(map.about_team_json, [
        { name: "Ayesha Rahman", role_en: "Marketplace Operations Lead", role_bn: "মার্কেটপ্লেস অপারেশনস লিড", bio_en: "Builds reliable seller and customer experiences end to end.", bio_bn: "সেলার ও কাস্টমার অভিজ্ঞতাকে নির্ভরযোগ্য করে তোলেন।", image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=80" },
        { name: "Imran Hossain", role_en: "Trust & Growth Manager", role_bn: "ট্রাস্ট ও গ্রোথ ম্যানেজার", bio_en: "Leads verification, conversion, and platform confidence systems.", bio_bn: "ভেরিফিকেশন, কনভার্সন ও প্ল্যাটফর্ম ট্রাস্ট দেখভাল করেন।", image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80" },
        { name: "Nusrat Jahan", role_en: "Customer Experience Lead", role_bn: "কাস্টমার এক্সপেরিয়েন্স লিড", bio_en: "Focuses on support quality, returns confidence, and retention.", bio_bn: "সাপোর্ট, রিটার্ন অভিজ্ঞতা ও গ্রাহক ধরে রাখার কাজে নেতৃত্ব দেন।", image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=800&q=80" },
      ]),
      cta_en: parseJson(map.about_cta_en_json, {
        title: "Build with us, shop with confidence",
        body: "Whether you are discovering new products or growing as a seller, LofiMart gives you a more trusted commerce experience.",
        primary_label: "Start Shopping",
        primary_link: "/shop",
        secondary_label: "Become a Seller",
        secondary_link: "/seller/dashboard",
      }),
      cta_bn: parseJson(map.about_cta_bn_json, {
        title: "আস্থার সাথে কেনাকাটা করুন, আমাদের সাথে বড় হোন",
        body: "নতুন পণ্য খুঁজে পাওয়া হোক বা একজন বিক্রেতা হিসেবে বৃদ্ধি, LofiMart আপনাকে আরও নির্ভরযোগ্য কমার্স অভিজ্ঞতা দেয়।",
        primary_label: "শপিং শুরু করুন",
        primary_link: "/shop",
        secondary_label: "সেলার হোন",
        secondary_link: "/seller/dashboard",
      }),
      trust_cards: parseJson(map.about_trust_cards_json, [
        { icon: "shield", title_en: "Trusted", title_bn: "বিশ্বস্ত", description_en: "Verified sellers and secure payments", description_bn: "যাচাইকৃত সেলার এবং নিরাপদ পেমেন্ট" },
        { icon: "truck", title_en: "Fast Delivery", title_bn: "দ্রুত ডেলিভারি", description_en: "Nationwide shipping in 3-5 days", description_bn: "সারাদেশে ৩-৫ দিনের ডেলিভারি" },
        { icon: "clock", title_en: "24/7 Support", title_bn: "২৪/৭ সাপোর্ট", description_en: "Always here to help you", description_bn: "সবসময় সাহায্যের জন্য প্রস্তুত" },
        { icon: "heart", title_en: "Local First", title_bn: "লোকাল ফার্স্ট", description_en: "Supporting Bangladeshi brands", description_bn: "বাংলাদেশি ব্র্যান্ডকে এগিয়ে নেওয়া" },
      ]),
    }, {
      headers: {
        'Cache-Control': 'public, max-age=600, s-maxage=1800, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('GET /api/public/about-page error:', error);
    return NextResponse.json({}, { headers: { 'X-Data-Source': 'fallback', 'Cache-Control': 'no-store' } });
  }
}
