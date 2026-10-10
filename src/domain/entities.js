export class DeviceStatus {

    constructor({
                    lat = null,
                    lng = null,
                    gpsFix = false,
                    obstacleCm = null,
                    fallDetected = false,
                    lastSeen = null
                } = {}) {

        this.lat = lat;
        this.lng = lng;
        this.gpsFix = gpsFix;
        this.obstacleCm = obstacleCm;
        this.fallDetected = fallDetected;
        this.lastSeen = lastSeen;

    }

    hasLocation() {

        return (
            this.gpsFix === true &&
            Number.isFinite(this.lat) &&
            Number.isFinite(this.lng)
        );

    }

}


export class DeviceHistoryPoint {

    constructor({
                    lat,
                    lng,
                    ts
                }) {

        this.lat = lat;
        this.lng = lng;
        this.ts = ts;

    }

}


export class Alert {

    constructor({
                    id,
                    type,
                    lat = null,
                    lng = null,
                    gpsFix = false,
                    createdAt = null,
                    attended = false,
                    attendedAt = null
                }) {

        this.id = id;

        this.type = type;

        this.lat = lat;

        this.lng = lng;

        this.gpsFix = gpsFix;

        this.createdAt = createdAt;

        this.attended = attended;

        this.attendedAt = attendedAt;

    }

    isLocated() {

        return (
            this.gpsFix === true &&
            Number.isFinite(this.lat) &&
            Number.isFinite(this.lng)
        );

    }

}