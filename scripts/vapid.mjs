// Makes the key pair that signs pop-up notifications (VAPID) and adds it to
// an env file, without showing the keys. Run it once per place (local,
// preview, live): making new keys later means everyone turns pop-ups on again.
//
//   node scripts/vapid.mjs .env.local
//   node scripts/vapid.mjs .env.live.local

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import webpush from "web-push";

const file = process.argv[2];
if (!file) { console.log("usage: node scripts/vapid.mjs <env file>"); process.exit(1); }
const text = existsSync(file) ? readFileSync(file, "utf8") : "";
if (/^VAPID_PRIVATE_KEY=/m.test(text)) { console.log(`${file} already has a VAPID key pair: nothing changed.`); process.exit(0); }
const keys = webpush.generateVAPIDKeys();
appendFileSync(file, `${text && !text.endsWith("\n") ? "\n" : ""}# Pop-up notifications (made by scripts/vapid.mjs)\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=mailto:hello@specialminds.ae\n`, { mode: 0o600 });
console.log(`Added VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT to ${file}.`);
