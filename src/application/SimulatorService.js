export class SimulatorService {

    constructor(deviceRepository) {

        this.deviceRepository =
            deviceRepository;

    }


    async simulateNormal() {

        await this.deviceRepository
            .writeStatus({

                lat: 14.291,
                lng: -89.895,

                gpsFix: true,

                obstacleCm: 120,

                fallDetected: false

            });


        await this.deviceRepository
            .writeHistory({

                lat: 14.291,
                lng: -89.895

            });

    }


    async simulateObstacle() {

        await this.deviceRepository
            .writeStatus({

                lat: 14.291,
                lng: -89.895,

                gpsFix: true,

                obstacleCm: 35,

                fallDetected: false

            });

    }


    async simulateFall() {

        const location = {

            lat: 14.2915,

            lng: -89.8955,

            gpsFix: true

        };


        await this.deviceRepository
            .writeStatus({

                lat:
                location.lat,

                lng:
                location.lng,

                gpsFix:
                location.gpsFix,

                obstacleCm:
                    80,

                fallDetected:
                    true

            });


        await this.deviceRepository
            .writeHistory({

                lat:
                location.lat,

                lng:
                location.lng

            });


        await this.deviceRepository
            .createAlert({

                type: "fall",

                lat:
                location.lat,

                lng:
                location.lng,

                gpsFix:
                location.gpsFix

            });

    }


    async simulateSos() {

        const location = {

            lat: 14.292,

            lng: -89.896,

            gpsFix: true

        };


        await this.deviceRepository
            .createAlert({

                type: "sos",

                lat:
                location.lat,

                lng:
                location.lng,

                gpsFix:
                location.gpsFix

            });

    }


    async simulateGpsWithoutSignal() {

        await this.deviceRepository.writeStatus({
            lat: 14.291,
            lng: -89.895,
            gpsFix: false,
            obstacleCm: 120,
            fallDetected: false
        });

    }

}