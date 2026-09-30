# LofiMart Auth & OTP — Root-Cause Audit & Fix Report

Status: repo corrections applied + all tests green; OTP **delivery** requires a manual Supabase Dashboard SMTP setup (Section 12).

---

## 1. Root Causes

1. **GoTrue OTP email is a dashboard-side failure.** GoTrue sends OTP independently of the app's nodemailer (it uses the project's Supabase Dashboard SMTP). No SMTP provider is configured, so `signInWithOtp` (used by register / forgot-password / resend) returns a 500 → `SEND_FAILED` → the API 400s. This is **not fixable from the repo**; it requires Section 12.
2. **`registerUser` used `{ phone: null }` in the resume query.** `where: { OR: [{ email }, { phone }] }` with an absent phone became `phone: null`, matching ANY user whose phone is NULL (equivalent to "no phone constraint"). A brand-new email could "resume" an unrelated phone-less account instead of creating a fresh user.
3. **Resume returned the typed email/phone, not the account's.** On resume the code returned `registeredEmail: email` (what the user just typed) instead of the existing account's real email → the OTP was sent to the wrong inbox, so verification could never succeed for resumed accounts.
4. **OTP always reported generic `INVALID`** on verify failure (GoTrue collapses all verify failures into a single "expired or invalid" message). Kept generic — distinguishing EXPIRED/MAX_ATTEMPTS would require string-matching and risk misreporting; not part of a safe correctness fix.
5. **Env quirk:** `.env` sets `NODE_ENV=production` even in local dev, which made the app think it was in production (stricter rate limits, no in-memory rate-limit fallback, magic-link 500 masking). Fixed in scripts only (no code change); tests pin `development` via env mock.

---

## 2. Files Changed

- `src/features/auth/server/auth-service.ts` — `registerUser`
  - Line 82–84: resume search `OR: [{ email }, ...(phone ? [{ phone }] : [])]` — no longer injects `{ phone: null }` when phone is absent.
  - Line 91–92: resume returns the account's **real** stored email/phone (`existing.email`, `existing.phone ?? phone`) so downstream OTP goes to the correct inbox.
- `src/app/api/auth/supabase/register/route.ts` — OTP after resume is sent to `result.registeredEmail ?? email` (the resumed account's real email) instead of always the typed email.
- `src/tests/auth-phase1.test.ts` — phase-1 env mock pins `APP_ENV=development` + Redis prefix so rate-limit fallback is deterministic in CI.
- `package.json` — dev/worker scripts use `cross-env NODE_ENV=development APP_ENV=development` (env quirk fix).

---

## 3. Registration Status

**Code:** Fixed. Fresh registration creates the Prisma row + GoTrue auth user; resume now matches only real email/phone and reports the existing account's actual email/phone)Skip. **Delivery:** blocked until Section 12. Flow:
- 200/201 when GoTrue `signInWithOtp` succeeds (requires Dashboard SMTP settled first).
- 400 when validation/rate-limit/account-exists; 429 when rate-limited; 500 when OTP send fails.

---

## 4. Login Status

No login changes made. Login uses GoTrue password auth (and phone/email password flows); independent of OTP. Existing behavior preserved; tests for login flows pass.

---

## 5. Forgot-Password Status

Follows the same `signInWithOtp` path → same root cause. Fix is purely Section 12 (Dashboard SMTP). Rate limits (per-IP 15-min window) preserved.

---

## 6. OTP Delivery Status

**Not delivered today; not a repo bug.** GoTrue's mailer has no configured SMTP provider in the Supabase Dashboard → `Error sending magic link email` (500 → `SEND_FAILED`). Resolver: manual Dashboard setup, Section 12. Note: `.env` SMTP_* values drive the app's *own* nodemailer for transactional mail, NOT GoTrue OTP — GoTrue never reads them.

---

## 7. OTP Verification Status

Verification delegates to GoTrue `verifyOtp` with 5 verification attempts, 5-min expiry, 60s resend cooldown, and per-IP rate limit (10 requests / 5 min → 429). Failures keep the generic `INVALID` code by design (see Root Cause 4). No bypass of GoTrue verification was added or considered.

---

## 8. Reset-Password Status

Same OTP-based custody as register/listreset. Root cause identical (GoTrue email). Fix = Section 12. Repo code paths verified correct; no repo change needed.

---

## 9. Supabase / SMTP Issue

**Root cause of every "OTP email not arriving" report.** GoTrue sends OTP emails from the Supabase project, whose mailer requires SMTP creds set in the Dashboard (not the repo). The app's nodemailer (SMTP_* / RESEND_API_KEY) is separate and does **not** carry GoTrue OTP. Until a provider is configured, every OTP email returns GoTrue's 500 and the API surfaces `SEND_FAILED`. **This is the single highest-value fix and it is dashboard-only.**

---

## 10. Database / Migration Issue

No schema change required for these fixes. The resume bug was a query-semantics issue (null phone), not a data-model issue. Migrations untouched to stay non-destructive (constraint: no prisma migrate in this task). No OTP/verification tables introduced — custody remains in GoTrue per decision.

---

## 11. Tests Executed + Results

- `npm test` → **16 files, 224 tests passing** (34s; includes auth-phase1 13, auth-phase2 12, auth-phase3 8, login/reset/rate-limit, inventory 13, orders 9, courier, oauth, social-automation suites, cod, rbac 36).
- `npm run lint:types` (tsc --noEmit) → **passes**.
- Verified via tests: resumed-account email now resolves to the stored account email; OR-null phone no longer matches unrelated accounts.

---

## 12. Manual Supabase Dashboard Action Required (NOT a repo change)

1. **Supabase Dashboard → your project → Authentication → Sign In / Sign Up → SMTP Settings** (top of the Email tab).
2. Choose **Custom SMTP** and fill with the Gmail creds already in your `.env` (`SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS`) — note for Gmail use an **App Password** (16-digit) from Google, not the normal login password.
3. Toggle **Enable custom SMTP** → **Save**.
4. If Dashboard validation rejects Gmail, either allow "less secure app access" or use a dedicated transactional provider (Resend/Brevo/SendGrid) with an API-key SMTP relay.
5. Verify: confirm status says "connected", then test register → check inbox + Supabase **Auth logs** for `email sent` instead of `Error sending magic link email`.
6. Keep OTP custody in GoTrue; do **not** add repo-side OTP tables (per your decision).

Failure after this: confirm the app password works in a normal mail client and that `smtp.gmail.com:587` isn't firewalled; re-run Section 11.

---

*Companion Google-classified docs: `docs/Security.md`, `docs/Authentication.md` remain accurate; repo changes here don't alter OTP custody or the SMTP provider decision.*
