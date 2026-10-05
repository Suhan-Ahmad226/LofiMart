import type { NextConfig } from "next";
const isProd = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https: blob:" +
    (isProd ? "" : " 'unsafe-eval'"),
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https: ws: wss:",
  "frame-src 'self' https://widget.cloudinary.com",
  "media-src 'self' data: blob: https:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const noStoreHeaders = [
  {
    key: "Cache-Control",
    value: "no-store, no-cache, must-revalidate",
  },
  {
    key: "Pragma",
    value: "no-cache",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
];

if (isProd) {
  securityHeaders.push({
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  });
}

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },

  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "framer-motion",
    ],
  },

  headers: async () => [
    {
      source: "/(.*)",
      headers: securityHeaders,
    },
    {
      // Only auth/payment/checkout routes must never be cached. Public read
      // routes ship their own Cache-Control (s-maxage + stale-while-revalidate)
      // and a blanket no-store here was overriding all of them, forcing every
      // page load to re-query the database.
      source: "/api/auth/:path*",
      headers: noStoreHeaders,
    },
    {
      source: "/api/admin/:path*",
      headers: noStoreHeaders,
    },
    {
      source: "/api/seller/:path*",
      headers: noStoreHeaders,
    },
    {
      source: "/api/payment/:path*",
      headers: noStoreHeaders,
    },
    {
      source: "/api/checkout/:path*",
      headers: noStoreHeaders,
    },
    {
      source: "/(.*)\\.(jpg|jpeg|png|gif|ico|svg|webp|avif)",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
      ],
    },
  ],

  poweredByHeader: false,
  reactStrictMode: true,
  compress: true,
};

export default nextConfig;
