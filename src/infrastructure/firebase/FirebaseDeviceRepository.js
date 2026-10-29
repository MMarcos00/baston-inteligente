
import {
    ref,
    query,
    orderByChild,
    limitToLast,
    onValue,
    get,
    set,
    push,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

import {
    DEVICE_ID,
    MAX_HISTORY_POINTS,
    MAX_ALERTS
} from "../../domain/constants.js";

/*
 * ==========================================
 * SMARTCANE - FIREBASE DEVICE REPOSITORY
 * ==========================================
 *
 * Compatible con:
 *
 * - ESP32 Bluetooth BLE.
 * - Botón físico SOS.
 * - Detección de posibles caídas MPU6050.
 * - GPS del teléfono Android.
 * - Panel web del cuidador.
 * - Telegram mediante Cloudflare Worker.
 *
 * Rutas:
 *
 * devices/{DEVICE_ID}/status
 * devices/{DEVICE_ID}/history
 * devices/{DEVICE_ID}/alerts
 * devices/{DEVICE_ID}/phoneLocation/current
 * devices/{DEVICE_ID}/phoneLocation/history
 *
 * IMPORTANTE:
 *
 * No se modifican los mensajes del ESP32.
 * Las caídas y los SOS llegan a través
 * de AppController y AlertService.
 */

export class FirebaseDeviceRepository {

    constructor(database) {

        if (!database) {
            throw new Error(
                "FirebaseDeviceRepository necesita una instancia de Firebase Database."
            );
        }

        this.database = database;

        this.devicePath =
            `devices/${DEVICE_ID}`;
    }

    /*
     * ==========================================
     * VALIDAR UBICACIÓN GPS
     * ==========================================
     */

    isValidLocation(location) {

        return Boolean(
            location &&
            location.gpsFix === true &&
            Number.isFinite(location.lat) &&
            Number.isFinite(location.lng) &&
            location.lat >= -90 &&
            location.lat <= 90 &&
            location.lng >= -180 &&
            location.lng <= 180
        );
    }

    /*
     * ==========================================
     * ESCUCHAR ESTADO DEL BASTÓN
     * ==========================================
     */

    subscribeToStatus(callback, onError) {

        const statusRef = ref(
            this.database,
            `${this.devicePath}/status`
        );

        return onValue(
            statusRef,

            (snapshot) => {

                callback(
                    snapshot.exists()
                        ? snapshot.val()
                        : null
                );
            },

            onError
        );
    }

    /*
     * ==========================================
     * ESCUCHAR HISTORIAL DE UBICACIONES
     * ==========================================
     */

    subscribeToHistory(callback, onError) {

        const historyRef = query(
            ref(
                this.database,
                `${this.devicePath}/history`
            ),

            orderByChild("ts"),

            limitToLast(MAX_HISTORY_POINTS)
        );

        return onValue(
            historyRef,

            (snapshot) => {

                const points = [];

                snapshot.forEach((child) => {

                    points.push({
                        id: child.key,
                        ...child.val()
                    });
                });

                callback(points);
            },

            onError
        );
    }

    /*
     * ==========================================
     * ESCUCHAR ALERTAS SOS Y CAÍDAS
     * ==========================================
     */

    subscribeToAlerts(callback, onError) {

        const alertsRef = query(
            ref(
                this.database,
                `${this.devicePath}/alerts`
            ),

            orderByChild("createdAt"),

            limitToLast(MAX_ALERTS)
        );

        return onValue(
            alertsRef,

            (snapshot) => {

                const alerts = [];

                snapshot.forEach((child) => {

                    alerts.push({
                        id: child.key,
                        ...child.val()
                    });
                });

                // Mostrar primero las alertas recientes.
                alerts.sort(
                    (a, b) =>
                        Number(b.createdAt ?? 0) -
                        Number(a.createdAt ?? 0)
                );

                callback(alerts);
            },

            onError
        );
    }

    /*
     * ==========================================
     * OBTENER ESTADO ACTUAL
     * ==========================================
     */

    async getStatus() {

        const statusRef = ref(
            this.database,
            `${this.devicePath}/status`
        );

        const snapshot = await get(statusRef);

        return snapshot.exists()
            ? snapshot.val()
            : null;
    }

    /*
     * ==========================================
     * ACTUALIZAR ESTADO DEL BASTÓN
     * ==========================================
     *
     * Se conserva la estructura original
     * utilizada por Firebase y el simulador.
     */

    async writeStatus(status) {

        if (!status || typeof status !== "object") {

            throw new Error(
                "El estado del bastón no es válido."
            );
        }

        const statusRef = ref(
            this.database,
            `${this.devicePath}/status`
        );

        await set(statusRef, {

            lat: status.lat,

            lng: status.lng,

            gpsFix: status.gpsFix,

            obstacleCm: status.obstacleCm,

            fallDetected: status.fallDetected,

            lastSeen: serverTimestamp()
        });
    }

    /*
     * ==========================================
     * GUARDAR HISTORIAL DEL BASTÓN
     * ==========================================
     */

    async writeHistory(point) {

        if (
            !point ||
            !Number.isFinite(point.lat) ||
            !Number.isFinite(point.lng) ||
            point.lat < -90 ||
            point.lat > 90 ||
            point.lng < -180 ||
            point.lng > 180
        ) {

            throw new Error(
                "Coordenadas de historial inválidas."
            );
        }

        const historyRef = ref(
            this.database,
            `${this.devicePath}/history`
        );

        const newPointRef = push(historyRef);

        await set(newPointRef, {

            lat: point.lat,

            lng: point.lng,

            ts: serverTimestamp()
        });

        return newPointRef.key;
    }

    /*
     * ==========================================
     * CREAR ALERTA SOS O POSIBLE CAÍDA
     * ==========================================
     *
     * Mensajes del ESP32:
     *
     * SOS: Necesito ayuda
     *   -> type: "sos"
     *
     * ALERTA: Posible caida detectada
     *   -> type: "fall"
     *
     * La identificación del mensaje se realiza
     * en AppController.js.
     */

    async createAlert(alert) {

        if (
            !alert ||
            !["sos", "fall"].includes(alert.type)
        ) {

            throw new Error(
                "Tipo de alerta inválido."
            );
        }

        /*
         * Una emergencia no debe descartarse
         * únicamente porque no haya GPS.
         */

        const hasGPS = this.isValidLocation(alert);

        const alertData = {

            type: alert.type,

            lat: hasGPS
                ? alert.lat
                : 0,

            lng: hasGPS
                ? alert.lng
                : 0,

            gpsFix: hasGPS,

            createdAt: serverTimestamp(),

            attended: false
        };

        /*
         * No agregamos attendedAt hasta que
         * el cuidador atienda la emergencia.
         *
         * Esto mantiene la compatibilidad
         * con las reglas de Firebase que
         * permiten crearlo posteriormente.
         */

        const alertsRef = ref(
            this.database,
            `${this.devicePath}/alerts`
        );

        const newAlertRef = push(alertsRef);

        await set(
            newAlertRef,
            alertData
        );

        console.log(
            "Alerta creada en Firebase:",
            alert.type,
            newAlertRef.key
        );

        return newAlertRef.key;
    }

    /*
     * ==========================================
     * MARCAR ALERTA COMO ATENDIDA
     * ==========================================
     *
     * Solo modificamos:
     *
     * - attendedAt
     * - attended
     *
     * La autorización depende de las
     * reglas de Firebase Realtime Database.
     */

    async markAlertAsAttended(alertId) {

        if (
            typeof alertId !== "string" ||
            !/^[A-Za-z0-9_-]{10,100}$/.test(alertId)
        ) {

            throw new Error(
                "ID de alerta inválido."
            );
        }

        const alertRef = ref(
            this.database,
            `${this.devicePath}/alerts/${alertId}`
        );

        const snapshot = await get(alertRef);

        if (!snapshot.exists()) {

            throw new Error(
                "La alerta no existe."
            );
        }

        const alertData = snapshot.val();

        if (alertData.attended === true) {

            console.log(
                "La alerta ya estaba atendida:",
                alertId
            );

            return;
        }

        /*
         * Primero registrar la hora.
         *
         * Se mantienen las operaciones
         * separadas para respetar las
         * reglas actuales por campo.
         */

        const attendedAtRef = ref(
            this.database,
            `${this.devicePath}/alerts/${alertId}/attendedAt`
        );

        await set(
            attendedAtRef,
            serverTimestamp()
        );

        /*
         * Después marcar como atendida.
         */

        const attendedRef = ref(
            this.database,
            `${this.devicePath}/alerts/${alertId}/attended`
        );

        await set(
            attendedRef,
            true
        );

        console.log(
            "Alerta marcada como atendida:",
            alertId
        );
    }

    /*
     * ==========================================
     * GUARDAR GPS ACTUAL DEL TELÉFONO
     * ==========================================
     */

    async writePhoneLocation(location) {

        if (!this.isValidLocation(location)) {

            throw new Error(
                "No se puede guardar una ubicación GPS inválida."
            );
        }

        const locationRef = ref(
            this.database,
            `${this.devicePath}/phoneLocation/current`
        );

        /*
         * La precisión es opcional.
         * Nunca enviamos undefined a Firebase.
         */

        const locationData = {

            lat: location.lat,

            lng: location.lng,

            gpsFix: true,

            updatedAt: serverTimestamp()
        };

        if (
            Number.isFinite(location.accuracy) &&
            location.accuracy >= 0
        ) {

            locationData.accuracy =
                location.accuracy;
        }

        await set(
            locationRef,
            locationData
        );
    }

    /*
     * ==========================================
     * GUARDAR HISTORIAL GPS DEL TELÉFONO
     * ==========================================
     */

    async writePhoneLocationHistory(location) {

        if (!this.isValidLocation(location)) {

            throw new Error(
                "No se puede guardar un historial GPS inválido."
            );
        }

        const historyRef = ref(
            this.database,
            `${this.devicePath}/phoneLocation/history`
        );

        const newRecord = push(historyRef);

        const historyData = {

            lat: location.lat,

            lng: location.lng,

            ts: serverTimestamp()
        };

        if (
            Number.isFinite(location.accuracy) &&
            location.accuracy >= 0
        ) {

            historyData.accuracy =
                location.accuracy;
        }

        await set(
            newRecord,
            historyData
        );

        return newRecord.key;
    }

    /*
     * ==========================================
     * ESCUCHAR GPS DEL TELÉFONO
     * ==========================================
     */

    subscribeToPhoneLocation(callback, onError) {

        const locationRef = ref(
            this.database,
            `${this.devicePath}/phoneLocation/current`
        );

        return onValue(
            locationRef,

            (snapshot) => {

                callback(
                    snapshot.exists()
                        ? snapshot.val()
                        : null
                );
            },

            onError
        );
    }
}
