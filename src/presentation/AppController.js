
import { ALERT_TYPES } from "../domain/constants.js";

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
                    phoneLocationService,
                    bluetoothService
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
        this.bluetoothService = bluetoothService;

        this.unsubscribers = [];
        this.simulatorBound = false;

        // GPS del teléfono.
        this.phoneLocationReceived = false;
        this.lastPhoneHistoryAt = 0;
        this.lastPhoneLocation = null;
        this.lastPhoneLocationAt = 0;

        // Bluetooth BLE.
        this.bluetoothConnecting = false;
        this.lastBleMessage = null;

        // Evita procesar un mismo SOS repetidamente.
        this.sosProcessing = false;
        this.lastSosAt = 0;

        // Sesión Firebase.
        this.sessionActive = false;
    }


    /*
     * ========================================
     * INICIAR APLICACIÓN
     * ========================================
     */
    start() {

        this.bindViews();

        this.loginView.bindPasswordToggle();

        this.authService.observeSession((user) => {

            if (user) {

                this.sessionActive = true;
                this.showDashboard();

            } else {

                this.sessionActive = false;
                this.showLogin();

            }

        });
    }


    /*
     * ========================================
     * VINCULAR BOTONES
     * ========================================
     */
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

        // Botón Bluetooth SmartCane.
        this.dashboardView.bindBluetooth(
            () => this.connectBluetooth()
        );
    }


    /*
     * ========================================
     * MOSTRAR DASHBOARD
     * ========================================
     */
    async showDashboard() {

        this.loginView.hide();
        this.dashboardView.show();

        this.mapAdapter.initialize();

        setTimeout(() => {

            if (this.sessionActive) {
                this.mapAdapter.invalidateSize();
            }

        }, 100);

        await this.notificationService.requestPermission();

        if (!this.sessionActive) {
            return;
        }

        this.startSubscriptions();


        /*
         * ========================================
         * GPS DEL TELÉFONO
         * ========================================
         */
        const params =
            new URLSearchParams(
                window.location.search
            );

        const gpsEnabled =
            params.get("gps") === "1";

        if (gpsEnabled && this.phoneLocationService) {

            this.phoneLocationService.start(

                async (location) => {

                    if (!this.sessionActive) {
                        return;
                    }

                    /*
                     * Guardar la última lectura
                     * válida en memoria.
                     */
                    if (this.isValidLocation(location)) {

                        this.lastPhoneLocation = {
                            lat: location.lat,
                            lng: location.lng,
                            gpsFix: true
                        };

                        this.lastPhoneLocationAt = Date.now();
                    }

                    try {

                        // Actualizar Firebase.
                        await this.deviceService
                            .writePhoneLocation(location);

                        // Historial cada 30 segundos.
                        const now = Date.now();

                        if (
                            this.isValidLocation(location) &&
                            now - this.lastPhoneHistoryAt >= 30000
                        ) {

                            await this.deviceService
                                .writePhoneLocationHistory(
                                    location
                                );

                            this.lastPhoneHistoryAt = now;
                        }

                    } catch (error) {

                        console.error(
                            "Error guardando ubicación GPS:",
                            error
                        );

                    }
                },

                (message) => {

                    console.error(
                        "Error GPS:",
                        message
                    );

                }
            );
        }


        /*
         * ========================================
         * SIMULADOR
         * ========================================
         */
        if (params.get("sim") === "1") {

            this.dashboardView.showSimulator();

            if (!this.simulatorBound) {

                this.bindSimulator();
                this.simulatorBound = true;

            }
        }

        if (!this.bluetoothService?.device?.gatt?.connected) {

            this.dashboardView.updateBluetoothStatus(
                "disconnected"
            );
        }
    }


    /*
     * ========================================
     * CERRAR SESIÓN
     * ========================================
     */
    showLogin() {

        this.sessionActive = false;

        this.stopSubscriptions();

        if (this.phoneLocationService) {
            this.phoneLocationService.stop();
        }

        this.phoneLocationReceived = false;
        this.lastPhoneLocation = null;
        this.lastPhoneLocationAt = 0;
        this.lastPhoneHistoryAt = 0;

        if (this.bluetoothService) {

            this.bluetoothService.disconnect()
                .catch(console.error);
        }

        this.bluetoothConnecting = false;
        this.lastBleMessage = null;

        this.dashboardView.hide();
        this.loginView.show();
    }


    /*
     * ========================================
     * SUSCRIPCIONES FIREBASE
     * ========================================
     */
    startSubscriptions() {

        this.stopSubscriptions();

        // Estado del dispositivo.
        const statusUnsubscribe =
            this.deviceService.subscribeToStatus(

                (status) => {

                    const online =
                        this.deviceService.isOnline(status);

                    this.dashboardView.updateStatus(
                        status,
                        online
                    );

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


        // Historial del bastón.
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


        // Alertas.
        const alertsUnsubscribe =
            this.alertService.subscribeToAlerts(

                (alerts) => {

                    this.dashboardView.renderAlerts(
                        alerts,

                        (id) =>
                            this.alertService
                                .markAsAttended(id)
                    );
                },

                (error) => {
                    console.error(
                        "Error de alertas:",
                        error
                    );
                }
            );


        // Ubicación del teléfono desde Firebase.
        const phoneLocationUnsubscribe =
            this.deviceService.subscribeToPhoneLocation(

                (location) => {

                    if (!this.isValidLocation(location)) {

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
                        "Error de ubicación del teléfono:",
                        error
                    );
                }
            );


        this.unsubscribers = [
            statusUnsubscribe,
            historyUnsubscribe,
            alertsUnsubscribe,
            phoneLocationUnsubscribe
        ];
    }


    /*
     * ========================================
     * DETENER SUSCRIPCIONES
     * ========================================
     */
    stopSubscriptions() {

        for (const unsubscribe of this.unsubscribers) {

            if (typeof unsubscribe === "function") {
                unsubscribe();
            }
        }

        this.unsubscribers = [];
    }


    /*
     * ========================================
     * CONECTAR BLUETOOTH
     * ========================================
     */
    async connectBluetooth() {

        if (
            !this.sessionActive ||
            !this.bluetoothService ||
            this.bluetoothConnecting
        ) {
            return;
        }

        if (!this.bluetoothService.isSupported()) {

            this.dashboardView.updateBluetoothStatus(
                "error"
            );

            window.alert(
                "Utiliza Google Chrome en Android " +
                "con Bluetooth y HTTPS habilitados."
            );

            return;
        }

        if (
            this.bluetoothService.device?.gatt?.connected
        ) {

            this.dashboardView.updateBluetoothStatus(
                "connected"
            );

            return;
        }

        this.bluetoothConnecting = true;

        this.dashboardView.updateBluetoothStatus(
            "connecting"
        );

        try {

            await this.bluetoothService.connect(

                (message) => {

                    if (this.sessionActive) {
                        this.handleBluetoothMessage(message);
                    }
                },

                (status) => {

                    if (!this.sessionActive) {
                        return;
                    }

                    console.log(
                        "Estado BLE:",
                        status
                    );

                    this.dashboardView.updateBluetoothStatus(
                        status
                    );
                }
            );

            if (!this.sessionActive) {

                await this.bluetoothService.disconnect();
                return;
            }

            if (!this.bluetoothService.device?.gatt?.connected) {

                throw new Error(
                    "La conexión BLE se perdió."
                );
            }

            this.dashboardView.updateBluetoothStatus(
                "connected"
            );

            this.dashboardView.updateBluetoothMessage(
                "Conexión establecida con SmartCane"
            );

        } catch (error) {

            console.error(
                "Error Bluetooth:",
                error
            );

            if (!this.sessionActive) {
                return;
            }

            if (error.name === "NotFoundError") {

                this.dashboardView.updateBluetoothStatus(
                    "disconnected"
                );

            } else {

                this.dashboardView.updateBluetoothStatus(
                    "error"
                );

                window.alert(
                    "No se pudo conectar SmartCane: " +
                    error.message
                );
            }

        } finally {

            this.bluetoothConnecting = false;
        }
    }


    /*
     * ========================================
     * RECIBIR NOTIFICACIÓN BLE
     * ========================================
     */
    handleBluetoothMessage(message) {

        if (!this.sessionActive) {
            return;
        }

        const text = String(message ?? "").trim();

        if (!text) {
            return;
        }

        this.lastBleMessage = text;

        console.log(
            "Mensaje del ESP32:",
            text
        );

        this.dashboardView.updateBluetoothMessage(
            text
        );

        /*
         * Identificar SOS físico.
         */
        if (text === "SOS: Necesito ayuda") {

            console.warn(
                "SOS FÍSICO RECIBIDO POR BLE"
            );

            // Procesar alerta sin bloquear
            // las siguientes notificaciones BLE.
            this.processBluetoothSOS();
        }
    }


    /*
     * ========================================
     * VALIDAR UBICACIÓN GPS
     * ========================================
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
     * ========================================
     * OBTENER UBICACIÓN PARA SOS
     * ========================================
     *
     * Usa una lectura reciente del teléfono.
     * Si no existe, solicita otra al navegador.
     */
    async getSOSLocation() {

        const now = Date.now();

        // Lectura válida de los últimos 30 segundos.
        if (
            this.isValidLocation(this.lastPhoneLocation) &&
            now - this.lastPhoneLocationAt <= 30000
        ) {

            return {
                ...this.lastPhoneLocation
            };
        }

        if (!navigator.geolocation) {

            throw new Error(
                "Este teléfono no admite geolocalización."
            );
        }

        return new Promise((resolve, reject) => {

            navigator.geolocation.getCurrentPosition(

                (position) => {

                    const location = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        gpsFix: true
                    };

                    if (!this.isValidLocation(location)) {

                        reject(
                            new Error(
                                "La ubicación GPS no es válida."
                            )
                        );

                        return;
                    }

                    this.lastPhoneLocation = location;
                    this.lastPhoneLocationAt = Date.now();

                    resolve(location);
                },

                (error) => {

                    reject(
                        new Error(
                            "No se pudo obtener el GPS: " +
                            error.message
                        )
                    );
                },

                {
                    enableHighAccuracy: true,
                    maximumAge: 10000,
                    timeout: 15000
                }
            );
        });
    }


    /*
     * ========================================
     * PROCESAR SOS DEL ESP32
     * ========================================
     *
     * BLE -> GPS teléfono -> Firebase.
     */
    async processBluetoothSOS() {

        if (
            !this.sessionActive ||
            this.sosProcessing
        ) {
            return;
        }

        const now = Date.now();

        // Evitar eventos duplicados muy próximos.
        if (now - this.lastSosAt < 3000) {
            return;
        }

        this.sosProcessing = true;

        try {

            console.log(
                "Obteniendo ubicación para SOS..."
            );

            /*
             * Obtener coordenadas del teléfono.
             */
            const location =
                await this.getSOSLocation();

            if (!this.sessionActive) {
                return;
            }

            console.log(
                "Ubicación para SOS:",
                location
            );

            /*
             * Crear alerta mediante AlertService.
             *
             * AlertService utiliza internamente
             * FirebaseDeviceRepository.
             */
            const alertId =
                await this.alertService.createAlert(
                    ALERT_TYPES.SOS,
                    location
                );

            this.lastSosAt = Date.now();

            console.log(
                "Alerta SOS guardada en Firebase:",
                alertId
            );

            this.dashboardView.updateBluetoothMessage(
                "SOS enviado correctamente a Firebase"
            );

            /*
             * La suscripción de alertas existente
             * actualizará el panel del cuidador.
             */

        } catch (error) {

            console.error(
                "No se pudo registrar el SOS:",
                error
            );

            this.dashboardView.updateBluetoothMessage(
                "SOS recibido, pero no se pudo guardar: " +
                error.message
            );

            /*
             * No inventamos coordenadas.
             * Para admitir SOS sin ubicación
             * debemos verificar primero las
             * reglas actuales de Firebase.
             */
            window.alert(
                "Se recibió el SOS del bastón, " +
                "pero no se pudo registrar en Firebase. " +
                error.message
            );

        } finally {

            this.sosProcessing = false;
        }
    }


    /*
     * ========================================
     * SIMULADOR
     * ========================================
     */
    bindSimulator() {

        this.dashboardView.bindSimulator({

            normal: async () => {
                await this.runSimulator(
                    () => this.simulatorService.simulateNormal()
                );
            },

            obstacle: async () => {
                await this.runSimulator(
                    () => this.simulatorService.simulateObstacle()
                );
            },

            fall: async () => {
                await this.runSimulator(
                    () => this.simulatorService.simulateFall()
                );
            },

            sos: async () => {
                await this.runSimulator(
                    () => this.simulatorService.simulateSos()
                );
            },

            gps: async () => {
                await this.runSimulator(
                    () => this.simulatorService
                        .simulateGpsWithoutSignal()
                );
            }
        });
    }


    /*
     * ========================================
     * EJECUTAR SIMULADOR
     * ========================================
     */
    async runSimulator(operation) {

        try {

            await operation();

        } catch (error) {

            console.error(error);

            window.alert(
                "No se pudo ejecutar el simulador: " +
                error.message
            );
        }
    }
}
