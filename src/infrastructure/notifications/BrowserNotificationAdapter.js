export class BrowserNotificationAdapter {

    async requestPermission() {

        if (
            !("Notification" in window)
        ) {

            return "unsupported";

        }

        if (
            Notification.permission ===
            "granted"
        ) {

            return "granted";

        }

        if (
            Notification.permission ===
            "denied"
        ) {

            return "denied";

        }

        return Notification
            .requestPermission();

    }


    notify(title, body) {

        if (
            !("Notification" in window)
        ) {

            return;

        }

        if (
            Notification.permission !==
            "granted"
        ) {

            return;

        }

        try {

            new Notification(
                title,
                {
                    body,
                    icon:
                        "./assets/icons/icon-192.svg",
                    badge:
                        "./assets/icons/icon-192.svg"
                }
            );

        } catch (error) {

            console.warn(
                "No se pudo mostrar la notificación:",
                error
            );

        }

    }

}