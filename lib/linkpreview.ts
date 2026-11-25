import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

/**
 * The title and description of the first link in a message, shown under it.
 * Only public web addresses are fetched (never this server's own network),
 * with a short timeout and a size cap. No images: a picture from another site
 * would tell that site who is reading.
 *
 * The address check happens in the connection's own DNS lookup, so a name
 * can't pass a check and then point at a private address when the request
 * connects (DNS rebinding).
 */

function privateIp(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("fec0")
    || v.startsWith("::ffff:") || v.startsWith("64:ff9b:") || v.startsWith("2002:");
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** The connection's DNS lookup: refuses the request when any address for the name is private. */
function publicLookup(hostname: string, options: { all?: boolean }, cb: LookupCallback) {
  dnsLookup(hostname, { all: true }, (err, addrs) => {
    if (err) return cb(err, "", 4);
    const list = addrs as LookupAddress[];
    if (!list.length || list.some((a) => privateIp(a.address))) return cb(Object.assign(new Error("Private address"), { code: "EPRIVATE" }), "", 4);
    if (options?.all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}

type Got = { status: number; location: string | null; type: string; body: string };

/** One GET, at most 200 kB of an HTML page, within 4 seconds. */
function get(url: URL): Promise<Got> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.get(url, {
      lookup: publicLookup as unknown as typeof dnsLookup,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CommunityLinkPreview/1.0)", Accept: "text/html" },
    }, (res) => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location ?? null;
      const type = String(res.headers["content-type"] ?? "");
      if (status < 200 || status >= 300 || !type.includes("text/html")) { res.resume(); resolve({ status, location, type, body: "" }); return; }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        body += chunk;
        if (body.length >= 200_000) { res.destroy(); resolve({ status, location, type, body }); }
      });
      res.on("end", () => resolve({ status, location, type, body }));
      res.on("error", reject);
    });
    const timer = setTimeout(() => req.destroy(new Error("Timed out")), 4000);
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
  });
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

export async function fetchPreview(raw: string): Promise<{ url: string; title: string; description: string | null; site: string } | null> {
  try {
    let url = new URL(raw);
    for (let hop = 0; hop < 3; hop++) {
      if (!/^https?:$/.test(url.protocol) || (url.port && !["80", "443"].includes(url.port)) || url.username || url.password) return null;
      // An early answer for plain IP addresses (the connection lookup above isn't used for them).
      const addrs = await lookup(url.hostname, { all: true });
      if (!addrs.length || addrs.some((a) => privateIp(a.address))) return null;
      const res = await get(url);
      if (res.status >= 300 && res.status < 400 && res.location) { url = new URL(res.location, url); continue; }
      if (res.status < 200 || res.status >= 300 || !res.type.includes("text/html")) return null;
      const html = res.body;
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
