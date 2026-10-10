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


    subscribeToStatus(callback, onError) {

        const statusRef =
            ref(
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


    async getStatus() {

        const statusRef =
            ref(
                this.database,
                `${this.devicePath}/status`
            );

        const snapshot =
            await get(statusRef);

        return snapshot.exists()
            ? snapshot.val()
            : null;

    }


    async writeStatus(status) {

        const statusRef =
            ref(
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


    async writeHistory(point) {

        const historyRef =
            ref(
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


    async createAlert(alert) {

        const alertsRef =
            ref(
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


    async markAlertAsAttended(alertId) {

        const alertRef =
            ref(
                this.database,
                `${this.devicePath}/alerts/${alertId}`
            );

        await update(
            alertRef,
            {
                attended: true,
                attendedAt: serverTimestamp()
            }
        );

    }

}