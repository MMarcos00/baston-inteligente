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
                    notificationService,
                    phoneLocationService
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
        this.phoneLocationService = phoneLocationService;

        this.unsubscribers = [];

        this.simulatorBound = false;

        // Control de ubicación del teléfono.
        this.phoneLocationReceived = false;
        this.lastPhoneHistoryAt = 0;
    }


    start() {

        this.bindViews();

        this.loginView.bindPasswordToggle();

        this.authService.observeSession((user) => {

            if (user) {
                this.showDashboard();
            } else {
                this.showLogin();
            }

        });
    }


    bindViews() {

        this.loginView.bindLogin(
            async (email, password) => {

                await this.authService.login(
                    email,
                    password
                );

            }
        );

        this.dashboardView.bindLogout(
            async () => {

                await this.authService.logout();

            }
        );

        this.dashboardView.bindCenterMap(
            () => {

                this.mapAdapter.centerOnLastLocation();

            }
        );
    }


    async showDashboard() {

        this.loginView.hide();

        this.dashboardView.show();

        this.mapAdapter.initialize();

        setTimeout(() => {

            this.mapAdapter.invalidateSize();

        }, 100);

        await this.notificationService.requestPermission();

        this.startSubscriptions();


        /*
         * Activar el GPS del teléfono solamente
         * cuando la URL contiene ?gps=1.
         */
        const gpsEnabled =
            new URLSearchParams(
                window.location.search
            ).get("gps") === "1";

        if (gpsEnabled && this.phoneLocationService) {

            this.phoneLocationService.start(

                async (location) => {

                    try {

                        // Guardar ubicación actual en Firebase.
                        await this.deviceService.writePhoneLocation(
                            location
                        );

                        // Guardar un punto del recorrido
                        // cada 30 segundos como máximo.
                        const now = Date.now();

                        if (
                            now - this.lastPhoneHistoryAt >= 30000
                        ) {

                            await this.deviceService.writePhoneLocationHistory(
                                location
                            );

                            this.lastPhoneHistoryAt = now;
                        }

                    } catch (error) {

                        console.error(
                            "No se pudo guardar la ubicación del teléfono:",
                            error
                        );

                    }

                },

                (message) => {

                    console.error(
                        "Error de GPS del teléfono:",
                        message
                    );

                }

            );

        }


        /*
         * Activar el simulador solamente con ?sim=1.
         */
        const simulatorEnabled =
            new URLSearchParams(
                window.location.search
            ).get("sim") === "1";

        if (simulatorEnabled) {

            this.dashboardView.showSimulator();

            if (!this.simulatorBound) {

                this.bindSimulator();

                this.simulatorBound = true;

            }

        }

    }


    showLogin() {

        this.stopSubscriptions();

        // Detener seguimiento del teléfono al cerrar sesión.
        if (this.phoneLocationService) {

            this.phoneLocationService.stop();

        }

        this.phoneLocationReceived = false;

        this.dashboardView.hide();

        this.loginView.show();

    }


    startSubscriptions() {

        this.stopSubscriptions();


        /*
         * Estado del bastón.
         */
        const statusUnsubscribe =
            this.deviceService.subscribeToStatus(

                (status) => {

                    const online =
                        this.deviceService.isOnline(status);

                    this.dashboardView.updateStatus(
                        status,
                        online
                    );

                    /*
                     * Mostrar la ubicación del bastón
                     * si el teléfono no está proporcionando
                     * una ubicación válida.
                     */
                    if (
                        !this.phoneLocationReceived &&
                        status &&
                        status.hasLocation()
                    ) {

                        this.mapAdapter.updateLocation(
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


        /*
         * Historial de ubicaciones del bastón.
         */
        const historyUnsubscribe =
            this.deviceService.subscribeToHistory(

                (points) => {

                    this.mapAdapter.updateTrajectory(
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


        /*
         * Alertas de caída y SOS.
         */
        const alertsUnsubscribe =
            this.alertService.subscribeToAlerts(

                (alerts) => {

                    this.dashboardView.renderAlerts(
                        alerts,

                        (id) =>
                            this.alertService.markAsAttended(
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


        /*
         * Ubicación actual del teléfono desde Firebase.
         */
        const phoneLocationUnsubscribe =
            this.deviceService.subscribeToPhoneLocation(

                (location) => {

                    if (
                        !location ||
                        location.gpsFix !== true ||
                        !Number.isFinite(location.lat) ||
                        !Number.isFinite(location.lng)
                    ) {

                        this.phoneLocationReceived = false;

                        return;

                    }

                    this.phoneLocationReceived = true;

                    this.mapAdapter.updateLocation(
                        location.lat,
                        location.lng
                    );

                },

                (error) => {

                    console.error(
                        "Error al recibir la ubicación del teléfono:",
                        error
                    );

                }

            );


        /*
         * Guardar las suscripciones para poder detenerlas.
         */
        this.unsubscribers = [

            statusUnsubscribe,

            historyUnsubscribe,

            alertsUnsubscribe,

            phoneLocationUnsubscribe

        ];

    }


    stopSubscriptions() {

        for (
            const unsubscribe of this.unsubscribers
            ) {

            if (typeof unsubscribe === "function") {

                unsubscribe();

            }

        }

        this.unsubscribers = [];

    }


    bindSimulator() {

        this.dashboardView.bindSimulator({

            normal: async () => {

                await this.runSimulator(
                    () =>
                        this.simulatorService.simulateNormal()
                );

            },

            obstacle: async () => {

                await this.runSimulator(
                    () =>
                        this.simulatorService.simulateObstacle()
                );

            },

            fall: async () => {

                await this.runSimulator(
                    () =>
                        this.simulatorService.simulateFall()
                );

            },

            sos: async () => {

                await this.runSimulator(
                    () =>
                        this.simulatorService.simulateSos()
                );

            },

            gps: async () => {

                await this.runSimulator(
                    () =>
                        this.simulatorService.simulateGpsWithoutSignal()
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