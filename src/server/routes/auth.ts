import type { RouteContext } from "./context.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { logger } from "../../lib/logger.js";
import {
  createSession,
  getAccessCookieOptions,
  getRefreshCookieOptions,
  listSessionsForUser,
  rotateSession,
  revokeAllSessionsForUser,
  revokeSessionByRefreshToken,
} from "../../features/auth/services/sessionStore.js";
import { claimDailyLoginReward } from "../../features/admin/services/engagement/gamification.js";
import {
  csrfHeaderName,
  getCsrfCookieHeader,
  issueCsrfToken,
} from "../../server/security/csrf.js";
import { rateLimit, rateLimits } from "../../server/rateLimit.js";

export function registerAuthRoutes(ctx: RouteContext): void {
  const {
    app,
    env,
    prisma,
    supabaseAdmin,
    supabaseAuth,
    authenticateToken,
    serializeUser,
    hashPassword,
    validateEmail,
    validatePassword,
    logServerError,
    isDatabaseUnavailableError,
    mailer,
    mailFrom,
    resendApiKey,
    ensureEngagementBootstrap,
    normalizePublicRole,
    resolveAuthRole,
    extractSupabaseAvatarUrl,
    getSessionMetadataFromRequest,
    ensureNotificationPreference,
    markLoginActivitiesRevoked,
    awardSignupBonus,
    ensureLocalSupabaseUser,
  } = ctx;

  const sendEmail = async (to: string, subject: string, html: string) => {
    if (mailer) {
      try {
        await mailer.sendMail({ from: mailFrom, to, subject, html });
        return;
      } catch (err) {
        console.error("Email send error", err);
      }
    }

    if (!resendApiKey) return;

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: mailFrom,
          to: [to],
          subject,
          html,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        console.error("Resend send error", response.status, body);
      }
    } catch (err) {
      console.error("Email send error", err);
    }
  };

  async function createVerificationToken(
    userId: string,
    table: "email_verifications" | "password_resets" | "phone_verifications",
    ttlMinutes: number,
  ) {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    if (table === "email_verifications") {
      await prisma.emailVerificationToken.create({
        data: {
          userId,
          token,
          expiresAt,
        },
      });
    } else if (table === "password_resets") {
      await prisma.passwordResetToken.create({
        data: {
          userId,
          token,
          expiresAt,
        },
      });
    } else {
      await prisma.phoneVerificationToken.create({
        data: {
          userId,
          token,
          expiresAt,
        },
      });
    }

    return { token, expiresAt };
  }

  const recordLoginActivity = async (userId: string, sessionId: string, metadata: ReturnType<typeof getSessionMetadataFromRequest>) => {
    await prisma.loginActivity.upsert({
      where: {
        userId_sessionId: {
          userId,
          sessionId,
        },
      },
      update: {
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        deviceName: metadata.deviceName,
        location: metadata.location,
        lastSeenAt: new Date(),
        revokedAt: null,
      },
      create: {
        userId,
        sessionId,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        deviceName: metadata.deviceName,
        location: metadata.location,
      },
    });
  };

  const runAuthSideEffect = (label: string, task: Promise<unknown>) => {
    void task.catch((error) => {
      logger.warn(`auth.${label}_failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  };

  const queueEngagementBootstrap = (userId: string, tenantId?: string | null) => {
    void (async () => {
      try {
        await ensureEngagementBootstrap(userId, tenantId);
      } catch (error) {
        logger.warn("auth.engagement_bootstrap_failed", {
          userId,
          tenantId: tenantId ?? null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  };

  const extractSupabaseAuthErrorMessage = (input: unknown): string => {
    if (typeof input === "string") {
      return input.trim();
    }
    if (input && typeof input === "object") {
      const record = input as Record<string, unknown>;
      if (typeof record.code === "string" && record.code.trim()) {
        return record.code.trim();
      }
      if (typeof record.message === "string" && record.message.trim()) {
        return record.message.trim();
      }
      if (typeof record.error === "string" && record.error.trim()) {
        return record.error.trim();
      }
      if (typeof record.error_description === "string" && record.error_description.trim()) {
        return record.error_description.trim();
      }
      if (typeof record.msg === "string" && record.msg.trim()) {
        return record.msg.trim();
      }
    }

    return "";
  };

  const findSupabaseAuthUserByEmail = async (email: string) => {
    if (!supabaseAdmin) {
      return null;
    }

    const normalizedEmail = email.toLowerCase();
    const perPage = 200;

    for (let page = 1; page <= 10; page += 1) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      });

      if (error) {
        throw error;
      }

      const matchedUser =
        data.users.find((candidate: any) => candidate?.email?.toLowerCase() === normalizedEmail) ?? null;
      if (matchedUser) {
        return matchedUser;
      }

      if (data.users.length < perPage) {
        break;
      }
    }

    return null;
  };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  app.get("/api/auth/csrf", (_req, res) => {
    const token = issueCsrfToken();
    res.setHeader("Set-Cookie", getCsrfCookieHeader(token));
    res.json({ csrf_token: token, header_name: csrfHeaderName });
  });

  app.post("/api/auth/register", rateLimit("register", 10, 60_000), async (req, res) => {
    const { name, email, password, role } = req.body;
    if (!validateEmail(email)) return res.status(400).json({ error: "Invalid email" });
    if (!validatePassword(password)) return res.status(400).json({ error: "Password must be at least 8 characters with letters and numbers" });
    if (!name || name.length < 2) return res.status(400).json({ error: "Name is required" });
    const safeRole = ["customer", "seller", "reseller", "admin"].includes(role) ? role : "customer";

    try {
      const normalizedEmail = email.toLowerCase();
      const hashedPassword = await hashPassword(password);
      const slugBase = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 32) || "store";
      const tenantPayload = safeRole === "seller" || safeRole === "reseller"
        ? {
            create: {
              slug: `${slugBase}-${crypto.randomBytes(3).toString("hex")}`,
              name: `${name}'s workspace`,
              settings: {
                create: {},
              },
              stores: {
                create: {
                  name: `${name}'s storefront`,
                  currency: "BDT",
                  locale: "en-BD",
                },
              },
            },
          }
        : undefined;

      const createdUser = await prisma.user.create({
        data: {
          name,
          email: normalizedEmail,
          passwordHash: hashedPassword,
          role: safeRole,
          emailVerified: false,
          profileVisibility: safeRole === "customer" ? "private" : "public",
          tenant: tenantPayload,
        },
        include: {
          tenant: true,
        },
      });
      if (createdUser.tenantId) {
        await prisma.tenantMembership.create({
          data: {
            userId: createdUser.id,
            tenantId: createdUser.tenantId,
            role: safeRole,
            isPrimary: true,
            acceptedAt: new Date(),
          },
        });
      }
      runAuthSideEffect("notification_preference", ensureNotificationPreference(createdUser.id));
      queueEngagementBootstrap(createdUser.id, createdUser.tenantId);
      runAuthSideEffect("signup_bonus", awardSignupBonus(createdUser.id, createdUser.tenantId));
      const user = serializeUser(createdUser);

      const { token: verificationToken, expiresAt } = await createVerificationToken(createdUser.id, "email_verifications", 60 * 24);
      await sendEmail(
        normalizedEmail,
        "Verify your LofiMart account",
        `<p>Hello ${name},</p><p>Please verify your email by clicking the link below:</p><p><a href="${env.FRONTEND_URL}/api/auth/verify-email?token=${verificationToken}">Verify email</a></p><p>This link expires at ${new Date(expiresAt).toLocaleString()}.</p>`,
      );

      const sessionResult = await createSession(user, getSessionMetadataFromRequest(req));
      runAuthSideEffect("record_login_activity", recordLoginActivity(createdUser.id, sessionResult.session.sid, getSessionMetadataFromRequest(req)));
      res.cookie("access_token", sessionResult.accessToken, getAccessCookieOptions(user));
      res.cookie("refresh_token", sessionResult.refreshToken, getRefreshCookieOptions(user));
      res.json({
        user,
        token: sessionResult.accessToken,
        refreshToken: sessionResult.refreshToken,
        refreshExpiresAt: sessionResult.expiresAt,
        emailVerificationToken: process.env.NODE_ENV === "production" ? undefined : verificationToken,
        emailVerificationExpiresAt: expiresAt,
      });
    } catch (error: any) {
      if (error.code === "P2002") {
        res.status(400).json({ error: "Email already exists" });
      } else {
        res.status(500).json({ error: "Registration failed" });
      }
    }
  });

  app.post("/api/auth/login", rateLimit("login", 20, 60_000), async (req, res) => {
    const { email, password } = req.body;
    const normalizedEmail = typeof email === "string" ? email.toLowerCase() : "";
    const user = normalizedEmail
      ? await prisma.user.findUnique({
          where: { email: normalizedEmail },
        })
      : null;

    const MAX_ATTEMPTS = 5;
    const LOCK_WINDOW = 15 * 60 * 1000; // 15m
    const lockKey = `login-lock-${normalizedEmail}`;
    const attemptsKey = `login-attempts-${normalizedEmail}`;

    const now = Date.now();
    const lock = rateLimits[lockKey];
    if (lock && lock.timestamps[0] && now - lock.timestamps[0] < LOCK_WINDOW) {
      return res.status(429).json({ error: "Too many failed attempts. Try again later." });
    }

    const passwordOk = user && (await bcrypt.compare(password, user.passwordHash));
    if (!user || !passwordOk) {
      const bucket = rateLimits[attemptsKey] || { timestamps: [] };
      bucket.timestamps = bucket.timestamps.filter((t) => now - t < LOCK_WINDOW);
      bucket.timestamps.push(now);
      rateLimits[attemptsKey] = bucket;
      if (bucket.timestamps.length >= MAX_ATTEMPTS) {
        rateLimits[lockKey] = { timestamps: [now] };
        rateLimits[attemptsKey] = { timestamps: [] };
      }
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // success: clear attempt bucket
    delete rateLimits[attemptsKey];
    delete rateLimits[lockKey];
    if (!user.emailVerified) {
      return res.status(403).json({ error: "Email not verified", requiresVerification: true });
    }

    if (user.isBlocked || user.deactivatedAt) {
      return res.status(403).json({ error: "This account is not currently allowed to sign in" });
    }

    queueEngagementBootstrap(user.id, user.tenantId);
    const userWithoutPassword = serializeUser(user);
    const sessionResult = await createSession(userWithoutPassword, getSessionMetadataFromRequest(req));
    runAuthSideEffect("record_login_activity", recordLoginActivity(user.id, sessionResult.session.sid, getSessionMetadataFromRequest(req)));
    runAuthSideEffect("claim_daily_login_reward", claimDailyLoginReward(user.id, user.tenantId));
    res.cookie("access_token", sessionResult.accessToken, getAccessCookieOptions(userWithoutPassword));
    res.cookie("refresh_token", sessionResult.refreshToken, getRefreshCookieOptions(userWithoutPassword));
    res.json({ user: userWithoutPassword, token: sessionResult.accessToken, refreshToken: sessionResult.refreshToken, refreshExpiresAt: sessionResult.expiresAt });
  });

  app.post("/api/auth/supabase/exchange", rateLimit("supabase-exchange", 30, 60_000), async (req: any, res: any) => {
    try {
      const { accessToken, role, name, mode } = req.body ?? {};
      if (!accessToken || !supabaseAuth) {
        return res.status(400).json({ error: "Supabase auth is not configured" });
      }

      const { data, error } = await supabaseAuth.auth.getUser(String(accessToken));
      if (error || !data.user?.email) {
        return res.status(401).json({ error: "Invalid Supabase session" });
      }

      const supabaseUser = data.user;
      if (!supabaseUser.email) {
        return res.status(400).json({ error: 'Supabase user email is missing' });
      }
      const normalizedEmail = supabaseUser.email.toLowerCase();
      const confirmedAt = (supabaseUser as any).email_confirmed_at || (supabaseUser as any).confirmed_at || null;
      const authMode = mode === 'register' ? 'register' : 'login';
      const safeRole = resolveAuthRole(role, supabaseUser as any);
      const preferredName =
        name ||
        (supabaseUser.user_metadata?.name as string | undefined) ||
        (supabaseUser.user_metadata?.full_name as string | undefined) ||
        normalizedEmail.split("@")[0];
      const localUser = await ensureLocalSupabaseUser({
        email: normalizedEmail,
        preferredName,
        preferredAvatarUrl: extractSupabaseAvatarUrl(supabaseUser as any),
        safeRole,
        confirmedAt,
        authMode,
      });

      if (localUser.isBlocked || localUser.deactivatedAt) {
        return res.status(403).json({ error: "This account is not currently allowed to sign in" });
      }

      queueEngagementBootstrap(localUser.id, localUser.tenantId);
      const user = serializeUser(localUser);
      const sessionResult = await createSession(user, getSessionMetadataFromRequest(req));
      runAuthSideEffect("record_login_activity", recordLoginActivity(localUser.id, sessionResult.session.sid, getSessionMetadataFromRequest(req)));
      runAuthSideEffect("claim_daily_login_reward", claimDailyLoginReward(localUser.id, localUser.tenantId));
      res.cookie("access_token", sessionResult.accessToken, getAccessCookieOptions(user));
      res.cookie("refresh_token", sessionResult.refreshToken, getRefreshCookieOptions(user));
      res.json({ user, token: sessionResult.accessToken, refreshToken: sessionResult.refreshToken, refreshExpiresAt: sessionResult.expiresAt });
    } catch (error) {
      logServerError("supabase auth exchange", error);
      const statusCode = typeof (error as any)?.statusCode === "number" ? (error as any).statusCode : null;
      if (statusCode) {
        return res.status(statusCode).json({ error: (error as any)?.message || "Failed to complete sign-in" });
      }
      if (isDatabaseUnavailableError(error)) {
        return res.status(503).json({ error: "Database is busy right now. Please try signing in again in a moment." });
      }
      return res.status(500).json({ error: "Failed to complete sign-in" });
    }
  });

  app.post("/api/auth/supabase/provision", rateLimit("supabase-provision", 20, 60_000), async (req: any, res: any) => {
    try {
      const { supabaseUserId, email, role, name } = req.body ?? {};
      if (!supabaseUserId || !supabaseAdmin || !supabaseUrl) {
        return res.status(400).json({ error: "Supabase provisioning is not configured" });
      }

      const { data, error } = await supabaseAdmin.auth.admin.getUserById(String(supabaseUserId));
      if (error || !data.user?.email) {
        return res.status(401).json({ error: "Unable to verify the newly created account" });
      }

      const normalizedEmail = data.user.email.toLowerCase();
      if (typeof email === "string" && email.toLowerCase() !== normalizedEmail) {
        return res.status(400).json({ error: "Registration email mismatch detected" });
      }

      const confirmedAt = (data.user as any).email_confirmed_at || (data.user as any).confirmed_at || null;
      const safeRole = resolveAuthRole(role, data.user as any);
      const preferredName =
        name ||
        (data.user.user_metadata?.name as string | undefined) ||
        (data.user.user_metadata?.full_name as string | undefined) ||
        normalizedEmail.split("@")[0];

      await ensureLocalSupabaseUser({
        email: normalizedEmail,
        preferredName,
        preferredAvatarUrl: extractSupabaseAvatarUrl(data.user as any),
        safeRole,
        confirmedAt,
        authMode: "register",
      });

      return res.json({ success: true });
    } catch (error) {
      logServerError("supabase auth provision", error);
      const statusCode = typeof (error as any)?.statusCode === "number" ? (error as any).statusCode : null;
      if (statusCode) {
        return res.status(statusCode).json({ error: (error as any)?.message || "Failed to provision account" });
      }
      if (isDatabaseUnavailableError(error)) {
        return res.status(503).json({ error: "Database is busy right now. Please try again in a moment." });
      }
      return res.status(500).json({ error: "Failed to provision account" });
    }
  });

  app.post("/api/auth/supabase/recover-register", rateLimit("supabase-recover-register", 10, 60_000), async (req: any, res: any) => {
    try {
      const { email, role, name } = req.body ?? {};
      if (!email || typeof email !== "string" || !supabaseAdmin) {
        return res.status(400).json({ error: "Supabase recovery is not configured" });
      }

      const recoveredUser = await findSupabaseAuthUserByEmail(email);
      if (!recoveredUser?.email) {
        return res.status(404).json({ error: "No matching Supabase account was found yet" });
      }

      const normalizedEmail = recoveredUser.email.toLowerCase();
      const confirmedAt = (recoveredUser as any).email_confirmed_at || (recoveredUser as any).confirmed_at || null;
      const safeRole = resolveAuthRole(role, recoveredUser as any);
      const preferredName =
        name ||
        (recoveredUser.user_metadata?.name as string | undefined) ||
        (recoveredUser.user_metadata?.full_name as string | undefined) ||
        normalizedEmail.split("@")[0];

      await ensureLocalSupabaseUser({
        email: normalizedEmail,
        preferredName,
        preferredAvatarUrl: extractSupabaseAvatarUrl(recoveredUser as any),
        safeRole,
        confirmedAt,
        authMode: "register",
      });

      return res.json({
        success: true,
        requiresVerification: !confirmedAt,
      });
    } catch (error) {
      logServerError("supabase register recovery", error);
      const statusCode = typeof (error as any)?.statusCode === "number" ? (error as any).statusCode : null;
      if (statusCode) {
        return res.status(statusCode).json({ error: (error as any)?.message || "Failed to recover account registration" });
      }
      if (isDatabaseUnavailableError(error)) {
        return res.status(503).json({ error: "Database is busy right now. Please try again in a moment." });
      }
      return res.status(500).json({ error: "Failed to recover account registration" });
    }
  });

  app.post("/api/auth/supabase/register", rateLimit("supabase-register", 10, 60_000), async (req: any, res: any) => {
    try {
      const { email, password, role, name, referralCode, redirectTo } = req.body ?? {};

      if (!supabaseUrl || !supabasePublishableKey || !supabaseAdmin) {
        return res.status(400).json({ error: "Supabase registration is not configured" });
      }
      if (!validateEmail(email)) {
        return res.status(400).json({ error: "Invalid email" });
      }
      if (!validatePassword(password)) {
        return res.status(400).json({ error: "Password must be at least 8 characters with letters and numbers" });
      }
      if (!name || String(name).trim().length < 2) {
        return res.status(400).json({ error: "Name is required" });
      }

      const safeRole = normalizePublicRole(role);
      const normalizedEmail = String(email).toLowerCase();
      const callbackUrl =
        typeof redirectTo === "string" && redirectTo.startsWith("http")
          ? redirectTo
          : `${env.FRONTEND_URL}/login`;

      const signupResponse = await fetch(
        `${supabaseUrl}/auth/v1/signup?redirect_to=${encodeURIComponent(callbackUrl)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabasePublishableKey,
            Authorization: `Bearer ${supabasePublishableKey}`,
          },
          body: JSON.stringify({
            email: normalizedEmail,
            password,
            data: {
              name: String(name).trim(),
              role: safeRole,
              referralCode: typeof referralCode === "string" && referralCode.trim() ? referralCode.trim() : undefined,
            },
          }),
        },
      );

      const payload = (await signupResponse.json().catch(() => null)) as any;

      if (!signupResponse.ok) {
        const supabaseError =
          extractSupabaseAuthErrorMessage(payload) ||
          (signupResponse.status === 504
            ? "The authentication service took too long to respond. Please wait a moment and try again."
            : "Supabase registration failed");
        const isRetryableSignupFailure =
          signupResponse.status >= 500 ||
          signupResponse.status === 504 ||
          /email rate limit exceeded/i.test(String(supabaseError)) ||
          /over_email_send_rate_limit/i.test(String(supabaseError));
        const recoveredUser = isRetryableSignupFailure
          ? await findSupabaseAuthUserByEmail(normalizedEmail)
          : null;

        if (recoveredUser?.email) {
          const confirmedAt = (recoveredUser as any).email_confirmed_at || (recoveredUser as any).confirmed_at || null;
          const localUser = await ensureLocalSupabaseUser({
            email: recoveredUser.email.toLowerCase(),
            preferredName:
              String(name).trim() ||
              (recoveredUser.user_metadata?.name as string | undefined) ||
              (recoveredUser.user_metadata?.full_name as string | undefined) ||
              recoveredUser.email.split("@")[0],
            preferredAvatarUrl: extractSupabaseAvatarUrl(recoveredUser as any),
            safeRole,
            confirmedAt,
            authMode: "register",
          });

          return res.json({
            success: true,
            recovered: true,
            requiresVerification: !confirmedAt,
            user: serializeUser(localUser),
          });
        }

        if (isRetryableSignupFailure) {
          const { data: createdByAdmin, error: createByAdminError } = await supabaseAdmin.auth.admin.createUser({
            email: normalizedEmail,
            password,
            email_confirm: true,
            user_metadata: {
              name: String(name).trim(),
              role: safeRole,
              referralCode: typeof referralCode === "string" && referralCode.trim() ? referralCode.trim() : undefined,
            },
          } as any);

          if (!createByAdminError && createdByAdmin?.user?.email) {
            const confirmedAt =
              (createdByAdmin.user as any).email_confirmed_at ||
              (createdByAdmin.user as any).confirmed_at ||
              new Date().toISOString();
            const localUser = await ensureLocalSupabaseUser({
              email: createdByAdmin.user.email.toLowerCase(),
              preferredName:
                String(name).trim() ||
                (createdByAdmin.user.user_metadata?.name as string | undefined) ||
                (createdByAdmin.user.user_metadata?.full_name as string | undefined) ||
                createdByAdmin.user.email.split("@")[0],
              preferredAvatarUrl: extractSupabaseAvatarUrl(createdByAdmin.user as any),
              safeRole,
              confirmedAt,
              authMode: "register",
            });

            const user = serializeUser(localUser);
            const sessionResult = await createSession(user, getSessionMetadataFromRequest(req));
            runAuthSideEffect("record_login_activity", recordLoginActivity(localUser.id, sessionResult.session.sid, getSessionMetadataFromRequest(req)));
            runAuthSideEffect("claim_daily_login_reward", claimDailyLoginReward(localUser.id, localUser.tenantId));
            res.cookie("access_token", sessionResult.accessToken, getAccessCookieOptions(user));
            res.cookie("refresh_token", sessionResult.refreshToken, getRefreshCookieOptions(user));
            return res.json({
              success: true,
              recovered: true,
              fallback: "admin-create-user",
              requiresVerification: false,
              user,
              token: sessionResult.accessToken,
              refreshToken: sessionResult.refreshToken,
              refreshExpiresAt: sessionResult.expiresAt,
            });
          }

          if (createByAdminError) {
            const lateRecoveredUser = await findSupabaseAuthUserByEmail(normalizedEmail);
            if (lateRecoveredUser?.email) {
              const confirmedAt =
                (lateRecoveredUser as any).email_confirmed_at ||
                (lateRecoveredUser as any).confirmed_at ||
                new Date().toISOString();
              const localUser = await ensureLocalSupabaseUser({
                email: lateRecoveredUser.email.toLowerCase(),
                preferredName:
                  String(name).trim() ||
                  (lateRecoveredUser.user_metadata?.name as string | undefined) ||
                  (lateRecoveredUser.user_metadata?.full_name as string | undefined) ||
                  lateRecoveredUser.email.split("@")[0],
                preferredAvatarUrl: extractSupabaseAvatarUrl(lateRecoveredUser as any),
                safeRole,
                confirmedAt,
                authMode: "register",
              });

              const user = serializeUser(localUser);
              const sessionResult = await createSession(user, getSessionMetadataFromRequest(req));
              runAuthSideEffect("record_login_activity", recordLoginActivity(localUser.id, sessionResult.session.sid, getSessionMetadataFromRequest(req)));
              runAuthSideEffect("claim_daily_login_reward", claimDailyLoginReward(localUser.id, localUser.tenantId));
              res.cookie("access_token", sessionResult.accessToken, getAccessCookieOptions(user));
              res.cookie("refresh_token", sessionResult.refreshToken, getRefreshCookieOptions(user));
              return res.json({
                success: true,
                recovered: true,
                fallback: "late-recover-existing-user",
                requiresVerification: false,
                user,
                token: sessionResult.accessToken,
                refreshToken: sessionResult.refreshToken,
                refreshExpiresAt: sessionResult.expiresAt,
              });
            }
          }
        }

        const statusCode =
          signupResponse.status === 429
            ? 429
            : /already/i.test(String(supabaseError))
              ? 409
              : signupResponse.status >= 400 && signupResponse.status < 600
                ? signupResponse.status
                : 500;
        return res.status(statusCode).json({ error: supabaseError });
      }

      const supabaseUser = payload?.user;
      if (!supabaseUser?.email) {
        return res.status(500).json({ error: "Supabase did not return the created user" });
      }

      const confirmedAt = (supabaseUser as any).email_confirmed_at || (supabaseUser as any).confirmed_at || null;
      const localUser = await ensureLocalSupabaseUser({
        email: supabaseUser.email.toLowerCase(),
        preferredName:
          String(name).trim() ||
          (supabaseUser.user_metadata?.name as string | undefined) ||
          (supabaseUser.user_metadata?.full_name as string | undefined) ||
          supabaseUser.email.split("@")[0],
        preferredAvatarUrl: extractSupabaseAvatarUrl(supabaseUser as any),
        safeRole,
        confirmedAt,
        authMode: "register",
      });

      if (payload?.session?.access_token && confirmedAt) {
        const user = serializeUser(localUser);
        const sessionResult = await createSession(user, getSessionMetadataFromRequest(req));
        runAuthSideEffect("record_login_activity", recordLoginActivity(localUser.id, sessionResult.session.sid, getSessionMetadataFromRequest(req)));
        runAuthSideEffect("claim_daily_login_reward", claimDailyLoginReward(localUser.id, localUser.tenantId));
        res.cookie("access_token", sessionResult.accessToken, getAccessCookieOptions(user));
        res.cookie("refresh_token", sessionResult.refreshToken, getRefreshCookieOptions(user));
        return res.json({
          success: true,
          user,
          token: sessionResult.accessToken,
          refreshToken: sessionResult.refreshToken,
          refreshExpiresAt: sessionResult.expiresAt,
          requiresVerification: false,
        });
      }

      return res.json({
        success: true,
        requiresVerification: !confirmedAt,
        user: serializeUser(localUser),
      });
    } catch (error) {
      logServerError("supabase register", error);
      const statusCode = typeof (error as any)?.statusCode === "number" ? (error as any).statusCode : null;
      if (statusCode) {
        return res.status(statusCode).json({ error: (error as any)?.message || "Failed to register with Supabase" });
      }
      if (isDatabaseUnavailableError(error)) {
        return res.status(503).json({ error: "Database is busy right now. Please try again in a moment." });
      }
      return res.status(500).json({ error: "Failed to register with Supabase" });
    }
  });

  app.post("/api/auth/refresh", rateLimit("refresh", 40, 60_000), async (req: any, res: any) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: "Missing refreshToken" });

    const rotatedSession = await rotateSession(refreshToken);
    if (!rotatedSession) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    res.cookie("access_token", rotatedSession.accessToken, getAccessCookieOptions(rotatedSession.session.user));
    res.cookie("refresh_token", rotatedSession.refreshToken, getRefreshCookieOptions(rotatedSession.session.user));
    res.json({
      token: rotatedSession.accessToken,
      refreshToken: rotatedSession.refreshToken,
      refreshExpiresAt: rotatedSession.expiresAt,
    });
  });

  app.post("/api/auth/change-password", authenticateToken, async (req: any, res: any) => {
    const { currentPassword, newPassword } = req.body;
    if (!validatePassword(newPassword)) return res.status(400).json({ error: "Password must be at least 8 characters with letters and numbers" });

    const user = await prisma.user.findUnique({ where: { id: String(req.user.id) } });
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    const hashed = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashed },
    });
    await revokeAllSessionsForUser(req.user.id);
    await markLoginActivitiesRevoked(String(req.user.id));
    res.json({ success: true });
  });

  app.post("/api/auth/request-reset", rateLimit("request-reset", 10, 60_000), async (req: any, res: any) => {
    const { email } = req.body;
    if (!validateEmail(email)) return res.status(400).json({ error: "Invalid email" });
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    if (user) {
      const { token, expiresAt } = await createVerificationToken(user.id, "password_resets", 30);
      await sendEmail(
        email.toLowerCase(),
        "Reset your LofiMart password",
        `<p>We received a request to reset your password.</p><p>Use this token: <strong>${token}</strong></p><p>Or open the reset page and submit it there. This token expires at ${new Date(expiresAt).toLocaleString()}.</p>`,
      );
      res.json({ success: true, resetToken: process.env.NODE_ENV === "production" ? undefined : token, expiresAt });
    } else {
      res.json({ success: true });
    }
  });

  app.post("/api/auth/reset-password", rateLimit("reset-password", 20, 60_000), async (req: any, res: any) => {
    const { token, newPassword } = req.body;
    if (!validatePassword(newPassword)) return res.status(400).json({ error: "Password must be at least 8 characters with letters and numbers" });
    const record = await prisma.passwordResetToken.findUnique({
      where: { token },
    });
    if (!record || record.used) return res.status(400).json({ error: "Invalid or used token" });
    if (new Date(record.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({ error: "This reset link has expired. Please request a new one.", code: "TOKEN_EXPIRED" });
    }

    const hashed = await hashPassword(newPassword);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: hashed },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { used: true },
      }),
    ]);
    await revokeAllSessionsForUser(record.userId);
    await markLoginActivitiesRevoked(String(record.userId));
    res.json({ success: true });
  });

  app.get("/api/auth/sessions", authenticateToken, async (req: any, res: any) => {
    const [sessions, activities] = await Promise.all([
      listSessionsForUser(req.user.id),
      prisma.loginActivity.findMany({
        where: { userId: String(req.user.id) },
        orderBy: { loggedInAt: "desc" },
      }),
    ]);

    const activityBySession = new Map<string, any>(activities.map((activity: any) => [activity.sessionId, activity]));

    res.json(
      sessions.map((session) => ({
        session_id: session.sid,
        created_at: session.createdAt,
        expires_at: session.expiresAt,
        device_name: session.deviceName ?? activityBySession.get(session.sid)?.deviceName ?? null,
        ip_address: session.ipAddress ?? activityBySession.get(session.sid)?.ipAddress ?? null,
        user_agent: session.userAgent ?? activityBySession.get(session.sid)?.userAgent ?? null,
        location: session.location ?? activityBySession.get(session.sid)?.location ?? null,
      })),
    );
  });

  app.post("/api/auth/logout-all", authenticateToken, async (req: any, res: any) => {
    await revokeAllSessionsForUser(req.user.id);
    await markLoginActivitiesRevoked(String(req.user.id));
    res.clearCookie("access_token", getAccessCookieOptions());
    res.clearCookie("refresh_token", getRefreshCookieOptions());
    res.json({ success: true });
  });

  app.post("/api/auth/send-verification", authenticateToken, rateLimit("send-verification", 5, 60_000), async (req: any, res: any) => {
    const user = await prisma.user.findUnique({ where: { id: String(req.user.id) } });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.emailVerified) return res.json({ success: true, message: "Already verified" });
    const { token, expiresAt } = await createVerificationToken(user.id, "email_verifications", 60 * 24);
    await sendEmail(
      user.email,
      "Verify your LofiMart account",
      `<p>Hello ${user.name || "there"},</p><p>Please verify your email by clicking the link below:</p><p><a href="${env.FRONTEND_URL}/api/auth/verify-email?token=${token}">Verify email</a></p><p>This link expires at ${new Date(expiresAt).toLocaleString()}.</p>`,
    );
    res.json({ success: true, verificationToken: process.env.NODE_ENV === "production" ? undefined : token, expiresAt });
  });

  app.post("/api/auth/send-phone-verification", authenticateToken, rateLimit("send-phone-verification", 5, 60_000), async (req: any, res: any) => {
    const user = await prisma.user.findUnique({ where: { id: String(req.user.id) } });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.phone) return res.status(400).json({ error: "Add a phone number before requesting verification" });
    if (user.phoneVerified) return res.json({ success: true, message: "Phone already verified" });

    const { token, expiresAt } = await createVerificationToken(user.id, "phone_verifications", 10);
    const otp = token.replace(/-/g, "").slice(0, 6).toUpperCase();

    res.json({
      success: true,
      expiresAt,
      phoneVerificationCode: process.env.NODE_ENV === "production" ? undefined : otp,
    });
  });

  app.post("/api/auth/verify-phone", authenticateToken, rateLimit("verify-phone", 10, 60_000), async (req: any, res: any) => {
    const submittedCode = String(req.body?.code || "").trim().toUpperCase();
    if (!submittedCode || submittedCode.length < 6) {
      return res.status(400).json({ error: "A valid verification code is required" });
    }

    const records = await prisma.phoneVerificationToken.findMany({
      where: {
        userId: String(req.user.id),
        used: false,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const matchingRecord = records.find((record: any) => record.token.replace(/-/g, "").slice(0, 6).toUpperCase() === submittedCode);
    if (!matchingRecord) {
      return res.status(400).json({ error: "Invalid verification code" });
    }

    if (new Date(matchingRecord.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({ error: "Verification code expired" });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: String(req.user.id) },
        data: {
          phoneVerified: true,
          phoneVerifiedAt: new Date(),
        },
      }),
      prisma.phoneVerificationToken.update({
        where: { id: matchingRecord.id },
        data: { used: true },
      }),
    ]);

    res.json({ success: true });
  });

  app.get("/api/auth/verify-email", rateLimit("verify-email", 20, 60_000), async (req: any, res: any) => {
    const token = req.query.token as string;
    if (!token) return res.status(400).send("Missing token");
    const record = await prisma.emailVerificationToken.findUnique({
      where: { token },
    });
    if (!record || record.used) return res.status(400).send("Invalid or used token");
    if (new Date(record.expiresAt).getTime() < Date.now()) {
      return res.status(400).send("This verification link has expired. Please request a new one.");
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: {
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      }),
      prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { used: true },
      }),
    ]);
    res.send("Email verified. You can close this tab.");
  });

  app.post("/api/auth/logout", async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await revokeSessionByRefreshToken(refreshToken);
    }
    res.clearCookie("access_token", { path: "/" });
    res.clearCookie("refresh_token", { path: "/" });
    res.json({ success: true });
  });
}
