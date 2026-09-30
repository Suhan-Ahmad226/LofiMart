import { z } from 'zod';

function isRedirectUrlAllowed(url, allowedOrigins) {
  try {
    const parsed = new URL(url);
    return allowedOrigins.some((allowed) => {
      try {
        const allowedUrl = new URL(allowed);
        return parsed.origin === allowedUrl.origin;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

const createRegisterSchema = (allowedOrigins) =>
  z.object({
    email: z.string().email().transform((value) => value.trim().toLowerCase()),
    password: z.string().min(8).optional(),
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(20).optional(),
    role: z.string().optional(),
    referralCode: z.string().optional(),
    redirectTo: z.string().url().optional().refine(
      (url) => !url || isRedirectUrlAllowed(url, allowedOrigins),
      'Redirect URL origin not allowed',
    ),
  });

function tryPayload(label, allowedOrigins, payload) {
  const schema = createRegisterSchema(allowedOrigins);
  try {
    const result = schema.parse(payload);
    console.log('[' + label + '] PASS parse ->', JSON.stringify(result));
  } catch (e) {
    console.log('[' + label + '] FAIL parse ->');
    for (const issue of (e.issues || [])) {
      console.log('   issue:', JSON.stringify({ code: issue.code, path: issue.path, message: issue.message, fatal: issue.fatal, params: issue.params }));
    }
  }
}

const devAllowed = ['https://lofimart.vercel.app', 'http://localhost:3000'];
const devPayload = {
  email: 'test@example.com',
  phone: '+8801712345678',
  name: 'Test User',
  role: 'customer',
  referralCode: '',
  redirectTo: 'http://localhost:3000/login',
  password: 'Password123!',
};
tryPayload('DEV (localhost in allowedOrigins)', devAllowed, devPayload);

const prodOnlyAllowed = ['https://lofimart.vercel.app'];
tryPayload('PROD-ONLY allowedOrigins (no localhost)', prodOnlyAllowed, devPayload);

// redirectTo refine alone
const redirectSchema = z.object({
  redirectTo: z.string().url().optional().refine(
    (url) => !url || isRedirectUrlAllowed(url, prodOnlyAllowed),
    'Redirect URL origin not allowed',
  ),
});
for (const r of ['http://localhost:3000/login', 'https://lofimart.vercel.app/login', undefined]) {
  try {
    redirectSchema.parse({ redirectTo: r });
    console.log('[redirect-only] PASS for ' + JSON.stringify(r));
  } catch (e) {
    console.log('[redirect-only] FAIL for ' + JSON.stringify(r) + ' -> ' + JSON.stringify((e.issues || [])[0]));
  }
}

// Does .refine run on undefined for .optional() in zod v4?
const optStrict = z.object({
  redirectTo: z.string().url().optional().refine((url) => {
    if (url === undefined) console.log('[optional-refine] refine received undefined');
    return !url || url.length > 0;
  }, 'nope'),
});
try {
  optStrict.parse({});
  console.log('[optional-refine-undefined] PASS parse {} (no redirectTo)');
} catch (e) {
  console.log('[optional-refine-undefined] FAIL parse {} -> ' + JSON.stringify((e.issues || [])[0]));
}
