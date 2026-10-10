export class LeafletMapAdapter {

    constructor(containerId) {

        this.containerId =
            containerId;

        this.map = null;

        this.marker = null;

        this.polyline = null;

        this.lastLocation = null;

    }


    initialize() {

        if (this.map) {
            return;
        }

        this.map =
            L.map(this.containerId);

        L.tileLayer(
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                maxZoom: 19,

                attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
            }
        ).addTo(this.map);


        this.map.setView(
            [14.6349, -90.5069],
            6
        );


        this.polyline =
            L.polyline(
                [],
                {
                    weight: 5
                }
            ).addTo(this.map);

    }


    updateLocation(
        lat,
        lng,
        centerAutomatically = true
    ) {

        if (!this.map) {
            this.initialize();
        }

        if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lng)
        ) {

            return;

        }


        const position =
            [lat, lng];

        this.lastLocation =
            position;


        if (!this.marker) {

            this.marker =
                L.marker(position)
                    .addTo(this.map)
                    .bindPopup(
                        "Bastón Inteligente"
                    );

        } else {

            this.marker
                .setLatLng(position);

        }


        if (centerAutomatically) {

            this.map
                .setView(
                    position,
                    17,
                    {
                        animate: true
                    }
                );

        }

    }


    updateTrajectory(points) {

        if (!this.map) {
            this.initialize();
        }

        const coordinates =
            points
                .filter(
                    (point) =>
                        Number.isFinite(point.lat) &&
                        Number.isFinite(point.lng)
                )
                .map(
                    (point) =>
                        [
                            point.lat,
                            point.lng
                        ]
                );

        this.polyline
            .setLatLngs(
                coordinates
            );

    }


    centerOnLastLocation() {

        if (
            !this.map ||
            !this.lastLocation
        ) {

            return;

        }

        this.map
            .setView(
                this.lastLocation,
                17,
                {
                    animate: true
                }
            );

    }


    invalidateSize() {

        if (this.map) {
            this.map.invalidateSize();
        }

    }

}