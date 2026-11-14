// Lists every English line the pages show that the Arabic dictionary
// (lib/i18n/ar.ts) doesn't have yet.
//   npm run i18n:check            prints the missing lines
//   node scripts/i18n-check.mjs --json > missing.json
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (/node_modules|\.next|\.data|scripts/.test(p)) continue; if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f)) files.push(p); } };
walk(path.join(root, "app")); walk(path.join(root, "components")); walk(path.join(root, "lib"));
const found = new Set();
const unesc = (s) => s.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\'/g, "'");
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) found.add(unesc(m[1]));
  for (const m of src.matchAll(/\btt\(\s*"((?:[^"\\]|\\.)*)"/g)) found.add(unesc(m[1]));
  if (/lib\/(options|sounds)\.ts$/.test(f)) {
    for (const m of src.matchAll(/\b(?:label|hint|name): "((?:[^"\\]|\\.)*)"/g)) found.add(unesc(m[1]));
    for (const m of src.matchAll(/(?:cities|LANGUAGES =|SKILLS =)[^\]]*\]/g)) for (const s of m[0].matchAll(/"([^"]+)"/g)) found.add(s[1]);
    for (const m of src.matchAll(/: "([A-Z][^"]+)"/g)) found.add(m[1]);
  }
  if (/lib\/(auth|members|files|opportunities|posts|access)\.ts$/.test(f) || /app\/actions\//.test(f)) {
    for (const m of src.matchAll(/(?:error|problem): "((?:[^"\\]|\\.)*)"/g)) found.add(unesc(m[1]));
    for (const m of src.matchAll(/\?\? "([A-Z][^"]{8,})"/g)) found.add(m[1]);
  }
}
["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Verified BCBA", "Verified speech therapist", "Verified occupational therapist", "Verified psychologist", "Special Minds team",
  "Data sheets", "Visual supports", "Guides", "Links", "Getting started", "Shadow teachers"].forEach((s) => found.add(s));
const arSrc = readFileSync(path.join(root, "lib/i18n/ar.ts"), "utf8");
const have = new Set([...arSrc.matchAll(/^\s*"((?:[^"\\]|\\.)*)":/gm)].map((m) => unesc(m[1])));
const missing = [...found].filter((s) => s.trim() && !have.has(s) && !/^[a-z_]+$/.test(s) && !/^(en|ar|AE|IN|KW|QA|SA)$/.test(s)).sort();
if (process.argv.includes("--json")) console.log(JSON.stringify(missing, null, 1));
else { console.log(missing.join("\n")); console.error(`\n${missing.length} lines missing from lib/i18n/ar.ts (${found.size} in all)`); }
