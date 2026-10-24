
/*
 * ========================================
 * BASTÓN INTELIGENTE MEJORADO
 * SERVICE WORKER
 * ========================================
 *
 * Funciones:
 * 1. Caché de archivos de la aplicación.
 * 2. Funcionamiento PWA.
 * 3. Apertura del panel al tocar notificaciones.
 *
 * Pendiente:
 * Recepción de notificaciones push con
 * la aplicación cerrada.
 */

// Versión nueva para actualizar la caché.
const CACHE_NAME = "baston-inteligente-v2";

// Archivos principales de la aplicación.
const APP_SHELL = [
    "./",
    "./index.html",
    "./manifest.json",
    "./favicon.svg",
    "./css/styles.css"
];


/*
 * ========================================
 * INSTALACIÓN
 * ========================================
 */
self.addEventListener("install", (event) => {

    event.waitUntil(

        caches.open(CACHE_NAME)

            .then((cache) => {

                return cache.addAll(APP_SHELL);

            })

            .then(() => {

                console.log(
                    "Service Worker instalado."
                );

                return self.skipWaiting();

            })

    );
});


/*
 * ========================================
 * ACTIVACIÓN
 * ========================================
 */
self.addEventListener("activate", (event) => {

    event.waitUntil(

        caches.keys()

            .then((keys) => {

                return Promise.all(

                    keys
                        .filter(
                            (key) => key !== CACHE_NAME
                        )
                        .map(
                            (key) => caches.delete(key)
                        )

                );

            })

            .then(() => {

                console.log(
                    "Service Worker actualizado."
                );

                return self.clients.claim();

            })

    );
});


/*
 * ========================================
 * INTERCEPTAR PETICIONES
 * ========================================
 *
 * Primero consulta Internet.
 * Si falla, busca el archivo en caché.
 */
self.addEventListener("fetch", (event) => {

    if (event.request.method !== "GET") {
        return;
    }

    const requestUrl =
        new URL(event.request.url);

    // No almacenar recursos de otros dominios.
    if (
        requestUrl.origin !== self.location.origin
    ) {
        return;
    }

    // Evitar interceptar rangos de archivos.
    if (event.request.headers.has("range")) {
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

                    const responseClone =
                        networkResponse.clone();

                    // Guardar copia sin bloquear respuesta.
                    event.waitUntil(
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                return cache.put(
                                    event.request,
                                    responseClone
                                );
                            })
                            .catch((error) => {
                                console.warn(
                                    "No se pudo actualizar caché:",
                                    error
                                );
                            })
                    );
                }

                return networkResponse;

            })

            .catch(async () => {

                const cachedResponse =
                    await caches.match(event.request);

                if (cachedResponse) {
                    return cachedResponse;
                }

                /*
                 * Mostrar la página principal
                 * solamente en navegaciones HTML.
                 */
                if (event.request.mode === "navigate") {

                    const fallback =
                        await caches.match("./index.html");

                    if (fallback) {
                        return fallback;
                    }
                }

                return Response.error();

            })

    );
});


/*
 * ========================================
 * AL TOCAR UNA NOTIFICACIÓN
 * ========================================
 *
 * Si el usuario pulsa una notificación
 * de SOS o caída:
 *
 * 1. Cierra la notificación.
 * 2. Busca una ventana abierta del proyecto.
 * 3. Si existe, la enfoca.
 * 4. Si no existe, abre el dashboard.
 */
self.addEventListener(
    "notificationclick",
    (event) => {

        event.notification.close();

        /*
         * URL principal del proyecto.
         * Mantiene la subcarpeta de GitHub Pages.
         */
        const appUrl = new URL(
            "./",
            self.registration.scope
        );

        /*
         * Si existe una URL en la notificación,
         * comprobar que pertenece al proyecto.
         */
        let targetUrl = appUrl.href;

        const requestedUrl =
            event.notification.data?.url;

        if (requestedUrl) {

            try {

                const parsedUrl =
                    new URL(requestedUrl, appUrl);

                if (
                    parsedUrl.origin === appUrl.origin &&
                    parsedUrl.pathname.startsWith(
                        appUrl.pathname
                    )
                ) {

                    targetUrl = parsedUrl.href;
                }

            } catch (error) {

                console.warn(
                    "URL de notificación inválida:",
                    error
                );
            }
        }

        event.waitUntil(

            self.clients.matchAll({
                type: "window",
                includeUncontrolled: true
            })

                .then(async (clientsList) => {

                    /*
                     * Buscar una ventana del proyecto.
                     */
                    for (const client of clientsList) {

                        const clientUrl =
                            new URL(client.url);

                        if (
                            clientUrl.origin === appUrl.origin &&
                            clientUrl.pathname.startsWith(
                                appUrl.pathname
                            )
                        ) {

                            return client.focus();
                        }
                    }

                    /*
                     * Abrir aplicación si no existe
                     * una ventana disponible.
                     */
                    return self.clients.openWindow(
                        targetUrl
                    );

                })

        );
    }
);
