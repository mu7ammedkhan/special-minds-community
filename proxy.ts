import { NextResponse, type NextRequest } from "next/server";

/**
 * Content Security Policy with a fresh nonce on every page (Next 16 "proxy").
 * Only scripts that carry this request's nonce run (Next adds it to its own
 * scripts), so a script slipped into a message or a name can't run. Every page
 * is already rendered per request, which nonces need.
 *
 * What the pages load, all from this site: scripts and styles, photos and files
 * (/api/files), QR codes (data: images), photo and voice-note previews before
 * upload (blob:), fonts (next/font serves them from /_next), the service worker
 * (/sw.js). Nothing comes from another domain.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const https = request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  const csp = [
    "default-src 'self'",
    // React needs eval in development only, for its error overlays.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes (poll bars, avatars) and next/font's style tags.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "font-src 'self'",
    "connect-src 'self'",
    // Named on its own: with 'strict-dynamic', script-src no longer covers /sw.js.
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not the API, Next's static files, or the public files (icons, sw.js, logo).
      source: "/((?!api/|_next/static|_next/image|favicon.ico|sw.js|logo-mark.svg|icon|apple-icon|manifest.webmanifest|badge-96.png).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
