import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * The title and description of the first link in a message, shown under it.
 * Only public web addresses are fetched (never this server's own network),
 * with a short timeout and a size cap. No images: a picture from another site
 * would tell that site who is reading.
 */

function privateIp(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:");
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

export async function fetchPreview(raw: string): Promise<{ url: string; title: string; description: string | null; site: string } | null> {
  try {
    let url = new URL(raw);
    for (let hop = 0; hop < 3; hop++) {
      if (!/^https?:$/.test(url.protocol) || (url.port && !["80", "443"].includes(url.port))) return null;
      const addrs = await lookup(url.hostname, { all: true });
      if (!addrs.length || addrs.some((a) => privateIp(a.address))) return null;
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(4000), headers: { "User-Agent": "Mozilla/5.0 (compatible; CommunityLinkPreview/1.0)", Accept: "text/html" } });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) { url = new URL(res.headers.get("location")!, url); continue; }
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/html")) return null;
      const reader = res.body?.getReader();
      if (!reader) return null;
      let html = "";
      const dec = new TextDecoder();
      while (html.length < 200_000) { const { done, value } = await reader.read(); if (done) break; html += dec.decode(value, { stream: true }); }
      reader.cancel().catch(() => {});
      const meta = (name: string) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, "i"))?.[1]
        ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, "i"))?.[1];
      const title = decode(meta("og:title") ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "");
      if (!title) return null;
      const description = decode(meta("og:description") ?? meta("description") ?? "") || null;
      return { url: url.href, title: title.slice(0, 160), description: description?.slice(0, 280) ?? null, site: decode(meta("og:site_name") ?? url.hostname.replace(/^www\./, "")) };
    }
    return null;
  } catch {
    return null;
  }
}
