const CACHE = "dmn-pos-v3";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const shell = await fetch("/index.html", { cache: "reload" });
    if (!shell.ok) throw new Error("Could not cache the POS shell");
    const html = await shell.clone().text();
    await cache.put("/index.html", shell);
    // Precache the production entry assets: they may have loaded before the
    // worker gained control during the first visit.
    const assets = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/g)]
      .map(match => new URL(match[1], self.location.origin))
      .filter(url => url.origin === self.location.origin)
      .map(url => url.href);
    await cache.addAll(assets);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith("dmn-pos-") && key !== CACHE).map((key) => caches.delete(key))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const navigation = event.request.mode === "navigate";
  // API/authentication responses belong to the application cache and outbox,
  // never the service-worker asset cache.
  if (!navigation && !["script", "style", "image", "font"].includes(event.request.destination)) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      const hit = await caches.match(event.request, { cacheName: CACHE, ignoreVary: !navigation });
      if (hit) return hit;
      if (navigation) {
        const shell = await caches.match("/index.html");
        if (shell) return shell;
      }
      return Response.error();
    }
  })());
});
