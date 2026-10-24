
import {
    Alert
} from "../domain/entities.js";

import {
    ALERT_TYPES
} from "../domain/constants.js";


/*
 * ==========================================
 * BASTÓN INTELIGENTE MEJORADO
 * SERVICIO DE ALERTAS
 * ==========================================
 *
 * Funciones:
 *
 * 1. Consultar alertas de Firebase.
 * 2. Registrar alertas SOS y caídas.
 * 3. Marcar alertas como atendidas.
 * 4. Notificar únicamente al cuidador.
 * 5. Evitar notificar alertas atendidas.
 *
 * IMPORTANTE:
 * No modifica el envío por Telegram.
 */

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

        /*
         * Seguridad:
         *
         * Las notificaciones comienzan
         * deshabilitadas.
         *
         * AppController únicamente las
         * habilitará para el cuidador.
         */
        this.notificationsEnabled = false;
    }


    /*
     * ==========================================
     * CONFIGURAR NOTIFICACIONES
     * ==========================================
     *
     * true  = cuidador
     * false = bastón o sin sesión
     */
    setNotificationsEnabled(enabled) {

        this.notificationsEnabled =
            enabled === true;

        console.log(
            "Notificaciones de emergencia:",
            this.notificationsEnabled
                ? "Habilitadas para cuidador"
                : "Deshabilitadas"
        );
    }


    /*
     * ==========================================
     * ESCUCHAR ALERTAS DE FIREBASE
     * ==========================================
     */
    subscribeToAlerts(callback, onError) {

        let initialized = false;

        let previousIds = new Set();

        return this.deviceRepository
            .subscribeToAlerts(

                (data) => {

                    /*
                     * Convertir los registros
                     * a entidades Alert.
                     */
                    const alerts = data.map(
                        (item) =>
                            new Alert(item)
                    );

                    /*
                     * Obtener identificadores
                     * de todas las alertas.
                     */
                    const currentIds = new Set(
                        alerts.map(
                            (alert) => alert.id
                        )
                    );

                    /*
                     * Evitar que al iniciar sesión
                     * se notifiquen nuevamente
                     * todas las alertas antiguas.
                     */
                    if (initialized) {

                        for (const alert of alerts) {

                            const isNew =
                                !previousIds.has(alert.id);

                            const isPending =
                                alert.attended !== true;

                            /*
                             * Notificar solamente si:
                             *
                             * - Es una alerta nueva.
                             * - No ha sido atendida.
                             * - La sesión permite
                             *   notificaciones.
                             */
                            if (
                                isNew &&
                                isPending &&
                                this.notificationsEnabled
                            ) {

                                this.notifyNewAlert(
                                    alert
                                );
                            }
                        }
                    }

                    previousIds = currentIds;

                    initialized = true;

                    /*
                     * Actualizar el panel tanto
                     * del bastón como del cuidador.
                     *
                     * Esto no genera notificaciones.
                     */
                    callback(alerts);
                },

                onError
            );
    }


    /*
     * ==========================================
     * MARCAR ALERTA COMO ATENDIDA
     * ==========================================
     */
    async markAsAttended(alertId) {

        if (
            typeof alertId !== "string" ||
            !alertId.trim()
        ) {

            throw new Error(
                "La alerta no tiene un identificador válido."
            );
        }

        /*
         * La autorización definitiva
         * también debe estar protegida
         * por las reglas de Firebase.
         */
        await this.deviceRepository
            .markAlertAsAttended(
                alertId
            );
    }


    /*
     * ==========================================
     * CREAR ALERTA
     * ==========================================
     *
     * Este método sigue funcionando
     * para el SOS físico del ESP32.
     */
    async createAlert(type, location) {

        if (
            type !== ALERT_TYPES.FALL &&
            type !== ALERT_TYPES.SOS
        ) {

            throw new Error(
                "Tipo de alerta no válido."
            );
        }

        if (!location) {

            throw new Error(
                "La alerta necesita una ubicación válida."
            );
        }

        /*
         * Conservar exactamente la
         * estructura esperada por Firebase.
         */
        return this.deviceRepository
            .createAlert({

                type,

                lat: location.lat,

                lng: location.lng,

                gpsFix: location.gpsFix
            });
    }


    /*
     * ==========================================
     * NOTIFICAR NUEVA ALERTA
     * ==========================================
     *
     * Únicamente el cuidador.
     */
    notifyNewAlert(alert) {

        /*
         * Bloqueo principal.
         *
         * El usuario bastón no emitirá
         * sonidos, vibraciones ni avisos
         * de emergencia desde este servicio.
         */
        if (!this.notificationsEnabled) {

            return;
        }

        /*
         * No notificar alertas atendidas.
         */
        if (alert.attended === true) {

            return;
        }

        const isFall =
            alert.type === ALERT_TYPES.FALL;

        const title = isFall
            ? "⚠️ Posible caída"
            : "🚨 Alerta SOS";

        const body = alert.isLocated()
            ? "Se recibió una alerta con ubicación GPS."
            : "Se recibió una alerta, pero el GPS no tiene señal.";


        /*
         * ======================================
         * NOTIFICACIÓN DEL NAVEGADOR
         * ======================================
         */
        if (
            this.notificationService &&
            typeof this.notificationService.notify ===
            "function"
        ) {

            try {

                Promise.resolve(
                    this.notificationService.notify(
                        title,
                        body
                    )
                ).catch((error) => {

                    console.error(
                        "Error mostrando notificación:",
                        error
                    );
                });

            } catch (error) {

                console.error(
                    "Error de notificación:",
                    error
                );
            }
        }


        /*
         * ======================================
         * SONIDO DE EMERGENCIA
         * ======================================
         */
        if (
            this.soundService &&
            typeof this.soundService.notify ===
            "function"
        ) {

            try {

                Promise.resolve(
                    this.soundService.notify()
                ).catch((error) => {

                    console.error(
                        "Error reproduciendo sonido:",
                        error
                    );
                });

            } catch (error) {

                console.error(
                    "Error de sonido:",
                    error
                );
            }
        }


        /*
         * ======================================
         * VIBRACIÓN DEL TELÉFONO
         * ======================================
         */
        if (
            typeof navigator !== "undefined" &&
            typeof navigator.vibrate === "function"
        ) {

            try {

                navigator.vibrate([
                    250,
                    150,
                    250,
                    150,
                    500
                ]);

            } catch (error) {

                console.error(
                    "Error de vibración:",
                    error
                );
            }
        }
    }
}
