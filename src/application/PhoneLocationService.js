
export class PhoneLocationService {
    constructor() {
        this.watchId = null;
    }

    start(onLocation, onError) {
        if (!("geolocation" in navigator)) {
            onError("Este navegador no admite geolocalización.");
            return;
        }

        if (this.watchId !== null) {
            return;
        }

        this.watchId = navigator.geolocation.watchPosition(
            (position) => {
                const location = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    gpsFix: true,
                    timestamp: position.timestamp
                };

                onLocation(location);
            },
            (error) => {
                const messages = {
                    1: "Permiso de ubicación denegado.",
                    2: "No se pudo obtener la ubicación.",
                    3: "Se agotó el tiempo de espera del GPS."
                };

                onError(messages[error.code] || "Error de ubicación.");
            },
            {
                enableHighAccuracy: true,
                maximumAge: 3000,
                timeout: 20000
            }
        );
    }

    stop() {
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
    }
}