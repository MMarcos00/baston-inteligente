
import {
    DeviceStatus,
    DeviceHistoryPoint
} from "../domain/entities.js";

import {
    DEVICE_ONLINE_THRESHOLD_MS
} from "../domain/constants.js";

/*
 * ==========================================
 * SMARTCANE - DEVICE SERVICE
 * ==========================================
 *
 * Servicio de aplicación para administrar
 * información del bastón inteligente.
 *
 * Compatible con:
 *
 * - ESP32 mediante Bluetooth BLE.
 * - Sensor ultrasónico.
 * - MPU6050 (alertas de posibles caídas).
 * - GPS del teléfono Android.
 * - Firebase Realtime Database.
 *
 * IMPORTANTE:
 *
 * El firmware actual no transmite datos
 * numéricos del MPU6050 por Bluetooth.
 *
 * Las posibles caídas se registran mediante
 * AppController y AlertService.
 *
 * No se modifica el código del ESP32.
 */

export class DeviceService {

    constructor(deviceRepository) {

        if (!deviceRepository) {
            throw new Error(
                "DeviceService necesita un repositorio."
            );
        }

        this.deviceRepository = deviceRepository;
    }

    /*
     * ==========================================
     * ESCUCHAR ESTADO DEL BASTÓN
     * ==========================================
     */

    subscribeToStatus(callback, onError) {

        return this.deviceRepository.subscribeToStatus(

            (data) => {

                const status = new DeviceStatus(
                    data ?? {}
                );

                callback(status);
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

        return this.deviceRepository.subscribeToHistory(

            (points) => {

                const records = Array.isArray(points)
                    ? points
                    : [];

                const history = records.map(
                    (point) =>
                        new DeviceHistoryPoint(point)
                );

                callback(history);
            },

            onError
        );
    }

    /*
     * ==========================================
     * ESCUCHAR GPS DEL TELÉFONO
     * ==========================================
     */

    subscribeToPhoneLocation(callback, onError) {

        return this.deviceRepository.subscribeToPhoneLocation(
            callback,
            onError
        );
    }

    /*
     * ==========================================
     * GUARDAR GPS DEL TELÉFONO
     * ==========================================
     */

    async writePhoneLocation(location) {

        if (!this.isValidLocation(location)) {

            throw new Error(
                "No se puede guardar una ubicación GPS inválida."
            );
        }

        return this.deviceRepository.writePhoneLocation(
            location
        );
    }

    /*
     * ==========================================
     * GUARDAR HISTORIAL GPS
     * ==========================================
     */

    async writePhoneLocationHistory(location) {

        if (!this.isValidLocation(location)) {

            throw new Error(
                "No se puede registrar una ubicación GPS inválida."
            );
        }

        return this.deviceRepository.writePhoneLocationHistory(
            location
        );
    }

    /*
     * ==========================================
     * VALIDAR COORDENADAS GPS
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
     * COMPROBAR ESTADO EN LÍNEA
     * ==========================================
     *
     * Este método conserva la lógica original.
     *
     * El estado depende del último registro
     * recibido en Firebase.
     *
     * La conexión Bluetooth se muestra por
     * separado en DashboardView.
     */

    isOnline(status) {

        if (!status?.lastSeen) {
            return false;
        }

        const lastSeen = Number(
            status.lastSeen
        );

        if (
            !Number.isFinite(lastSeen) ||
            lastSeen <= 0
        ) {
            return false;
        }

        const elapsed =
            Date.now() - lastSeen;

        return (
            elapsed >= 0 &&
            elapsed < DEVICE_ONLINE_THRESHOLD_MS
        );
    }

    /*
     * ==========================================
     * CONSULTAR ESTADO ACTUAL
     * ==========================================
     */

    async getStatus() {

        const data =
            await this.deviceRepository.getStatus();

        return new DeviceStatus(
            data ?? {}
        );
    }
}
