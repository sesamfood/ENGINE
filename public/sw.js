const worker = globalThis;
const CACHE_PREFIX = "driftsplatform-";
const OFFLINE_CACHE = "driftsplatform-offline-v1";
const OFFLINE_URL = "/offline.html";

worker.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      worker.skipWaiting(),
      worker.caches
        .open(OFFLINE_CACHE)
        .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" }))),
    ]),
  );
});

worker.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      worker.clients.claim(),
      worker.caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter(
              (cacheName) =>
                cacheName.startsWith(CACHE_PREFIX) &&
                cacheName !== OFFLINE_CACHE,
            )
            .map((cacheName) => worker.caches.delete(cacheName)),
        ),
      ),
    ]),
  );
});

worker.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    worker.fetch(event.request).catch(() =>
      worker.caches
        .match(OFFLINE_URL)
        .then((response) => response ?? Response.error()),
    ),
  );
});
