
/*
 * ==========================================
 * SMARTCANE - LEAFLET MAP ADAPTER
 * ==========================================
 *
 * Visualización de:
 *
 * - Ubicación GPS del teléfono.
 * - Última posición válida.
 * - Trayectoria del bastón.
 * - Centrado automático del mapa.
 *
 * Compatible con AppController.js.
 *
 * No requiere modificaciones del ESP32.
 */

export class LeafletMapAdapter {

    constructor(containerId) {

        this.containerId = containerId;

        this.map = null;

        this.marker = null;

        this.polyline = null;

        this.lastLocation = null;

        this.lastLocationAt = 0;

        this.hasCentered = false;
    }

    /*
     * ==========================================
     * INICIALIZAR MAPA
     * ==========================================
     */

    initialize() {

        if (this.map) {
            return;
        }

        this.map = L.map(this.containerId);

        L.tileLayer(
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                maxZoom: 19,

                attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
            }
        ).addTo(this.map);

        /*
         * Vista inicial de referencia.
         * No representa la posición real
         * del bastón.
         */
        this.map.setView(
            [14.6349, -90.5069],
            6
        );

        this.polyline = L.polyline(
            [],
            {
                weight: 5
            }
        ).addTo(this.map);
    }

    /*
     * ==========================================
     * VALIDAR COORDENADAS
     * ==========================================
     */

    isValidCoordinates(lat, lng) {

        return (
            Number.isFinite(lat) &&
            Number.isFinite(lng) &&
            lat >= -90 &&
            lat <= 90 &&
            lng >= -180 &&
            lng <= 180
        );
    }

    /*
     * ==========================================
     * ACTUALIZAR UBICACIÓN
     * ==========================================
     */

    updateLocation(
        lat,
        lng,
        centerAutomatically = true
    ) {

        if (!this.isValidCoordinates(lat, lng)) {

            console.warn(
                "Coordenadas inválidas para el mapa:",
                lat,
                lng
            );

            return;
        }

        if (!this.map) {
            this.initialize();
        }

        const position = [lat, lng];

        this.lastLocation = position;

        this.lastLocationAt = Date.now();

        /*
         * Crear o mover marcador.
         */

        if (!this.marker) {

            this.marker = L.marker(position)
                .addTo(this.map)
                .bindPopup(
                    "📍 Última ubicación registrada de SmartCane"
                );

        } else {

            this.marker.setLatLng(position);
        }

        /*
         * Centrar automáticamente.
         */

        if (centerAutomatically) {

            this.map.setView(
                position,
                17,
                {
                    animate: true
                }
            );

            this.hasCentered = true;
        }

        console.log(
            "Ubicación actualizada en el mapa:",
            lat,
            lng
        );
    }

    /*
     * ==========================================
     * ACTUALIZAR TRAYECTORIA
     * ==========================================
     */

    updateTrajectory(points) {

        if (!this.map) {
            this.initialize();
        }

        const records = Array.isArray(points)
            ? points
            : [];

        const coordinates = records
            .filter(
                (point) =>
                    this.isValidCoordinates(
                        point.lat,
                        point.lng
                    )
            )
            .map(
                (point) => [
                    point.lat,
                    point.lng
                ]
            );

        this.polyline.setLatLngs(
            coordinates
        );

        /*
         * El historial no se utiliza
         * para inventar una ubicación
         * GPS actual.
         */
    }

    /*
     * ==========================================
     * CENTRAR ÚLTIMA UBICACIÓN
     * ==========================================
     */

    centerOnLastLocation() {

        if (!this.map) {
            this.initialize();
        }

        if (!this.lastLocation) {

            console.warn(
                "Todavía no existe una ubicación GPS registrada para centrar el mapa."
            );

            return;
        }

        this.map.invalidateSize();

        this.map.setView(
            this.lastLocation,
            17,
            {
                animate: true
            }
        );

        if (this.marker) {
            this.marker.openPopup();
        }
    }

    /*
     * ==========================================
     * RECALCULAR TAMAÑO
     * ==========================================
     */

    invalidateSize() {

        if (this.map) {
            this.map.invalidateSize();
        }
    }
}
