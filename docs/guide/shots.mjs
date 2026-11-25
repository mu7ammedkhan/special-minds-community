// Screenshots for the user guide, taken from a running copy of the app with the
// made-up demo data (never the live site):
//
//   DATABASE_URL=pglite://.data/guide node scripts/db.mjs reset     (stop the server first)
//   npm run build
//   DATABASE_URL=pglite://.data/guide APP_URL=http://localhost:4812 npx next start -p 4812
//   npm run shots                 (APP_URL=… to point elsewhere; names to retake only those)
//
// It signs in with the demo accounts, so DEMO_LOGINS=1 must be on (it is in .env.local).
// It only looks: forms are filled but never sent, and nothing is saved, except the
// language switch for the Arabic picture (on the guide database only).

import { mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const here = path.dirname(new URL(import.meta.url).pathname);
const BASE = (process.env.APP_URL || "http://localhost:4812").replace(/\/$/, "");
const OUT = path.join(here, "shots");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const only = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });

// The made-up people (scripts/seed.mjs).
const LAYLA = 1;   // owner
const PRIYA = 3;   // moderator
const AISHA = 5;   // specialist, Dubai
const AMINA = 20;  // parent, Dubai
const KHALID = 23; // parent, Abu Dhabi ("Abu Saif")
const NADIA = 28;  // parent, waiting to join

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--hide-scrollbars", "--lang=en-GB"] });

async function as(id, { width = 1440, height = 900, scale = 1.5, mobile = false } = {}) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width, height, deviceScaleFactor: mobile ? 2.5 : scale, isMobile: mobile, hasTouch: mobile });
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: "light" }]);
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  if (id) {
    await Promise.all([
      p.waitForNavigation({ waitUntil: "networkidle0" }),
      p.evaluate((i) => document.querySelector(`input[name=id][value="${i}"]`).closest("form").requestSubmit(), String(id)),
    ]);
  }
  return p;
}
const go = async (p, url) => { await p.goto(`${BASE}${url}`, { waitUntil: "networkidle0", timeout: 60000 }); await wait(700); };
const hide = (p, css) => p.addStyleTag({ content: `${css} { display: none !important; }` });

/** Clicks the first element matching the selector whose text includes `text` (exactly equal when exact). */
async function click(p, selector, text, { exact = false, index = 0 } = {}) {
  const ok = await p.evaluate((sel, t, ex, i) => {
    const els = [...document.querySelectorAll(sel)].filter((e) => !t || (ex ? e.textContent.trim() === t : e.textContent.includes(t)));
    const el = els[i];
    if (!el) return false;
    el.click();
    return true;
  }, selector, text, exact, index);
  if (!ok) throw new Error(`Nothing to click: ${selector} "${text ?? ""}"`);
  await wait(900);
}
/** The box of an element (by selector, optionally the one containing some text), with padding, kept inside the page. */
async function box(p, selector, { text, pad = 14, index = 0, maxHeight } = {}) {
  const r = await p.evaluate((sel, t, i) => {
    const els = [...document.querySelectorAll(sel)].filter((e) => !t || e.textContent.includes(t));
    const el = els[i];
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, vw: innerWidth, vh: innerHeight };
  }, selector, text, index);
  if (!r) throw new Error(`No ${selector} "${text ?? ""}"`);
  const x = Math.max(0, r.left - pad), y = Math.max(0, r.top - pad);
  const bottom = Math.min(r.vh, r.bottom + pad, maxHeight ? y + maxHeight : Infinity);
  return { x, y, width: Math.min(r.vw, r.right + pad) - x, height: bottom - y };
}
/** Several elements together. */
async function boxes(p, list, pad = 14) {
  const bs = [];
  for (const [sel, opts] of list) bs.push(await box(p, sel, { pad: 0, ...(opts ?? {}) }));
  const vw = await p.evaluate(() => innerWidth), vh = await p.evaluate(() => innerHeight);
  const x = Math.max(0, Math.min(...bs.map((b) => b.x)) - pad), y = Math.max(0, Math.min(...bs.map((b) => b.y)) - pad);
  return { x, y, width: Math.min(vw, Math.max(...bs.map((b) => b.x + b.width)) + pad) - x, height: Math.min(vh, Math.max(...bs.map((b) => b.y + b.height)) + pad) - y };
}
/** The page's own column (inside the main area, without the dark side bars). */
const column = async (p, opts = {}) => ((await p.$("main > .mx-auto")) ? box(p, "main > .mx-auto", { pad: 0, ...opts }) : box(p, "main", { pad: 0, ...opts }));
/** The column (or the whole main area on channel pages), cut just below the last card that fits on screen. */
async function cleanCut(p, { pad = 16 } = {}) {
  const root = (await p.$("main > .mx-auto")) ? "main > .mx-auto" : "main";
  const r = await p.evaluate((sel) => {
    const el = document.querySelector(sel);
    const b = el.getBoundingClientRect();
    const cards = [...el.querySelectorAll(".shadow-card")].map((c) => c.getBoundingClientRect()).filter((c) => c.height > 20 && c.bottom <= innerHeight - 4);
    const bottom = cards.length ? Math.max(...cards.map((c) => c.bottom)) : Math.min(innerHeight, b.bottom);
    return { x: b.left, y: Math.max(0, b.top), width: b.width, bottom };
  }, root);
  return { x: r.x, y: r.y, width: r.width, height: Math.min(await p.evaluate(() => innerHeight), r.bottom + pad) - r.y };
}
/** The whole main area (to the right of the dark side bars). */
const mainArea = (p) => box(p, "main", { pad: 0 });

async function shot(p, name, clip) {
  await p.evaluate(() => { const a = document.activeElement; if (a && a.tagName === "BUTTON") a.blur(); });
  await p.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 80, ...(clip ? { clip } : {}) });
  console.log(`  ${name}`);
}
const failed = [];
async function take(name, fn) {
  if (only.length && !only.some((o) => name.startsWith(o))) return;
  try { await fn(); } catch (e) { failed.push(name); console.log(`  FAILED ${name}: ${e.message.split("\n")[0]}`); }
}

// The audit log first: every other picture signs someone in, and the log records each sign-in.
console.log("Audit log");
await take("audit", async () => {
  const p = await as(LAYLA);
  await go(p, "/admin/audit");
  await shot(p, "audit", await cleanCut(p));
});

// ------------------------------------------------------------- joining and signing in
console.log("Joining and signing in");
await take("signin", async () => {
  const p = await as(null, { width: 1200, height: 780 });
  await hide(p, "details");
  await shot(p, "signin", await box(p, "main .rounded-3xl", { pad: 28 }));
});
await take("signin-code", async () => {
  const p = await as(null, { width: 1200, height: 780 });
  await hide(p, "details");
  await p.type("main input", "aisha@demo.local");
  await click(p, "main button", "Send my code");
  await wait(1200);
  // The demo shows the code on screen; members get it by email or WhatsApp instead. Hide just that line.
  await p.evaluate(() => {
    const all = [...document.querySelectorAll("main *")].filter((e) => e.textContent.includes("Preview only"));
    const smallest = all.sort((a, b) => a.textContent.length - b.textContent.length)[0];
    if (smallest) (smallest.closest("p") ?? smallest).style.display = "none";
  });
  await shot(p, "signin-code", await box(p, "main .rounded-3xl", { pad: 28 }));
});
await take("join-choose", async () => {
  const p = await as(null, { width: 1200, height: 780 });
  await go(p, "/join");
  await shot(p, "join-choose", await box(p, "main .rounded-3xl", { pad: 28 }));
});
await take("join-request", async () => {
  const p = await as(null, { width: 1200, height: 780 });
  await go(p, "/join/space/families-uae");
  await shot(p, "join-request", await box(p, "main .rounded-3xl", { pad: 28 }));
});
await take("waiting", async () => {
  const p = await as(NADIA, { width: 1200, height: 780 });
  await go(p, "/");
  await shot(p, "waiting", await box(p, "main .rounded-3xl", { pad: 28 }));
});

// ------------------------------------------------------------- finding your way, chatting
console.log("Finding your way and chatting");
await take("shell", async () => {
  const p = await as(AISHA);
  await go(p, "/s/specialists-uae/general");
  await shot(p, "shell");
});
await take("browse", async () => {
  const p = await as(AISHA);
  await go(p, "/s/specialists-uae/browse");
  const fourth = await p.evaluate(() => [...document.querySelectorAll("main .shadow-card")][3].getBoundingClientRect().bottom);
  const c = await column(p);
  await shot(p, "browse", { ...c, height: fourth + 16 - c.y });
});
await take("mention", async () => {
  const p = await as(AISHA);
  await go(p, "/s/specialists-uae/general");
  await p.click("main textarea");
  await p.keyboard.type("Thanks @Fat", { delay: 40 });
  await wait(900);
  const m = await mainArea(p);
  await shot(p, "mention", { x: m.x, y: m.y + m.height - 330, width: m.width, height: 330 });
});
await take("hover", async () => {
  const p = await as(AISHA);
  await go(p, "/s/specialists-uae/general");
  const b = await p.evaluate(() => {
    const e = [...document.querySelectorAll("main p, main div")].find((x) => x.textContent.trim().startsWith("Does anyone have a good sensory diet"));
    const r = e.getBoundingClientRect();
    return { x: r.left, y: r.top };
  });
  await p.mouse.move(b.x + 260, b.y + 6);
  await wait(700);
  const m = await mainArea(p);
  await shot(p, "hover", { x: m.x, y: b.y - 60, width: m.width, height: 150 });
});
await take("thread", async () => {
  const p = await as(AISHA);
  await go(p, "/s/specialists-uae/general");
  await click(p, "main a, main button", "3 replies");
  await wait(900);
  // The top of the channel and the open thread: the replies, without the empty space below them.
  const m = await mainArea(p);
  await shot(p, "thread", { ...m, height: 330 });
});
await take("poll", async () => {
  const p = await as(AISHA);
  await go(p, "/s/specialists-uae/general");
  await p.click("main textarea");
  await p.keyboard.type("Which day suits you for the next case review?", { delay: 10 });
  await p.click('main button[aria-label="Make it a poll"]');
  await wait(700);
  await click(p, "main button", "Add a choice");
  const inputs = await p.$$('main input[placeholder^="Choice"]');
  const answers = ["Monday after 5 pm", "Wednesday after 5 pm", "Saturday morning"];
  for (let i = 0; i < Math.min(inputs.length, answers.length); i++) await inputs[i].type(answers[i], { delay: 5 });
  await wait(400);
  // The message box with its poll answers, from the box's top to the bottom of the screen.
  const top = await p.evaluate(() => document.querySelector("main textarea").closest("div.relative").getBoundingClientRect().top);
  const m = await mainArea(p);
  await shot(p, "poll", { x: m.x, y: Math.max(0, top - 8), width: m.width, height: m.y + m.height - Math.max(0, top - 8) });
});

// ------------------------------------------------------------- forums, opportunities, events, library
console.log("Forums, opportunities, events, library");
await take("forum", async () => {
  const p = await as(AISHA);
  await go(p, "/s/specialists-uae/aba-and-behaviour");
  await shot(p, "forum", await cleanCut(p));
});
await take("topic", async () => {
  const p = await as(AISHA, { height: 1000 });
  await go(p, "/s/specialists-uae/aba-and-behaviour/21");
  await shot(p, "topic", await column(p));
});
await take("ask-list", async () => {
  const p = await as(AMINA);
  await go(p, "/s/families-uae/ask-a-specialist");
  await shot(p, "ask-list", await cleanCut(p));
});
await take("ask-new", async () => {
  const p = await as(AMINA);
  await go(p, "/s/families-uae/ask-a-specialist/new");
  await shot(p, "ask-new", await column(p));
});
await take("opps", async () => {
  const p = await as(AISHA);
  await go(p, "/s/specialists-uae/opportunities-dubai");
  await shot(p, "opps", await cleanCut(p));
});
await take("opp-note", async () => {
  const p = await as(AISHA);
  await go(p, "/s/specialists-uae/opportunities-dubai");
  await click(p, "main button", "I'm interested", { exact: true });
  await wait(700);
  const ta = await p.$("[role=dialog] textarea");
  if (ta) await ta.type("Free from 1 December, weekday afternoons.", { delay: 5 });
  await wait(300);
  await shot(p, "opp-note", await box(p, "[role=dialog]", { pad: 0 }));
});
await take("events", async () => {
  const p = await as(AISHA);
  await go(p, "/s/specialists-uae/training-and-events");
  await shot(p, "events", await cleanCut(p));
});
await take("library", async () => {
  const p = await as(AISHA);
  await go(p, "/s/specialists-uae/resources");
  await shot(p, "library", await cleanCut(p));
});

// ------------------------------------------------------------- families
console.log("Families");
await take("feed", async () => {
  const p = await as(AMINA, { height: 1000 });
  await go(p, "/s/families-uae/community-feed");
  await shot(p, "feed", await column(p, { maxHeight: 760 }));
});
await take("help-form", async () => {
  const p = await as(AMINA, { height: 1300 });
  await go(p, "/help");
  await shot(p, "help-form", await column(p));
});

// ------------------------------------------------------------- messages, notifications, search, account
console.log("Messages, notifications, search, account");
await take("dm-list", async () => {
  const p = await as(AISHA);
  await go(p, "/dm");
  await shot(p, "dm-list", await column(p, { maxHeight: 220 }));
});
await take("dm-new", async () => {
  const p = await as(AMINA);
  await go(p, "/dm/new");
  await shot(p, "dm-new", await column(p));
});
await take("notifications", async () => {
  const p = await as(AISHA);
  await go(p, "/notifications");
  await shot(p, "notifications", await column(p, { maxHeight: 300 }));
});
await take("notify-settings", async () => {
  const p = await as(AISHA, { height: 1250 });
  await go(p, "/account?tab=notifications");
  await shot(p, "notify-settings", await column(p));
});
await take("channel-bell", async () => {
  const p = await as(AISHA);
  await go(p, "/s/specialists-uae/general");
  await p.click('main button[aria-label="Alerts for this channel"]');
  await wait(800);
  const m = await mainArea(p);
  await shot(p, "channel-bell", { x: m.x + m.width - 520, y: 0, width: 520, height: 300 });
});
await take("search", async () => {
  const p = await as(AISHA);
  await go(p, "/search?q=visual");
  await shot(p, "search", await column(p, { maxHeight: 560 }));
});
await take("member-card", async () => {
  const p = await as(AISHA);
  await go(p, "/members/8");
  await shot(p, "member-card", await column(p));
});
await take("account-profile", async () => {
  const p = await as(AISHA, { height: 1800 });
  await go(p, "/account");
  await shot(p, "account-profile", await column(p));
});
await take("account-security", async () => {
  const p = await as(AISHA);
  await go(p, "/account?tab=security");
  await shot(p, "account-security", await column(p));
});
await take("account-data", async () => {
  const p = await as(AISHA);
  await go(p, "/account?tab=privacy");
  await shot(p, "account-data", await column(p));
});
await take("arabic", async () => {
  const p = await as(KHALID);
  await go(p, "/account?tab=language");
  await click(p, "main button", "العربية");
  await wait(1200);
  await go(p, "/s/families-uae/community-feed");
  await shot(p, "arabic");
});

// ------------------------------------------------------------- phone
console.log("Phone");
await take("phone", async () => {
  const p = await as(AISHA, { width: 390, height: 844, mobile: true });
  await go(p, "/s/specialists-uae/general");
  await shot(p, "phone-chat");
  await go(p, "/s/specialists-uae/opportunities-dubai");
  await shot(p, "phone-opps");
  await go(p, "/s/specialists-uae/general");
  await click(p, "header button", "", { index: 0 });
  await wait(800);
  await shot(p, "phone-menu");
});

// ------------------------------------------------------------- the team
console.log("Running the community");
await take("admin-overview", async () => {
  const p = await as(LAYLA);
  await go(p, "/admin");
  await shot(p, "admin-overview");
});
await take("moderator-menu", async () => {
  const p = await as(PRIYA);
  await go(p, "/admin");
  await shot(p, "moderator-menu", await box(p, "aside", { pad: 0, maxHeight: 400 }));
});
await take("downloads", async () => {
  const p = await as(LAYLA, { height: 1300 });
  await go(p, "/admin");
  await shot(p, "downloads", await box(p, "main .shadow-card", { text: "Download as a spreadsheet", pad: 6, index: 0 }));
});
await take("invite-make", async () => {
  const p = await as(LAYLA, { height: 1100 });
  await go(p, "/admin/invites");
  await shot(p, "invite-make", await box(p, "main .shadow-card", { text: "Make an invite", pad: 6, index: 0 }));
});
await take("invite-links", async () => {
  const p = await as(LAYLA, { height: 1700 });
  await go(p, "/admin/invites");
  await shot(p, "invite-links", await boxes(p, [["main .shadow-card", { text: "Shared links" }], ["main .shadow-card", { text: "Personal invites" }]], 6));
});
await take("import", async () => {
  const p = await as(LAYLA, { height: 1100 });
  await go(p, "/admin/import");
  const input = await p.$("main input[type=file]");
  await input.uploadFile(path.join(here, "sample-talent.csv"));
  await wait(1500);
  await shot(p, "import", await column(p));
});
await take("requests", async () => {
  const p = await as(LAYLA, { height: 1000 });
  await go(p, "/admin/requests");
  await shot(p, "requests", await cleanCut(p));
});
await take("members", async () => {
  const p = await as(LAYLA);
  await go(p, "/admin/members");
  await shot(p, "members", await column(p, { maxHeight: 520 }));
});
await take("member-controls", async () => {
  const p = await as(LAYLA, { height: 1100 });
  await go(p, "/admin/members/5");
  await shot(p, "member-controls", await column(p, { maxHeight: 900 }));
});
await take("spaces", async () => {
  const p = await as(LAYLA);
  await go(p, "/admin/spaces");
  await shot(p, "spaces", await cleanCut(p));
});
await take("space-settings", async () => {
  const p = await as(LAYLA, { height: 2600 });
  await go(p, "/admin/spaces/2");
  await shot(p, "space-settings", await box(p, "main form", { pad: 14, index: 0 }));
});
await take("channel-settings", async () => {
  const p = await as(LAYLA, { height: 2600 });
  await go(p, "/admin/spaces/2");
  const href = await p.evaluate(() => [...document.querySelectorAll("a[href^='/admin/channels/']")].find((a) => a.textContent.includes("Autism"))?.getAttribute("href"));
  await go(p, href);
  const settings = await box(p, "main .shadow-card", { text: "Settings and permissions", pad: 0, index: 0 });
  const c = await column(p);
  await shot(p, "channel-settings", { ...c, height: settings.y + settings.height + 16 - c.y });
});
await take("opp-new", async () => {
  const p = await as(LAYLA, { height: 1500 });
  await go(p, "/s/specialists-uae/opportunities-dubai/new");
  await shot(p, "opp-new", await column(p));
});
await take("opp-responses", async () => {
  const p = await as(LAYLA, { height: 1300 });
  await go(p, "/s/specialists-uae/opportunities-dubai/17");
  await shot(p, "opp-responses", await box(p, "main .shadow-card", { text: "Talent portal", pad: 0, index: 0 }));
});
await take("broadcast-new", async () => {
  const p = await as(LAYLA, { height: 1400 });
  await go(p, "/admin/broadcasts/new");
  await shot(p, "broadcast-new", await column(p));
});
await take("broadcast-seen", async () => {
  const p = await as(LAYLA);
  await go(p, "/admin/broadcasts/1");
  await shot(p, "broadcast-seen", await cleanCut(p));
});
await take("scheduled", async () => {
  const p = await as(LAYLA);
  await go(p, "/admin/scheduled");
  await shot(p, "scheduled", await cleanCut(p));
});
await take("moderation", async () => {
  const p = await as(LAYLA);
  await go(p, "/admin/moderation");
  await shot(p, "moderation", await cleanCut(p));
});
await take("words", async () => {
  const p = await as(LAYLA);
  await go(p, "/admin/words");
  await shot(p, "words", await column(p, { maxHeight: 560 }));
});
await take("help-admin", async () => {
  const p = await as(LAYLA);
  await go(p, "/admin/help");
  await shot(p, "help-admin", await cleanCut(p));
});
await take("settings", async () => {
  const p = await as(LAYLA, { height: 2400 });
  await go(p, "/admin/settings");
  await shot(p, "settings", await column(p));
});
await take("outbox", async () => {
  const p = await as(LAYLA, { height: 720 });
  await go(p, "/admin/outbox");
  await shot(p, "outbox", await cleanCut(p));
});

await browser.close();
if (failed.length) { console.log(`\n${failed.length} failed: ${failed.join(", ")}`); process.exit(1); }
console.log("\nAll screenshots taken.");
