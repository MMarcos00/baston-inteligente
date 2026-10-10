const CACHE_NAME = "baston-inteligente-v1";

const APP_SHELL = [
    "./",
    "./index.html",
    "./manifest.json",
    "./favicon.svg",
    "./css/styles.css"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => key !== CACHE_NAME)
                        .map((key) => caches.delete(key))
                )
            )
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {

    if (event.request.method !== "GET") {
        return;
    }

    const requestUrl = new URL(event.request.url);

    if (requestUrl.origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {

                if (
                    networkResponse &&
                    networkResponse.status === 200 &&
                    networkResponse.type === "basic"
                ) {
                    const responseClone = networkResponse.clone();

                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                }

                return networkResponse;
            })
            .catch(() => {
                return caches.match(event.request)
                    .then((cachedResponse) => {
                        return cachedResponse || caches.match("./index.html");
                    });
            })
    );
});