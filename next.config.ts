import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  // PGlite ships a WASM Postgres: bundling breaks its file lookups.
  serverExternalPackages: ["@electric-sql/pglite", "postgres", "qrcode", "web-push"],
  experimental: {
    // Photos, files and voice notes arrive as one request (4 MB each at most).
    serverActions: { bodySizeLimit: "5mb" },
    staleTimes: { dynamic: 0, static: 120 },
  },
  outputFileTracingIncludes: {
    "/**": ["./db/**/*.sql", "./node_modules/@electric-sql/pglite/dist/**"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // The microphone is for voice notes, on this site only.
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=()" },
          // HTTPS only, on any host (Vercel adds a shorter one on its own domains).
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // Other sites' windows can't reach into ours. The page-level Content-Security-Policy is in proxy.ts.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
