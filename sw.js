// Offline shell: the app always loads its newest version when online (bypassing the browser cache)
// and falls back to the saved copy only without connection. Data always comes fresh from Supabase.
const CACHE = "atlas-v7";
const SHELL = ["./", "index.html", "style.css", "app.js", "config.js", "icon.svg", "icon-192.png", "manifest.webmanifest"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;  // Supabase, tiles, CDNs: network only
  e.respondWith(fetch(e.request, { cache: "no-store" })
    .then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request)));
});
