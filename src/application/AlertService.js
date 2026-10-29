
import { Alert } from "../domain/entities.js";
import { ALERT_TYPES } from "../domain/constants.js";

/*
 * ==========================================
 * SMARTCANE - SERVICIO DE ALERTAS
 * ==========================================
 *
 * Compatible con el firmware ESP32 actual:
 *
 * - SOS: Necesito ayuda
 * - ALERTA: Posible caida detectada
 *
 * Funciones:
 * 1. Consultar alertas de Firebase.
 * 2. Registrar emergencias SOS y caídas.
 * 3. Marcar alertas como atendidas.
 * 4. Notificar únicamente al cuidador.
 * 5. Evitar notificar alertas atendidas.
 * 6. Registrar emergencias sin señal GPS.
 *
 * IMPORTANTE:
 * El envío de Telegram permanece a cargo
 * del AppController y TelegramService.
 */

export class AlertService {

    constructor(
        deviceRepository,
        notificationService,
        soundService
    ) {

        this.deviceRepository = deviceRepository;

        this.notificationService = notificationService;

        this.soundService = soundService;

        // Solo el cuidador recibe notificaciones.
        this.notificationsEnabled = false;
    }

    /*
     * ==========================================
     * CONFIGURAR NOTIFICACIONES
     * ==========================================
     */

    setNotificationsEnabled(enabled) {

        this.notificationsEnabled = enabled === true;

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

        return this.deviceRepository.subscribeToAlerts(

            (data) => {

                const alerts = data.map(
                    (item) => new Alert(item)
                );

                const currentIds = new Set(
                    alerts.map((alert) => alert.id)
                );

                /*
                 * Evitar notificar todas las alertas
                 * antiguas al iniciar la sesión.
                 */
                if (initialized) {

                    for (const alert of alerts) {

                        const isNew =
                            !previousIds.has(alert.id);

                        const isPending =
                            alert.attended !== true;

                        if (
                            isNew &&
                            isPending &&
                            this.notificationsEnabled
                        ) {

                            this.notifyNewAlert(alert);
                        }
                    }
                }

                previousIds = currentIds;
                initialized = true;

                // Actualizar panel del bastón/cuidador.
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
            !/^[A-Za-z0-9_-]{10,100}$/.test(alertId)
        ) {

            throw new Error(
                "La alerta no tiene un identificador válido."
            );
        }

        // Firebase determina quién tiene permiso.
        await this.deviceRepository
            .markAlertAsAttended(alertId);
    }

    /*
     * ==========================================
     * CREAR ALERTA SOS O CAÍDA
     * ==========================================
     */

    async createAlert(type, location) {

        const validType =
            type === ALERT_TYPES.FALL ||
            type === ALERT_TYPES.SOS;

        if (!validType) {

            throw new Error(
                "Tipo de alerta no válido."
            );
        }

        /*
         * Si no existe una ubicación GPS válida,
         * guardar gpsFix=false.
         *
         * Se mantienen lat/lng numéricos para
         * respetar las reglas actuales de Firebase.
         */
        const hasValidGPS = Boolean(
            location &&
            location.gpsFix === true &&
            Number.isFinite(location.lat) &&
            Number.isFinite(location.lng) &&
            location.lat >= -90 &&
            location.lat <= 90 &&
            location.lng >= -180 &&
            location.lng <= 180
        );

        const alertData = {
            type,

            lat: hasValidGPS
                ? location.lat
                : 0,

            lng: hasValidGPS
                ? location.lng
                : 0,

            gpsFix: hasValidGPS
        };

        /*
         * No incluir aquí createdAt ni attended.
         * FirebaseDeviceRepository se encarga
         * de agregar esos campos.
         */
        return this.deviceRepository.createAlert(
            alertData
        );
    }

    /*
     * ==========================================
     * NOTIFICAR NUEVA EMERGENCIA
     * ==========================================
     *
     * Solo para la cuenta del cuidador.
     */

    notifyNewAlert(alert) {

        if (!this.notificationsEnabled) {
            return;
        }

        if (!alert || alert.attended === true) {
            return;
        }

        const isFall =
            alert.type === ALERT_TYPES.FALL;

        const title = isFall
            ? "⚠️ Posible caída detectada"
            : "🚨 Alerta SOS";

        const body = alert.isLocated()
            ? isFall
                ? "El bastón detectó una posible caída. Se dispone de ubicación GPS."
                : "Se activó el botón SOS. Se dispone de ubicación GPS."
            : "Se recibió una emergencia, pero no hay ubicación GPS disponible.";

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
