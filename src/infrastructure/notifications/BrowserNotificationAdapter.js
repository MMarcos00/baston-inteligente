
export class BrowserNotificationAdapter {

    constructor() {

        this.serviceWorkerRegistration = null;

        this.icon =
            "./assets/icons/icon-192.svg";

        this.badge =
            "./assets/icons/icon-192.svg";
    }


    /*
     * ========================================
     * COMPROBAR COMPATIBILIDAD
     * ========================================
     */
    isSupported() {

        return (
            "Notification" in window &&
            window.isSecureContext
        );
    }


    /*
     * ========================================
     * SOLICITAR PERMISOS
     * ========================================
     *
     * Si el permiso ya fue concedido,
     * no necesita solicitarlo nuevamente.
     *
     * Si aún no se ha concedido, debe
     * solicitarse desde un botón pulsado
     * por el usuario.
     */
    async requestPermission() {

        if (!this.isSupported()) {

            console.warn(
                "Las notificaciones no son compatibles."
            );

            return "unsupported";
        }

        if (Notification.permission === "granted") {

            return "granted";
        }

        if (Notification.permission === "denied") {

            console.warn(
                "El usuario bloqueó las notificaciones."
            );

            return "denied";
        }

        try {

            return await Notification.requestPermission();

        } catch (error) {

            console.error(
                "Error solicitando permisos:",
                error
            );

            return "error";
        }
    }


    /*
     * ========================================
     * OBTENER SERVICE WORKER
     * ========================================
     */
    async getServiceWorker() {

        if (!("serviceWorker" in navigator)) {

            return null;
        }

        try {

            /*
             * Buscar primero el Service Worker
             * ya registrado por la aplicación.
             */
            const registration =
                await navigator.serviceWorker
                    .getRegistration("./");

            if (registration?.active) {

                this.serviceWorkerRegistration =
                    registration;

                return registration;
            }

            /*
             * Si todavía no existe, registrar
             * el sw.js del proyecto.
             */
            const newRegistration =
                await navigator.serviceWorker.register(
                    "./sw.js",
                    {
                        scope: "./"
                    }
                );

            this.serviceWorkerRegistration =
                newRegistration;

            /*
             * Esperar a que esté activado.
             */
            if (newRegistration.active) {

                return newRegistration;
            }

            return await navigator.serviceWorker.ready;

        } catch (error) {

            console.error(
                "Error preparando Service Worker:",
                error
            );

            return null;
        }
    }


    /*
     * ========================================
     * MOSTRAR NOTIFICACIÓN
     * ========================================
     *
     * Se ejecuta cuando AlertService
     * detecta una nueva alerta.
     */
    async notify(title, body) {

        if (!this.isSupported()) {

            console.warn(
                "Notificaciones no soportadas."
            );

            return false;
        }

        if (Notification.permission !== "granted") {

            console.warn(
                "No hay permiso para mostrar notificaciones."
            );

            return false;
        }

        const options = {

            body: body,

            icon: this.icon,

            badge: this.badge,

            tag: "smartcane-alert-" + Date.now(),

            requireInteraction: true,

            data: {
                url: new URL(
                    "./",
                    window.location.href
                ).href
            }
        };

        try {

            /*
             * Método compatible con Android:
             * ServiceWorkerRegistration.showNotification().
             */
            const registration =
                await this.getServiceWorker();

            if (registration?.active) {

                await registration.showNotification(
                    title,
                    options
                );

                console.log(
                    "Notificación mostrada:",
                    title
                );

                return true;
            }

            /*
             * Alternativa para computadoras.
             * No funciona en la mayoría
             * de navegadores móviles.
             */
            new Notification(
                title,
                options
            );

            return true;

        } catch (error) {

            console.error(
                "No se pudo mostrar la notificación:",
                error
            );

            return false;
        }
    }
}
