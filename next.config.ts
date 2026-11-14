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
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
