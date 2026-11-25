// Prints guide.html to an A4 PDF with Chrome.
//
//   npm run pdf                         → "Special Minds Community - User Guide.pdf" next to this file
//   npm run pdf -- /path/to/out.pdf     → anywhere else
//
// Take the screenshots first (npm run shots) if the screens changed.

import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const dir = path.dirname(new URL(import.meta.url).pathname);
const out = process.argv[2] || path.join(dir, "Special Minds Community - User Guide.pdf");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.goto(pathToFileURL(path.join(dir, "guide.html")).href, { waitUntil: "networkidle0" });
await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })))); });
const broken = await page.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.getAttribute("src")));
if (broken.length) { console.error("Missing images:", broken); process.exit(1); }
await page.pdf({ path: out, format: "A4", printBackground: true, preferCSSPageSize: true });
console.log(`Chrome ${await browser.version()}\nSaved ${out}`);
await browser.close();
