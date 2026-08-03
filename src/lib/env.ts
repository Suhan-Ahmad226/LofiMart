import { z } from 'zod';

const intFromString = (field: string, fallback?: number) =>
  z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '') {
        return fallback;
      }

      return Number.parseInt(String(value), 10);
    }, z.number().int().finite({ message: `${field} must be a valid integer` }));

const requiredString = (field: string, minLength = 1) =>
  z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length >= minLength, `${field} is required`);

const requiredUrl = (field: string) =>
  z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, `${field} is required`)
    .refine((value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    }, `${field} must be a valid URL`);

const optionalString = () =>
  z.preprocess((value) => {
    if (value === undefined || value === null) {
      return undefined;
    }

    const trimmed = String(value).trim();
    return trimmed.length ? trimmed : undefined;
  }, z.string().optional());

const commaSeparatedOrigins = () =>
  z.preprocess((value) => {
    if (value === undefined || value === null) {
      return [];
    }

    return String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }, z.array(z.string().url()));

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: optionalString(),
  NEXT_PUBLIC_INVENTORY_WS: optionalString(),
  NEXT_PUBLIC_API_BASE_URL: optionalString(),
  NEXT_PUBLIC_SUPABASE_URL: optionalString(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalString(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString(),
  NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY: optionalString(),
  NEXT_PUBLIC_GA_MEASUREMENT_ID: optionalString(),
  NEXT_PUBLIC_META_PIXEL_ID: optionalString(),
});

const ServerEnvSchema = z.object({
  PORT: intFromString('PORT', 3000),
  WS_PORT: intFromString('WS_PORT', 3101),
  APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  FRONTEND_URL: requiredUrl('FRONTEND_URL'),
  DATABASE_URL: requiredString('DATABASE_URL'),
  DIRECT_URL: optionalString(),
  REDIS_URL: requiredString('REDIS_URL'),
  REDIS_CONNECT_TIMEOUT_MS: intFromString('REDIS_CONNECT_TIMEOUT_MS', 3000),
  REDIS_COMMAND_TIMEOUT_MS: intFromString('REDIS_COMMAND_TIMEOUT_MS', 3000),
  REDIS_MAX_RETRIES_PER_REQUEST: intFromString('REDIS_MAX_RETRIES_PER_REQUEST', 1),
  JWT_SECRET: requiredString('JWT_SECRET', 32),
  STRIPE_SECRET_KEY: requiredString('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET: optionalString(),
  REDIS_PREFIX: requiredString('REDIS_PREFIX').default('amarshop'),
  RATE_LIMIT_PREFIX: requiredString('RATE_LIMIT_PREFIX').default('ratelimit'),
  QUEUE_PREFIX: requiredString('QUEUE_PREFIX').default('amarshop'),
  CACHE_TTL_SECONDS: intFromString('CACHE_TTL_SECONDS', 300),
  SESSION_TTL_SECONDS: intFromString('SESSION_TTL_SECONDS', 604800),
  QUEUE_DEFAULT_JOB_ATTEMPTS: intFromString('QUEUE_DEFAULT_JOB_ATTEMPTS', 5),
  QUEUE_DEFAULT_JOB_BACKOFF_MS: intFromString('QUEUE_DEFAULT_JOB_BACKOFF_MS', 5000),
  LOW_STOCK_THRESHOLD: intFromString('LOW_STOCK_THRESHOLD', 5),
  CORS_ALLOWED_ORIGINS: commaSeparatedOrigins(),
  GOOGLE_CLIENT_ID: optionalString(),
  GOOGLE_CLIENT_SECRET: optionalString(),
  TELEGRAM_BOT_TOKEN: optionalString(),
  TELEGRAM_BOT_USERNAME: optionalString(),
  TELEGRAM_WEBHOOK_SECRET: optionalString(),
  GEMINI_API_KEY: optionalString(),
  CLOUDINARY_CLOUD_NAME: optionalString(),
  CLOUDINARY_API_KEY: optionalString(),
  CLOUDINARY_API_SECRET: optionalString(),
  SUPABASE_SERVICE_ROLE_KEY: optionalString(),
  RESEND_API_KEY: optionalString(),
  SMTP_HOST: optionalString(),
  SMTP_PORT: intFromString('SMTP_PORT', 587),
  SMTP_USER: optionalString(),
  SMTP_PASS: optionalString(),
  SMTP_FROM: optionalString(),
  SMS_PROVIDER: optionalString(),
  SMS_API_KEY: optionalString(),
  SMS_SENDER_ID: optionalString(),
  WEB_PUSH_PUBLIC_KEY: optionalString(),
  WEB_PUSH_PRIVATE_KEY: optionalString(),
  NOTIFY_FROM_EMAIL: optionalString(),
  SSLCOMMERZ_STORE_ID: optionalString(),
  SSLCOMMERZ_STORE_PASSWORD: optionalString(),
  SSLCOMMERZ_IS_SANDBOX: optionalString(),
  BKASH_BASE_URL: optionalString(),
  BKASH_USERNAME: optionalString(),
  BKASH_PASSWORD: optionalString(),
  BKASH_APP_KEY: optionalString(),
  BKASH_APP_SECRET: optionalString(),
  BKASH_WEBHOOK_TOPIC_ARN: optionalString(),
  PATHAO_CLIENT_ID: optionalString(),
  PATHAO_CLIENT_SECRET: optionalString(),
  PATHAO_BASE_URL: optionalString(),
  PATHAO_USERNAME: optionalString(),
  PATHAO_PASSWORD: optionalString(),
  PATHAO_BOOKING_ENDPOINT: optionalString(),
  REDX_API_KEY: optionalString(),
  REDX_SECRET_KEY: optionalString(),
  REDX_BASE_URL: optionalString(),
  REDX_BOOKING_ENDPOINT: optionalString(),
  REDX_TRACKING_ENDPOINT: optionalString(),
  PATHAO_WEBHOOK_TOKEN: optionalString(),
  REDX_WEBHOOK_TOKEN: optionalString(),
  STEADFAST_API_KEY: optionalString(),
  STEADFAST_SECRET_KEY: optionalString(),
  STEADFAST_BASE_URL: optionalString(),
  STEADFAST_WEBHOOK_TOKEN: optionalString(),
});

let publicEnvCache: z.infer<typeof PublicEnvSchema> | null = null;
let serverEnvCache: z.infer<typeof ServerEnvSchema> | null = null;

function formatIssues(error: z.ZodError) {
  return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
}

function isPlaceholderValue(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.includes('example.com') ||
    normalized.includes('your_project_ref') ||
    normalized.includes('your_supabase') ||
    normalized.includes('replace-with') ||
    normalized.includes('replace_me') ||
    normalized.includes('replace-me') ||
    normalized.includes('your_real') ||
    normalized.includes('your-') ||
    normalized.includes('your_') ||
    normalized.includes('changeme') ||
    normalized.includes('placeholder')
  );
}

function ensureProductionPair(errors: string[], label: string, values: Record<string, string | undefined>) {
  const present = Object.entries(values).filter(([, value]) => Boolean(value)).map(([key]) => key);

  if (present.length > 0 && present.length !== Object.keys(values).length) {
    errors.push(`${label} is partially configured. Set all of: ${Object.keys(values).join(', ')}`);
  }
}

function validateProductionServerEnv(
  serverEnv: z.infer<typeof ServerEnvSchema>,
  publicEnv: z.infer<typeof PublicEnvSchema>,
) {
  const errors: string[] = [];
  const placeholderFields: string[] = [];

  const checkPlaceholder = (field: string, value: string | undefined) => {
    if (value && isPlaceholderValue(value)) {
      placeholderFields.push(field);
    }
  };

  const allAllowedOrigins = [serverEnv.FRONTEND_URL, ...serverEnv.CORS_ALLOWED_ORIGINS];
  const publishableSupabaseKey =
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  allAllowedOrigins.forEach((origin) => {
    checkPlaceholder('CORS_ALLOWED_ORIGINS', origin);
    if (!origin.startsWith('https://')) {
      errors.push(`Production origin must use HTTPS: ${origin}`);
    }
  });

  checkPlaceholder('FRONTEND_URL', serverEnv.FRONTEND_URL);
  checkPlaceholder('JWT_SECRET', serverEnv.JWT_SECRET);
  checkPlaceholder('DATABASE_URL', serverEnv.DATABASE_URL);
  if (serverEnv.DIRECT_URL) {
    checkPlaceholder('DIRECT_URL', serverEnv.DIRECT_URL);
  }
  checkPlaceholder('REDIS_URL', serverEnv.REDIS_URL);
  checkPlaceholder('STRIPE_SECRET_KEY', serverEnv.STRIPE_SECRET_KEY);
  checkPlaceholder('STRIPE_WEBHOOK_SECRET', serverEnv.STRIPE_WEBHOOK_SECRET);
  checkPlaceholder('NEXT_PUBLIC_SUPABASE_URL', publicEnv.NEXT_PUBLIC_SUPABASE_URL);
  checkPlaceholder('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', publishableSupabaseKey);
  checkPlaceholder('NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY', publicEnv.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY);

  if (!serverEnv.FRONTEND_URL.startsWith('https://')) {
    errors.push('FRONTEND_URL must use HTTPS in production');
  }

  if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL || !publishableSupabaseKey) {
    errors.push(
      'Supabase public auth is required in production. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY).',
    );
  }

  ensureProductionPair(errors, 'Google OAuth', {
    GOOGLE_CLIENT_ID: serverEnv.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: serverEnv.GOOGLE_CLIENT_SECRET,
  });

  ensureProductionPair(errors, 'Cloudinary media upload', {
    CLOUDINARY_CLOUD_NAME: serverEnv.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: serverEnv.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: serverEnv.CLOUDINARY_API_SECRET,
  });

  ensureProductionPair(errors, 'Web push notifications', {
    WEB_PUSH_PUBLIC_KEY: serverEnv.WEB_PUSH_PUBLIC_KEY,
    WEB_PUSH_PRIVATE_KEY: serverEnv.WEB_PUSH_PRIVATE_KEY,
  });

  ensureProductionPair(errors, 'bKash tokenized checkout', {
    BKASH_BASE_URL: serverEnv.BKASH_BASE_URL,
    BKASH_USERNAME: serverEnv.BKASH_USERNAME,
    BKASH_PASSWORD: serverEnv.BKASH_PASSWORD,
    BKASH_APP_KEY: serverEnv.BKASH_APP_KEY,
    BKASH_APP_SECRET: serverEnv.BKASH_APP_SECRET,
  });

  ensureProductionPair(errors, 'Pathao courier', {
    PATHAO_CLIENT_ID: serverEnv.PATHAO_CLIENT_ID,
    PATHAO_CLIENT_SECRET: serverEnv.PATHAO_CLIENT_SECRET,
    PATHAO_BASE_URL: serverEnv.PATHAO_BASE_URL,
    PATHAO_USERNAME: serverEnv.PATHAO_USERNAME,
    PATHAO_PASSWORD: serverEnv.PATHAO_PASSWORD,
    PATHAO_BOOKING_ENDPOINT: serverEnv.PATHAO_BOOKING_ENDPOINT,
    PATHAO_WEBHOOK_TOKEN: serverEnv.PATHAO_WEBHOOK_TOKEN,
  });

  ensureProductionPair(errors, 'RedX courier', {
    REDX_API_KEY: serverEnv.REDX_API_KEY,
    REDX_SECRET_KEY: serverEnv.REDX_SECRET_KEY,
    REDX_BASE_URL: serverEnv.REDX_BASE_URL,
    REDX_BOOKING_ENDPOINT: serverEnv.REDX_BOOKING_ENDPOINT,
    REDX_TRACKING_ENDPOINT: serverEnv.REDX_TRACKING_ENDPOINT,
    REDX_WEBHOOK_TOKEN: serverEnv.REDX_WEBHOOK_TOKEN,
  });

  ensureProductionPair(errors, 'Steadfast courier', {
    STEADFAST_API_KEY: serverEnv.STEADFAST_API_KEY,
    STEADFAST_SECRET_KEY: serverEnv.STEADFAST_SECRET_KEY,
    STEADFAST_BASE_URL: serverEnv.STEADFAST_BASE_URL,
    STEADFAST_WEBHOOK_TOKEN: serverEnv.STEADFAST_WEBHOOK_TOKEN,
  });

  const smtpConfigured = Boolean(
    serverEnv.SMTP_HOST || serverEnv.SMTP_USER || serverEnv.SMTP_PASS || serverEnv.SMTP_FROM,
  );
  const resendConfigured = Boolean(serverEnv.RESEND_API_KEY);

  if (!smtpConfigured && !resendConfigured) {
    errors.push('Configure at least one email provider for production: RESEND_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM');
  }

  if (smtpConfigured) {
    ensureProductionPair(errors, 'SMTP email', {
      SMTP_HOST: serverEnv.SMTP_HOST,
      SMTP_USER: serverEnv.SMTP_USER,
      SMTP_PASS: serverEnv.SMTP_PASS,
      SMTP_FROM: serverEnv.SMTP_FROM,
    });
  }

  const stripeLooksLive = serverEnv.STRIPE_SECRET_KEY.startsWith('sk_live_');
  if (stripeLooksLive && !serverEnv.STRIPE_WEBHOOK_SECRET) {
    errors.push('STRIPE_WEBHOOK_SECRET is required when using a live Stripe secret in production');
  }

  const sslCommerzConfigured = Boolean(serverEnv.SSLCOMMERZ_STORE_ID || serverEnv.SSLCOMMERZ_STORE_PASSWORD);
  if (sslCommerzConfigured) {
    ensureProductionPair(errors, 'SSLCommerz', {
      SSLCOMMERZ_STORE_ID: serverEnv.SSLCOMMERZ_STORE_ID,
      SSLCOMMERZ_STORE_PASSWORD: serverEnv.SSLCOMMERZ_STORE_PASSWORD,
    });

    if (String(serverEnv.SSLCOMMERZ_IS_SANDBOX || 'true').toLowerCase() !== 'false') {
      errors.push('SSLCOMMERZ_IS_SANDBOX must be false before public production launch');
    }
  }

  if (placeholderFields.length > 0) {
    errors.push(`Replace placeholder values for: ${[...new Set(placeholderFields)].join(', ')}`);
  }

  if (errors.length > 0) {
    throw new Error(`[env] Production launch validation failed: ${errors.join('; ')}`);
  }
}

export function getPublicEnv() {
  if (publicEnvCache) return publicEnvCache;
  publicEnvCache = PublicEnvSchema.parse(process.env);
  return publicEnvCache;
}

export function getServerEnv() {
  if (serverEnvCache) return serverEnvCache;

  const parsed = ServerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`[env] Invalid server configuration: ${formatIssues(parsed.error)}`);
  }

  if (parsed.data.APP_ENV === 'production' && process.env.NODE_ENV === 'production') {
    const publicEnv = getPublicEnv();
    validateProductionServerEnv(parsed.data, publicEnv);
  }

  serverEnvCache = parsed.data;
  return serverEnvCache;
}
