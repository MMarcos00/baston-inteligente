import {
    Alert
} from "../domain/entities.js";

import {
    ALERT_TYPES
} from "../domain/constants.js";


export class AlertService {

    constructor(
        deviceRepository,
        notificationService,
        soundService
    ) {

        this.deviceRepository =
            deviceRepository;

        this.notificationService =
            notificationService;

        this.soundService =
            soundService;

    }


    subscribeToAlerts(callback, onError) {

        let initialized = false;

        let previousIds =
            new Set();


        return this.deviceRepository
            .subscribeToAlerts(
                (data) => {

                    const alerts =
                        data.map(
                            (item) =>
                                new Alert(item)
                        );


                    const currentIds =
                        new Set(
                            alerts.map(
                                (alert) =>
                                    alert.id
                            )
                        );


                    if (initialized) {

                        for (
                            const alert
                            of alerts
                            ) {

                            if (
                                !previousIds
                                    .has(alert.id)
                            ) {

                                this.notifyNewAlert(
                                    alert
                                );

                            }

                        }

                    }


                    previousIds =
                        currentIds;

                    initialized = true;

                    callback(alerts);

                },
                onError
            );

    }


    async markAsAttended(alertId) {

        if (!alertId) {

            throw new Error(
                "La alerta no tiene un identificador válido."
            );

        }

        await this.deviceRepository
            .markAlertAsAttended(
                alertId
            );

    }


    async createAlert(
        type,
        location
    ) {

        if (
            type !== ALERT_TYPES.FALL &&
            type !== ALERT_TYPES.SOS
        ) {

            throw new Error(
                "Tipo de alerta no válido."
            );

        }

        return this.deviceRepository
            .createAlert({
                type,
                lat: location.lat,
                lng: location.lng,
                gpsFix: location.gpsFix
            });

    }


    notifyNewAlert(alert) {

        const isFall =
            alert.type ===
            ALERT_TYPES.FALL;


        const title =
            isFall
                ? "⚠️ Posible caída"
                : "🚨 Alerta SOS";


        const body =
            alert.isLocated()
                ? "Se recibió una alerta con ubicación GPS."
                : "Se recibió una alerta, pero el GPS no tiene señal.";


        this.notificationService
            .notify(
                title,
                body
            );


        this.soundService
            .notify();


        if (
            "vibrate" in navigator
        ) {

            navigator.vibrate(
                [
                    250,
                    150,
                    250,
                    150,
                    500
                ]
            );

        }

    }

}