
/*
 * ==========================================
 * SMARTCANE - PHONE LOCATION SERVICE
 * ==========================================
 *
 * Obtiene la ubicación del teléfono Android
 * mediante la API Geolocation.
 *
 * Compatible con AppController.js.
 *
 * El GPS del teléfono proporciona la ubicación;
 * no es una medición del ESP32.
 */

export class PhoneLocationService {

    constructor() {

        this.watchId = null;

        this.onLocation = null;
        this.onError = null;

        this.lastLocation = null;
        this.lastLocationAt = 0;

        this.handlePosition =
            this.handlePosition.bind(this);

        this.handleError =
            this.handleError.bind(this);
    }

    /*
     * ==========================================
     * INICIAR MONITOREO GPS
     * ==========================================
     */

    start(onLocation, onError) {

        this.onLocation = onLocation;
        this.onError = onError;

        if (!("geolocation" in navigator)) {

            this.onError?.(
                "Este navegador no admite geolocalización."
            );

            return;
        }

        if (!window.isSecureContext) {

            this.onError?.(
                "El GPS necesita una conexión HTTPS."
            );

            return;
        }

        if (this.watchId !== null) {
            return;
        }

        this.watchId =
            navigator.geolocation.watchPosition(

                this.handlePosition,

                this.handleError,

                {
                    enableHighAccuracy: true,
                    maximumAge: 3000,
                    timeout: 20000
                }
            );

        console.log(
            "Monitoreo GPS del teléfono iniciado."
        );
    }

    /*
     * ==========================================
     * PROCESAR POSICIÓN GPS
     * ==========================================
     */

    handlePosition(position) {

        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        const valid = Boolean(
            Number.isFinite(lat) &&
            Number.isFinite(lng) &&
            lat >= -90 &&
            lat <= 90 &&
            lng >= -180 &&
            lng <= 180
        );

        if (!valid) {

            this.onError?.(
                "El teléfono proporcionó coordenadas inválidas."
            );

            return;
        }

        const accuracy =
            Number.isFinite(position.coords.accuracy)
                ? Math.max(0, position.coords.accuracy)
                : 0;

        const location = {

            lat,

            lng,

            accuracy,

            gpsFix: true,

            timestamp:
                position.timestamp || Date.now()
        };

        this.lastLocation = location;

        this.lastLocationAt = Date.now();

        console.log(
            "Ubicación GPS recibida:",
            location
        );

        this.onLocation?.(location);
    }

    /*
     * ==========================================
     * MANEJAR ERRORES GPS
     * ==========================================
     */

    handleError(error) {

        const messages = {

            1: "Permiso de ubicación denegado.",

            2: "No se pudo obtener la ubicación.",

            3: "Se agotó el tiempo de espera del GPS."
        };

        const message =
            messages[error.code] ||
            "Error de ubicación.";

        console.error(
            "Error de geolocalización:",
            message
        );

        this.onError?.(message);
    }

    /*
     * ==========================================
     * DETENER MONITOREO GPS
     * ==========================================
     */

    stop() {

        if (this.watchId !== null) {

            navigator.geolocation.clearWatch(
                this.watchId
            );

            this.watchId = null;
        }

        this.onLocation = null;
        this.onError = null;

        console.log(
            "Monitoreo GPS del teléfono detenido."
        );
    }
}
