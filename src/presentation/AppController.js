export class AppController {

    constructor({
                    authService,
                    deviceService,
                    alertService,
                    simulatorService,
                    authRepository,
                    loginView,
                    dashboardView,
                    mapAdapter,
                    notificationService
                }) {

        this.authService = authService;
        this.deviceService = deviceService;
        this.alertService = alertService;
        this.simulatorService = simulatorService;
        this.authRepository = authRepository;
        this.loginView = loginView;
        this.dashboardView = dashboardView;
        this.mapAdapter = mapAdapter;
        this.notificationService = notificationService;

        this.unsubscribers = [];

        // Evita registrar los botones del simulador más de una vez
        this.simulatorBound = false;
    }


    start() {

        this.bindViews();

        this.loginView
            .bindPasswordToggle();

        this.authService
            .observeSession((user) => {

                if (user) {

                    this.showDashboard();

                } else {

                    this.showLogin();

                }

            });
    }


    bindViews() {

        this.loginView
            .bindLogin(
                async (email, password) => {

                    await this.authService
                        .login(
                            email,
                            password
                        );

                }
            );


        this.dashboardView
            .bindLogout(
                async () => {

                    await this.authService
                        .logout();

                }
            );


        this.dashboardView
            .bindCenterMap(
                () => {

                    this.mapAdapter
                        .centerOnLastLocation();

                }
            );
    }


    async showDashboard() {

        this.loginView.hide();

        this.dashboardView.show();


        this.mapAdapter.initialize();


        setTimeout(
            () => {

                this.mapAdapter
                    .invalidateSize();

            },
            100
        );


        await this.notificationService
            .requestPermission();


        this.startSubscriptions();


        const simulatorEnabled =
            new URLSearchParams(
                window.location.search
            ).get("sim") === "1";


        if (simulatorEnabled) {

            this.dashboardView
                .showSimulator();


            // Solo conectar los botones una vez
            if (!this.simulatorBound) {

                this.bindSimulator();

                this.simulatorBound = true;

            }

        }

    }


    showLogin() {

        this.stopSubscriptions();

        this.dashboardView.hide();

        this.loginView.show();

    }


    startSubscriptions() {

        this.stopSubscriptions();


        const statusUnsubscribe =
            this.deviceService
                .subscribeToStatus(

                    (status) => {

                        const online =
                            this.deviceService
                                .isOnline(
                                    status
                                );


                        this.dashboardView
                            .updateStatus(
                                status,
                                online
                            );


                        if (
                            status &&
                            status.hasLocation()
                        ) {

                            this.mapAdapter
                                .updateLocation(
                                    status.lat,
                                    status.lng
                                );

                        }

                    },

                    (error) => {

                        console.error(
                            "Error de estado:",
                            error
                        );

                    }

                );


        const historyUnsubscribe =
            this.deviceService
                .subscribeToHistory(

                    (points) => {

                        this.mapAdapter
                            .updateTrajectory(
                                points
                            );

                    },

                    (error) => {

                        console.error(
                            "Error de historial:",
                            error
                        );

                    }

                );


        const alertsUnsubscribe =
            this.alertService
                .subscribeToAlerts(

                    (alerts) => {

                        this.dashboardView
                            .renderAlerts(
                                alerts,

                                (id) =>
                                    this.alertService
                                        .markAsAttended(
                                            id
                                        )

                            );

                    },

                    (error) => {

                        console.error(
                            "Error de alertas:",
                            error
                        );

                    }

                );


        this.unsubscribers = [

            statusUnsubscribe,

            historyUnsubscribe,

            alertsUnsubscribe

        ];

    }


    stopSubscriptions() {

        for (
            const unsubscribe
            of this.unsubscribers
            ) {

            if (
                typeof unsubscribe ===
                "function"
            ) {

                unsubscribe();

            }

        }


        this.unsubscribers = [];

    }


    bindSimulator() {

        this.dashboardView
            .bindSimulator({

                normal:
                    async () => {

                        await this.runSimulator(
                            () =>
                                this.simulatorService
                                    .simulateNormal()
                        );

                    },


                obstacle:
                    async () => {

                        await this.runSimulator(
                            () =>
                                this.simulatorService
                                    .simulateObstacle()
                        );

                    },


                fall:
                    async () => {

                        await this.runSimulator(
                            () =>
                                this.simulatorService
                                    .simulateFall()
                        );

                    },


                sos:
                    async () => {

                        await this.runSimulator(
                            () =>
                                this.simulatorService
                                    .simulateSos()
                        );

                    },


                gps:
                    async () => {

                        await this.runSimulator(
                            () =>
                                this.simulatorService
                                    .simulateGpsWithoutSignal()
                        );

                    }

            });

    }


    async runSimulator(operation) {

        try {

            await operation();

        } catch (error) {

            console.error(error);

            alert(
                `No se pudo ejecutar el simulador: ${error.message}`
            );

        }

    }

}