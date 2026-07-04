export type FooterSocialKey = 'facebook' | 'instagram' | 'youtube' | 'telegram';

export type PublicFooterConfig = {
  brandDescription: string;
  supportEmail: string;
  contactPhone: string;
  contactAddress: string;
  socialLinks: Record<FooterSocialKey, string>;
  paymentMethods: string[];
  courierProviders: string[];
};

export const defaultFooterSettings = {
  footer_brand_description:
    'Your trusted destination for quality products in Bangladesh. Fast delivery, easy returns, and 100% genuine products.',
  footer_contact_phone: '+880 1700-000000',
  footer_contact_address: 'Dhaka, Bangladesh',
  footer_facebook_url: 'https://facebook.com/lofimart',
  footer_instagram_url: 'https://instagram.com/lofimart',
  footer_youtube_url: 'https://youtube.com/@lofimart',
  footer_telegram_url: 'https://t.me/lofimart_bot',
} as const;

export const footerSettingKeys = Object.keys(defaultFooterSettings);

export function parseCsvList(value: unknown, fallback: string[] = []) {
  const next = String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);

  return next.length > 0 ? next : fallback;
}

export function normalizeFooterSetting(key: string, value: unknown) {
  const fallback = defaultFooterSettings[key as keyof typeof defaultFooterSettings] || '';
  const next = String(value ?? fallback).trim();

  if (key.includes('_url')) {
    if (!next) return '';
    return /^https?:\/\//i.test(next) ? next : fallback;
  }

  if (key === 'footer_contact_phone') {
    return next.slice(0, 40) || fallback;
  }

  return next.slice(0, 240) || fallback;
}

export function buildPublicFooterConfig(settings: Record<string, string>): PublicFooterConfig {
  return {
    brandDescription: settings.footer_brand_description || defaultFooterSettings.footer_brand_description,
    supportEmail: settings.support_email || 'support@lofimart.com',
    contactPhone: settings.footer_contact_phone || defaultFooterSettings.footer_contact_phone,
    contactAddress: settings.footer_contact_address || defaultFooterSettings.footer_contact_address,
    socialLinks: {
      facebook: settings.footer_facebook_url || defaultFooterSettings.footer_facebook_url,
      instagram: settings.footer_instagram_url || defaultFooterSettings.footer_instagram_url,
      youtube: settings.footer_youtube_url || defaultFooterSettings.footer_youtube_url,
      telegram: settings.footer_telegram_url || defaultFooterSettings.footer_telegram_url,
    },
    paymentMethods: parseCsvList(settings.enabled_checkout_payment_methods, ['cod']),
    courierProviders: parseCsvList(settings.enabled_courier_providers, ['pathao']),
  };
}
