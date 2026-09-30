import { createServer as createNetServer } from "net";
import nextjs from "next";
import { WebSocketServer, WebSocket } from "ws";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import crypto from "crypto";
import { getServerEnv } from "../lib/env";
import { logger } from "../lib/logger";
import { prisma, prismaDirect } from "../features/shared/services/database/prisma";
import { ensureRedis } from "../features/shared/services/messaging/redis";

const __filename = new URL(import.meta.url).pathname;
const __dirname = new URL(".", import.meta.url).pathname;
const env = getServerEnv();

const PROJECT_ROOT = process.cwd();
const DEFAULT_WS_PORT = 3101;

let httpServerRef: ReturnType<typeof import("http").createServer> | null = null;
let wsServerRef: WebSocketServer | null = null;
const PERFORMANCE_EVENTS_KEY = `${env.QUEUE_PREFIX}:analytics:web-vitals`;
const PERFORMANCE_ALERTS_KEY = `${env.QUEUE_PREFIX}:analytics:web-vitals:alerts`;
const PERFORMANCE_ALERT_COOLDOWN_KEY = `${env.QUEUE_PREFIX}:analytics:web-vitals:critical-alert`;
const PERFORMANCE_ALERT_WINDOW_MS = 10 * 60 * 1000;
const PERFORMANCE_ALERT_COOLDOWN_SECONDS = 30 * 60;
const PERFORMANCE_ALERT_MIN_POOR_EVENTS = 8;
const PERFORMANCE_ALERT_MIN_POOR_EVENTS_PER_ROUTE = 3;

const MAX_CART_ITEMS = 50;
const MAX_CART_ITEM_QTY = 99;
const MAX_ORDER_LINES = 50;

function assertSupportedNodeVersion(isDev: boolean) {
  if (!isDev) {
    return;
  }

  const major = Number.parseInt(process.versions.node.split(".")[0] || "0", 10);

  if (major >= 24) {
    const message =
      `Unsupported Node.js ${process.versions.node} for local dev in this app. ` +
      "Use Node.js 20 or 22 LTS to avoid Next.js App Router manifest/runtime crashes on Windows.";
    throw new Error(message);
  }
}

async function getAvailablePort(startPort: number): Promise<number> {
  let port = startPort;
  const maxPort = startPort + 20;

  while (port <= maxPort) {
    const isFree = await new Promise<boolean>((resolve) => {
      const tester = createNetServer();
      tester.unref();
      tester.once("error", () => {
        tester.close();
        resolve(false);
      });
      tester.once("listening", () => {
        tester.close(() => resolve(true));
      });
      tester.listen({ port, host: "0.0.0.0" });
    });

    if (isFree) return port;
    port += 1;
  }

  throw new Error(`No free ports in range ${startPort}-${maxPort}`);
}

const validateEmail = (email: string) =>
  typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.toLowerCase());

const validatePassword = (pwd: string) =>
  typeof pwd === "string" && pwd.length >= 8 && /[A-Za-z]/.test(pwd) && /[0-9]/.test(pwd);

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || "Unknown error");
}

function logServerError(context: string, error: unknown, meta?: Record<string, unknown>) {
  const message = getErrorMessage(error);
  if (meta && Object.keys(meta).length > 0) {
    console.error(`[server] ${context}: ${message}`, meta);
    return;
  }
  console.error(`[server] ${context}: ${message}`);
}

function isDatabaseUnavailableError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("max clients reached") ||
    message.includes("can't reach database server") ||
    message.includes("too many connections") ||
    message.includes("prismaclientinitializationerror") ||
    message.includes("connection pool timeout")
  );
}

function normalizeStorefrontSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeStorefrontDomain(value?: string | null) {
  if (!value) return null;
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function generateStorefrontDomainVerificationToken() {
  return `asb-${crypto.randomBytes(12).toString("hex")}`;
}

function buildStorefrontDomainVerificationPayload(domain?: string | null, token?: string | null, status?: string | null, verifiedAt?: Date | string | null) {
  const normalizedDomain = normalizeStorefrontDomain(domain);
  const normalizedToken = token ? String(token) : null;

  if (!normalizedDomain) {
    return {
      domain: null,
      status: "unverified",
      token: null,
      verified_at: null,
      records: [],
    };
  }

  return {
    domain: normalizedDomain,
    status: status || "pending",
    token: normalizedToken,
    verified_at: verifiedAt ? new Date(verifiedAt).toISOString() : null,
    records: [
      {
        type: "CNAME",
        host: normalizedDomain,
        value: "stores.lofimart.com",
        note: "Point your reseller or seller subdomain to the LofiMart storefront gateway.",
      },
      {
        type: "TXT",
        host: `_amarshop-challenge.${normalizedDomain}`,
        value: normalizedToken || "",
        note: "Use this verification token so LofiMart can confirm domain ownership.",
      },
    ],
  };
}

function extractHostnameFromRequestHost(host?: string | null) {
  return String(host || "")
    .trim()
    .toLowerCase()
    .split(":")[0] || "";
}

function isPlatformHost(hostname: string) {
  const normalizedFrontend = normalizeStorefrontDomain(env.FRONTEND_URL);
  const frontendHost = normalizedFrontend ? extractHostnameFromRequestHost(normalizedFrontend) : "";

  return (
    !hostname ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost") ||
    (frontendHost ? hostname === frontendHost : false)
  );
}

async function resolveStorefrontByCustomDomain(host: string) {
  const hostname = extractHostnameFromRequestHost(host);
  if (!hostname || isPlatformHost(hostname)) {
    return null;
  }

  const matchedUser = await prisma.user.findFirst({
    where: {
      storefrontCustomDomain: hostname,
      storefrontPublished: true,
      role: { in: ["seller", "reseller"] },
      profileVisibility: { not: "private" },
    },
    select: {
      id: true,
      role: true,
      storefrontSlug: true,
    },
  });

  if (!matchedUser) {
    return null;
  }

  if (matchedUser.role === "seller" && matchedUser.storefrontSlug) {
    return { kind: "seller" as const, targetPath: `/store/${matchedUser.storefrontSlug}` };
  }

  if (matchedUser.role === "reseller") {
    const referral = await prismaDirect.resellerReferral.findUnique({
      where: { resellerId: matchedUser.id },
      select: { code: true },
    });

    if (referral?.code) {
      return { kind: "reseller" as const, targetPath: `/r/${referral.code}` };
    }
  }

  return null;
}

let cloudinary: unknown = null;
let mailer: ReturnType<typeof nodemailer.createTransport> | null = null;
let mailFrom = "";
let resendApiKey = "";
let supabaseAuth: unknown = null;
let supabaseAdmin: unknown = null;

async function initCloudinary() {
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return null;
  }

  try {
    const mod = await import("cloudinary").then((m) => m.default || m);
    mod.v2.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });
    return mod.v2;
  } catch {
    return null;
  }
}

async function initMailer() {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    return null;
  }

  const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);

  const transport = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    requireTLS: smtpPort !== 465,
    greetingTimeout: 30_000,
    connectionTimeout: 60_000,
    socketTimeout: 300_000,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  return transport;
}

async function initSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    logger.warn("supabase.misconfigured", {
      url: Boolean(supabaseUrl),
      publishableKey: Boolean(supabasePublishableKey),
      serviceRoleKey: Boolean(supabaseServiceRoleKey),
      hint: "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY). OTP and session features will fail.",
    });
    return { auth: null, admin: null };
  }

  const auth = createSupabaseClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }) as any;

  const admin = supabaseServiceRoleKey
    ? createSupabaseClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }) as any
    : null;

  return { auth, admin };
}

export async function startServer() {
  logger.info("server.starting", {
    environment: env.APP_ENV,
    node: process.version,
  });

  const preferredPort = parseInt(process.env.PORT || "3000", 10);
  const PORT = await getAvailablePort(preferredPort);
  const isDev = process.env.NODE_ENV !== "production";
  assertSupportedNodeVersion(isDev);

  const preferredWsPort = parseInt(process.env.WS_PORT || String(DEFAULT_WS_PORT), 10);
  const wsPort = await getAvailablePort(preferredWsPort);
  process.env.WS_PORT = wsPort.toString();

  cloudinary = await initCloudinary();
  mailer = await initMailer();
  mailFrom = process.env.NOTIFY_FROM_EMAIL || "no-reply@lofimart.com";
  resendApiKey = process.env.RESEND_API_KEY || "";
  const supabase = await initSupabase();
  supabaseAuth = supabase.auth;
  supabaseAdmin = supabase.admin;

  await prisma.$connect();
  await ensureRedis();

  type NextServerInstance = {
    getRequestHandler: () => (req: unknown, res: unknown) => Promise<void>;
    prepare: () => Promise<void>;
  };
  const nextApp = (nextjs as unknown as (options: {
    dev: boolean;
    dir: string;
    hostname: string;
    port: number;
  }) => NextServerInstance)({
    dev: isDev,
    dir: PROJECT_ROOT,
    hostname: "0.0.0.0",
    port: PORT,
  });
  const handleNextRequest = nextApp.getRequestHandler();

  await nextApp.prepare();
  logger.info("server.next.ready", {
    port: PORT,
    wsPort,
  });

  const server = (await import("http")).createServer(handleNextRequest);
  httpServerRef = server;

  server.listen(PORT, "0.0.0.0", () => {
    logger.info("server.http.started", {
      host: "0.0.0.0",
      port: PORT,
      environment: env.APP_ENV,
    });
    if (PORT !== preferredPort) {
      console.warn(`Port ${preferredPort} was busy; switched to ${PORT}`);
    }
  });

  const wss = new WebSocketServer({
    port: wsPort,
  });
  wsServerRef = wss;
  const broadcast = (msg: unknown) => {
    const payload = JSON.stringify(msg);
    wss.clients.forEach((client: WebSocket) => {
      if (client.readyState === 1) client.send(payload);
    });
  };
  logger.info("server.websocket.started", {
    port: wsPort,
    environment: env.APP_ENV,
  });
  if (wsPort !== preferredWsPort) {
    console.warn(`WebSocket port ${preferredWsPort} was busy; switched to ${wsPort}`);
  }

  const emitStockUpdate = (productId: number, stock: number) => {
    broadcast({ type: "stock", productId, stock });
  };

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

  // Start BullMQ workers as separate process in production
  // In development, they are started via `npm run worker`
  if (isDev) {
    try {
      const { startWorkers } = await import("../workers/queue");
      await startWorkers();
      logger.info("server.workers.started", {
        environment: env.APP_ENV,
      });
    } catch (error) {
      logger.error("server.workers.start_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    server,
    wsServer: wss,
    emitStockUpdate,
    sendEmail,
    broadcast,
    nextApp,
  };
}

export async function gracefulShutdown(signal: string) {
  logger.info('server.shutdown.initiated', { signal });
  const shutdownTimer = setTimeout(() => {
    logger.error('server.shutdown.timeout', { signal });
    process.exit(1);
  }, 10_000);

  try {
    if (wsServerRef) {
      wsServerRef.close();
      wsServerRef = null;
    }

    if (httpServerRef) {
      await new Promise<void>((resolve) => httpServerRef!.close(() => resolve()));
      httpServerRef = null;
    }

    await prisma.$disconnect();
    const redis = await ensureRedis();
    await redis.quit();
  } catch (error) {
    logger.error('server.shutdown.error', {
      signal,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(shutdownTimer);
    process.exit(0);
  }
}
