import "server-only";
import webpush from "web-push";

/**
 * Pop-up notifications (web push), the same way as Hamd Projects. The
 * browser's push service (Google, Apple, Mozilla) carries them; each is signed
 * with the app's VAPID key pair:
 *   VAPID_PUBLIC_KEY   handed to browsers when someone turns pop-ups on
 *   VAPID_PRIVATE_KEY  server only
 *   VAPID_SUBJECT      a mailto: or https: contact for the push services
 * Without the keys nothing is sent and the "Turn on" buttons stay hidden.
 */

export type Push = { subscription_id: string; endpoint: string; p256dh: string; auth: string; title: string; body: string | null; link: string; tag: string };

export const pushPublicKey = () => process.env.VAPID_PUBLIC_KEY || null;
export const pushReady = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

/** Sends each pop-up; says which devices got one and which the browser says are gone. */
export async function sendPushes(list: Push[]): Promise<{ sent: string[]; gone: string[] }> {
  const sent: string[] = [], gone: string[] = [];
  if (!pushReady() || !list.length) return { sent, gone };
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello@specialminds.ae", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  await Promise.all(list.map(async (p) => {
    try {
      await webpush.sendNotification(
        { endpoint: p.endpoint, keys: { p256dh: p.p256dh, auth: p.auth } },
        JSON.stringify({ title: p.title, body: p.body ?? "", url: p.link, tag: p.tag }),
        // Kept for a day if the device is off; "high" so phones show it straight away.
        { TTL: 24 * 60 * 60, urgency: "high", timeout: 10_000 },
      );
      sent.push(p.subscription_id);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) gone.push(p.subscription_id);
      else console.error(`Pop-up not sent (${status ?? (e as Error).message})`);
    }
  }));
  return { sent, gone };
}
