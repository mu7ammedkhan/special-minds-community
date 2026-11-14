// Special Minds Community pop-up notifications (the same as the CRM). This
// script only shows pop-ups and opens the community when one is clicked: it caches
// nothing and never touches page loads.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // Someone looking at the community hears the sound they chose there, so the
    // pop-up itself stays quiet. Otherwise the device plays its own sound.
    const watching = tabs.some((tab) => tab.visibilityState === "visible");
    await self.registration.showNotification(data.title || "Special Minds Community", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/badge-96.png",
      tag: data.tag || undefined,
      silent: watching,
      data: { url: data.url || "/notifications" },
    });
    // An open tab updates its bell straight away (and plays the sound).
    tabs.forEach((tab) => tab.postMessage({ type: "smm-notification" }));
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/notifications", self.location.origin).href;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const tab = tabs.find((t) => new URL(t.url).origin === self.location.origin);
    if (tab) {
      await tab.focus();
      try { await tab.navigate(url); return; } catch { tab.postMessage({ type: "smm-open", url }); return; }
    }
    await self.clients.openWindow(url);
  })());
});
