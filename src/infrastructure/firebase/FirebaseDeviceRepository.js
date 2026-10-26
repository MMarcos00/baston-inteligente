
import {
    ref,
    query,
    orderByChild,
    limitToLast,
    onValue,
    get,
    set,
    update,
    push,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

import {
    DEVICE_ID,
    MAX_HISTORY_POINTS,
    MAX_ALERTS
} from "../../domain/constants.js";


export class FirebaseDeviceRepository {

    constructor(database) {

        this.database = database;

        this.devicePath =
            `devices/${DEVICE_ID}`;
    }


    /*
     * ==========================================
     * ESTADO DEL BASTÓN
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
     * HISTORIAL DE UBICACIONES
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
     * ESCUCHAR ALERTAS DE FIREBASE
     * ==========================================
     *
     * Las alertas incluyen:
     *
     * - ID
     * - Tipo
     * - Coordenadas
     * - Fecha
     * - Estado de atención
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

                alerts.sort(
                    (a, b) =>
                        (b.createdAt ?? 0) -
                        (a.createdAt ?? 0)
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

        const snapshot =
            await get(statusRef);

        return snapshot.exists()
            ? snapshot.val()
            : null;
    }


    /*
     * ==========================================
     * ACTUALIZAR ESTADO DEL BASTÓN
     * ==========================================
     */
    async writeStatus(status) {

        const statusRef = ref(
            this.database,
            `${this.devicePath}/status`
        );

        await set(
            statusRef,
            {
                lat: status.lat,
                lng: status.lng,
                gpsFix: status.gpsFix,
                obstacleCm: status.obstacleCm,
                fallDetected: status.fallDetected,
                lastSeen: serverTimestamp()
            }
        );
    }


    /*
     * ==========================================
     * GUARDAR HISTORIAL DEL BASTÓN
     * ==========================================
     */
    async writeHistory(point) {

        const historyRef = ref(
            this.database,
            `${this.devicePath}/history`
        );

        const newPointRef =
            push(historyRef);

        await set(
            newPointRef,
            {
                lat: point.lat,
                lng: point.lng,
                ts: serverTimestamp()
            }
        );

        return newPointRef.key;
    }


    /*
     * ==========================================
     * CREAR ALERTA SOS O CAÍDA
     * ==========================================
     *
     * Solo la cuenta del bastón tiene
     * permisos para crear emergencias.
     *
     * Conservamos la misma estructura
     * para no afectar Telegram.
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

        const alertsRef = ref(
            this.database,
            `${this.devicePath}/alerts`
        );

        const newAlertRef =
            push(alertsRef);

        await set(
            newAlertRef,
            {
                type: alert.type,
                lat: alert.lat,
                lng: alert.lng,
                gpsFix: alert.gpsFix,
                createdAt: serverTimestamp(),
                attended: false,
                attendedAt: null
            }
        );

        return newAlertRef.key;
    }


    /*
     * ==========================================
     * MARCAR ALERTA COMO ATENDIDA
     * ==========================================
     *
     * IMPORTANTE:
     *
     * Solo modifica:
     *
     * - attended
     * - attendedAt
     *
     * No cambia:
     *
     * - type
     * - lat
     * - lng
     * - gpsFix
     * - createdAt
     *
     * Utiliza una actualización multipath
     * atómica para que Firebase compruebe
     * los permisos de las rutas afectadas.
     */

    async markAlertAsAttended(alertId) {

        if (
            typeof alertId !== "string" ||
            !/^[A-Za-z0-9_-]{10,100}$/.test(alertId)
        ) {
            throw new Error("ID de alerta inválido.");
        }

        const alertRef = ref(
            this.database,
            `${this.devicePath}/alerts/${alertId}`
        );

        const snapshot = await get(alertRef);

        if (!snapshot.exists()) {
            throw new Error("La alerta no existe.");
        }

        if (snapshot.val().attended === true) {
            return;
        }

        // Registrar primero la hora de atención.
        await set(
            ref(
                this.database,
                `${this.devicePath}/alerts/${alertId}/attendedAt`
            ),
            serverTimestamp()
        );

        // Marcar la emergencia como atendida.
        await set(
            ref(
                this.database,
                `${this.devicePath}/alerts/${alertId}/attended`
            ),
            true
        );

        console.log("Alerta atendida:", alertId);
    }



    /*
     * ==========================================
     * GPS DEL TELÉFONO
     * ==========================================
     */
    async writePhoneLocation(location) {

        const locationRef = ref(
            this.database,
            `${this.devicePath}/phoneLocation/current`
        );

        await set(
            locationRef,
            {
                lat: location.lat,
                lng: location.lng,
                accuracy: location.accuracy,
                gpsFix: location.gpsFix,
                updatedAt: serverTimestamp()
            }
        );
    }


    /*
     * ==========================================
     * HISTORIAL GPS DEL TELÉFONO
     * ==========================================
     */
    async writePhoneLocationHistory(location) {

        const historyRef = ref(
            this.database,
            `${this.devicePath}/phoneLocation/history`
        );

        const newRecord =
            push(historyRef);

        await set(
            newRecord,
            {
                lat: location.lat,
                lng: location.lng,
                accuracy: location.accuracy,
                ts: serverTimestamp()
            }
        );
    }


    /*
     * ==========================================
     * ESCUCHAR GPS DEL TELÉFONO
     * ==========================================
     */
    subscribeToPhoneLocation(
        callback,
        onError
    ) {

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
