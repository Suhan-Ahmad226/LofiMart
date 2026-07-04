import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';

const root = process.cwd();
const envPath = path.join(root, '.env');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const required = [
  'FRONTEND_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'DATABASE_URL',
  'DIRECT_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'STRIPE_SECRET_KEY',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'NEXT_PUBLIC_API_BASE_URL',
];

const recommended = [
  'NEXT_PUBLIC_SITE_URL',
  'CORS_ALLOWED_ORIGINS',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'SMTP_FROM',
  'WEB_PUSH_PUBLIC_KEY',
  'WEB_PUSH_PRIVATE_KEY',
  'NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY',
  'NEXT_PUBLIC_GA_MEASUREMENT_ID',
  'NEXT_PUBLIC_META_PIXEL_ID',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_BOT_USERNAME',
  'TELEGRAM_WEBHOOK_SECRET',
  'PATHAO_CLIENT_ID',
  'PATHAO_CLIENT_SECRET',
  'PATHAO_USERNAME',
  'PATHAO_PASSWORD',
  'PATHAO_WEBHOOK_TOKEN',
  'STEADFAST_API_KEY',
  'STEADFAST_SECRET_KEY',
  'STEADFAST_WEBHOOK_TOKEN',
];

const placeholderPatterns = [
  /example\.com/i,
  /amarshop\.test/i,
  /replace/i,
  /your[-_]/i,
  /placeholder/i,
  /changeme/i,
  /xxxx/i,
];

function valueOf(key) {
  return String(process.env[key] || '').trim();
}

function hasValue(key) {
  return valueOf(key).length > 0;
}

function isPlaceholder(key) {
  const value = valueOf(key);
  return value.length > 0 && placeholderPatterns.some((pattern) => pattern.test(value));
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function addIssue(list, level, message) {
  list.push({ level, message });
}

const issues = [];

for (const key of required) {
  if (!hasValue(key)) {
    addIssue(issues, 'error', `${key} is required`);
  } else if (isPlaceholder(key)) {
    addIssue(issues, 'error', `${key} still looks like a placeholder`);
  }
}

for (const key of recommended) {
  if (!hasValue(key)) {
    addIssue(issues, 'warn', `${key} is not configured`);
  } else if (isPlaceholder(key)) {
    addIssue(issues, 'warn', `${key} still looks like a placeholder`);
  }
}

for (const key of ['FRONTEND_URL', 'NEXT_PUBLIC_SITE_URL']) {
  const value = valueOf(key);
  if (value && !isHttpsUrl(value)) {
    addIssue(issues, 'error', `${key} must be a valid HTTPS URL`);
  }
}

const frontendUrl = valueOf('FRONTEND_URL');
const siteUrl = valueOf('NEXT_PUBLIC_SITE_URL');
if (frontendUrl && !siteUrl) {
  addIssue(issues, 'warn', 'NEXT_PUBLIC_SITE_URL is not configured; app metadata will fall back to FRONTEND_URL/default site URL');
} else if (frontendUrl && siteUrl && frontendUrl !== siteUrl) {
  addIssue(issues, 'warn', 'FRONTEND_URL and NEXT_PUBLIC_SITE_URL are different');
}

const allowedOrigins = valueOf('CORS_ALLOWED_ORIGINS')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (frontendUrl && allowedOrigins.length > 0 && !allowedOrigins.includes(frontendUrl)) {
  addIssue(issues, 'warn', 'CORS_ALLOWED_ORIGINS does not include FRONTEND_URL; runtime still allows FRONTEND_URL by default');
}

for (const origin of allowedOrigins) {
  if (!isHttpsUrl(origin)) {
    addIssue(issues, 'error', `CORS origin must be HTTPS: ${origin}`);
  }
}

if (valueOf('NEXT_PUBLIC_API_BASE_URL') !== '/api') {
  addIssue(issues, 'warn', 'NEXT_PUBLIC_API_BASE_URL should usually stay /api on Vercel');
}

const hasAnyEmail = hasValue('RESEND_API_KEY') || (hasValue('SMTP_HOST') && hasValue('SMTP_USER') && hasValue('SMTP_PASS'));
if (!hasAnyEmail) {
  addIssue(issues, 'warn', 'No production email provider is fully configured');
}

const hasAnyCourier =
  (hasValue('PATHAO_CLIENT_ID') && hasValue('PATHAO_CLIENT_SECRET')) ||
  (hasValue('STEADFAST_API_KEY') && hasValue('STEADFAST_SECRET_KEY')) ||
  (hasValue('REDX_API_KEY') && hasValue('REDX_SECRET_KEY'));
if (!hasAnyCourier) {
  addIssue(issues, 'warn', 'No courier API provider is fully configured');
}

const errors = issues.filter((issue) => issue.level === 'error');
const warnings = issues.filter((issue) => issue.level === 'warn');

console.log(`Production preflight: ${errors.length} error(s), ${warnings.length} warning(s)`);

for (const issue of issues) {
  const prefix = issue.level === 'error' ? 'ERROR' : 'WARN ';
  console.log(`${prefix} ${issue.message}`);
}

if (errors.length > 0) {
  process.exit(1);
}
