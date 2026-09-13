const CACHE = "groctrack-shell-v1";
const SHELL = ["/", "/auth", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      ),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || event.request.url.includes("/storage/v1/")) {
    return;
  }
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then((response) => response ?? caches.match("/"))),
  );
});
