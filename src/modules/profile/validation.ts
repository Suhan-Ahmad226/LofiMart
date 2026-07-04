import { z } from 'zod';

const bdPhoneRegex = /^(?:\+?88)?01[3-9]\d{8}$/;

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(bdPhoneRegex, 'Enter a valid Bangladesh phone number').optional().or(z.literal('')),
  alternate_phone: z.string().trim().regex(bdPhoneRegex, 'Enter a valid Bangladesh phone number').optional().or(z.literal('')),
  bio: z.string().trim().max(400).optional(),
  store_name: z.string().trim().max(120).optional(),
  profile_visibility: z.enum(['private', 'public', 'followers_only']).optional(),
  response_time_hours: z.number().int().min(1).max(168).optional(),
});

export const storefrontSettingsSchema = z.object({
  storefront_slug: z
    .string()
    .trim()
    .min(3)
    .max(48)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens only'),
  storefront_headline: z.string().trim().max(140).optional().or(z.literal('')),
  storefront_banner_url: z
    .string()
    .trim()
    .max(2000)
    .refine((value) => {
      if (!value) return true;
      try {
        const parsed = new URL(value);
        return ['http:', 'https:'].includes(parsed.protocol);
      } catch {
        return false;
      }
    }, 'Enter a valid banner image URL')
    .optional()
    .or(z.literal('')),
  storefront_accent_color: z
    .string()
    .trim()
    .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/, 'Use a valid HEX color like #0F766E')
    .optional()
    .or(z.literal('')),
  storefront_custom_domain: z
    .string()
    .trim()
    .refine(
      (value) => !value || /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(value),
      'Enter a valid domain like store.example.com',
    )
    .optional()
    .or(z.literal('')),
  storefront_published: z.boolean().optional().default(true),
});

export const addressSchema = z.object({
  label: z.string().trim().max(60).optional(),
  type: z.enum(['shipping', 'billing']),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(bdPhoneRegex, 'Enter a valid Bangladesh phone number'),
  alternate_phone: z.string().trim().regex(bdPhoneRegex, 'Enter a valid Bangladesh phone number').optional().or(z.literal('')),
  address: z.string().trim().min(5).max(255),
  line2: z.string().trim().max(255).optional(),
  division: z.string().trim().max(120).optional(),
  district: z.string().trim().max(120).optional(),
  upazila: z.string().trim().max(120).optional(),
  house: z.string().trim().max(120).optional(),
  road: z.string().trim().max(120).optional(),
  village: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().max(120).optional(),
  postal_code: z.string().trim().max(20).optional(),
  country: z.string().trim().min(2).max(80).default('Bangladesh'),
  is_default: z.boolean().optional().default(false),
});

export const notificationPreferenceSchema = z.object({
  email_enabled: z.boolean(),
  sms_enabled: z.boolean(),
  order_updates: z.boolean(),
  marketing_opt_in: z.boolean(),
  payout_alerts: z.boolean(),
  security_alerts: z.boolean(),
});

export const payoutMethodSchema = z.object({
  type: z.enum(['bank_account', 'mobile_banking', 'stripe', 'paypal']),
  provider: z.string().trim().min(2).max(60),
  account_name: z.string().trim().max(120).optional(),
  account_number: z.string().trim().max(60).optional(),
  routing_number: z.string().trim().max(60).optional(),
  mobile_number: z.string().trim().regex(bdPhoneRegex, 'Enter a valid Bangladesh phone number').optional(),
  is_default: z.boolean().optional().default(false),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export const uploadAssetSchema = z.object({
  data_url: z.string().trim().min(20),
  mime_type: z.string().trim().min(3),
  size_bytes: z.number().int().positive().max(5 * 1024 * 1024),
});

export const verificationSubmissionSchema = z.object({
  document_type: z.enum(['nid', 'birth_certificate', 'passport']).default('nid'),
  business_name: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(500).optional(),
  documents: z.object({
    front: uploadAssetSchema,
    back: uploadAssetSchema,
    selfie: uploadAssetSchema,
    business_license: uploadAssetSchema.optional(),
  }),
});

export const verificationReviewSchema = z.object({
  status: z.enum(['under_review', 'verified', 'rejected']),
  rejection_reason: z.string().trim().max(500).optional(),
  risk_score: z.number().min(0).max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const privacyRequestSchema = z.object({
  type: z.enum(['deactivate', 'delete_request']),
  reason: z.string().trim().max(500).optional(),
});

export const riskFlagSchema = z.object({
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  reason: z.string().trim().min(5).max(255),
  notes: z.string().trim().max(500).optional(),
});

export const tenantSettingSchema = z.object({
  currency: z.string().trim().min(3).max(8).optional(),
  locale: z.string().trim().min(2).max(16).optional(),
  free_shipping_threshold: z.number().min(0).optional(),
  cart_recovery_delay_mins: z.number().int().min(5).max(10080).optional(),
  signup_bonus_coins: z.number().int().min(0).max(100000).optional(),
  daily_login_base_coins: z.number().int().min(0).max(100000).optional(),
  daily_login_max_coins: z.number().int().min(0).max(100000).optional(),
  order_cashback_bps: z.number().int().min(0).max(5000).optional(),
  referral_inviter_coins: z.number().int().min(0).max(100000).optional(),
  referral_invitee_coins: z.number().int().min(0).max(100000).optional(),
  surprise_reward_chance: z.number().min(0).max(1).optional(),
  spin_enabled: z.boolean().optional(),
  spin_daily_limit: z.number().int().min(0).max(20).optional(),
});

export const spinRewardSchema = z.object({
  label: z.string().trim().min(2).max(80),
  reward_type: z.enum(['coins', 'discount', 'free_shipping', 'wallet_credit']),
  reward_value: z.number().min(0),
  probability: z.number().min(0).max(1),
  is_active: z.boolean().optional().default(true),
  display_order: z.number().int().min(0).max(50).optional().default(0),
});

export const referralRedeemSchema = z.object({
  code: z.string().trim().min(4).max(32),
});

export const walletAdjustmentSchema = z.object({
  user_id: z.string().trim().min(8),
  amount: z.number().positive(),
  type: z.enum(['credit', 'debit']),
  source: z.string().trim().min(2).max(80),
  description: z.string().trim().min(4).max(255),
});
