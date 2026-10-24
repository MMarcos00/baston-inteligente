
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
                    bluetoothService,
                    telegramService
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
        this.telegramService = telegramService;

        // Suscripciones Firebase.
        this.unsubscribers = [];
        this.currentDeviceStatus = null;
        this.statusTimer = null;

        // Simulador.
        this.simulatorBound = false;

        // Ubicación del teléfono.
        this.phoneLocationReceived = false;
        this.lastPhoneHistoryAt = 0;
        this.lastPhoneLocation = null;
        this.lastPhoneLocationAt = 0;

        // Bluetooth BLE.
        this.bluetoothConnecting = false;
        this.lastBleMessage = null;

        // Alertas SOS.
        this.sosProcessing = false;
        this.lastSosAt = 0;

        // Sesión.
        this.sessionActive = false;
        this.sessionVersion = 0;
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

            this.sessionVersion++;

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

        // Conectar ESP32 mediante BLE.
        this.dashboardView.bindBluetooth(
            () => this.connectBluetooth()
        );
    }


    /*
     * ========================================
     * MOSTRAR PANEL PRINCIPAL
     * ========================================
     */
    async showDashboard() {

        const version = this.sessionVersion;

        this.loginView.hide();
        this.dashboardView.show();

        this.mapAdapter.initialize();

        setTimeout(() => {

            if (
                this.sessionActive &&
                version === this.sessionVersion
            ) {

                this.mapAdapter.invalidateSize();
            }

        }, 100);

        /*
         * Consultar los permisos actuales.
         *
         * En Android los permisos pendientes
         * deben solicitarse desde un botón
         * pulsado por el usuario.
         */
        if ("Notification" in window) {

            console.log(
                "Permiso de notificaciones:",
                Notification.permission
            );
        }

        if (
            !this.sessionActive ||
            version !== this.sessionVersion
        ) {
            return;
        }

        this.startSubscriptions();

        // Actualización visual periódica.
        this.startStatusMonitor();

        const params = new URLSearchParams(
            window.location.search
        );

        /*
         * ========================================
         * GPS DEL TELÉFONO
         * ========================================
         *
         * Se activa con ?gps=1.
         */
        if (
            params.get("gps") === "1" &&
            this.phoneLocationService
        ) {

            this.phoneLocationService.start(

                async (location) => {

                    if (
                        !this.sessionActive ||
                        version !== this.sessionVersion
                    ) {
                        return;
                    }

                    /*
                     * Guardar ubicación válida
                     * para utilizarla en SOS.
                     */
                    if (this.isValidLocation(location)) {

                        this.lastPhoneLocation = {
                            lat: location.lat,
                            lng: location.lng,
                            gpsFix: true
                        };

                        this.lastPhoneLocationAt =
                            Date.now();
                    }

                    try {

                        await this.deviceService
                            .writePhoneLocation(location);

                        /*
                         * Registrar historial
                         * cada 30 segundos.
                         */
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
                            "Error guardando GPS en Firebase:",
                            error
                        );
                    }
                },

                (message) => {

                    console.error(
                        "Error del GPS del teléfono:",
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


        /*
         * ========================================
         * BLUETOOTH
         * ========================================
         */
        const connected = Boolean(
            this.bluetoothService?.device?.gatt?.connected
        );

        this.dashboardView.updateBluetoothStatus(
            connected ? "connected" : "disconnected"
        );
    }


    /*
     * ========================================
     * CERRAR SESIÓN
     * ========================================
     */
    showLogin() {

        this.sessionActive = false;

        this.stopSubscriptions();
        this.stopStatusMonitor();

        if (this.phoneLocationService) {

            this.phoneLocationService.stop();
        }

        this.phoneLocationReceived = false;
        this.lastPhoneLocation = null;
        this.lastPhoneLocationAt = 0;
        this.lastPhoneHistoryAt = 0;

        this.currentDeviceStatus = null;

        if (this.bluetoothService) {

            this.bluetoothService.disconnect()
                .catch((error) => {

                    console.error(
                        "Error desconectando Bluetooth:",
                        error
                    );
                });
        }

        this.bluetoothConnecting = false;
        this.lastBleMessage = null;

        this.sosProcessing = false;
        this.lastSosAt = 0;

        this.dashboardView.hide();
        this.loginView.show();
    }


    /*
     * ========================================
     * MONITOR DE ESTADO DEL DISPOSITIVO
     * ========================================
     */
    startStatusMonitor() {

        this.stopStatusMonitor();

        this.statusTimer = setInterval(() => {

            if (this.sessionActive) {

                this.refreshDeviceStatus();
            }

        }, 15000);
    }


    refreshDeviceStatus() {

        const status = this.currentDeviceStatus;

        const online = status
            ? this.deviceService.isOnline(status)
            : false;

        this.dashboardView.updateStatus(
            status,
            online
        );
    }


    stopStatusMonitor() {

        if (this.statusTimer !== null) {

            clearInterval(this.statusTimer);

            this.statusTimer = null;
        }
    }


    /*
     * ========================================
     * SUSCRIPCIONES FIREBASE
     * ========================================
     */
    startSubscriptions() {

        this.stopSubscriptions();

        /*
         * Estado principal del dispositivo.
         */
        const statusUnsubscribe =
            this.deviceService.subscribeToStatus(

                (status) => {

                    this.currentDeviceStatus = status;

                    this.refreshDeviceStatus();

                    const online = status
                        ? this.deviceService.isOnline(status)
                        : false;

                    if (
                        online &&
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
         * Historial de ubicaciones.
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
         * Alertas de Firebase.
         *
         * AlertService sigue encargándose
         * de las notificaciones del navegador.
         */
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


        /*
         * Ubicación GPS del teléfono.
         */
        const phoneLocationUnsubscribe =
            this.deviceService.subscribeToPhoneLocation(

                (location) => {

                    const updatedAt =
                        Number(location?.updatedAt);

                    const isRecent =
                        Number.isFinite(updatedAt) &&
                        updatedAt > 0 &&
                        Date.now() - updatedAt <= 60000 &&
                        updatedAt <= Date.now() + 10000;

                    if (
                        !this.isValidLocation(location) ||
                        !isRecent
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
     * CONECTAR ESP32 POR BLE
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
                "Este navegador no admite Bluetooth BLE. " +
                "Utiliza Google Chrome en Android."
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

                        this.handleBluetoothMessage(
                            message
                        );
                    }
                },

                (status) => {

                    if (!this.sessionActive) {
                        return;
                    }

                    console.log(
                        "Estado Bluetooth:",
                        status
                    );

                    this.dashboardView
                        .updateBluetoothStatus(
                            status
                        );
                }
            );

            if (!this.sessionActive) {

                await this.bluetoothService.disconnect();
                return;
            }

            if (
                !this.bluetoothService.device?.gatt?.connected
            ) {

                throw new Error(
                    "Se perdió la conexión BLE."
                );
            }

            this.dashboardView.updateBluetoothStatus(
                "connected"
            );

            this.dashboardView.updateBluetoothMessage(
                "Conexión establecida con SmartCane"
            );

            console.log(
                "SmartCane conectado correctamente."
            );

        } catch (error) {

            console.error(
                "Error de Bluetooth:",
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
     * RECIBIR SEÑALES BLE
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
         * Detectar SOS físico.
         */
        if (text === "SOS: Necesito ayuda") {

            console.warn(
                "SOS físico recibido mediante BLE."
            );

            void this.processBluetoothSOS();
        }
    }


    /*
     * ========================================
     * VALIDAR COORDENADAS
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
     * OBTENER GPS PARA SOS
     * ========================================
     */
    async getSOSLocation() {

        const now = Date.now();

        /*
         * Reutilizar ubicación válida
         * de los últimos 30 segundos.
         */
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
                "El teléfono no admite geolocalización."
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

                    this.lastPhoneLocationAt =
                        position.timestamp || Date.now();

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
     * PROCESAR ALERTA SOS
     * ========================================
     *
     * 1. Recibir señal BLE.
     * 2. Obtener GPS del teléfono.
     * 3. Registrar alerta en Firebase.
     * 4. Enviar alerta por Telegram.
     */
    async processBluetoothSOS() {

        if (
            !this.sessionActive ||
            this.sosProcessing
        ) {
            return;
        }

        const now = Date.now();

        // Evitar SOS duplicados demasiado próximos.
        if (now - this.lastSosAt < 3000) {
            return;
        }

        this.sosProcessing = true;

        const version = this.sessionVersion;

        try {

            this.dashboardView.updateBluetoothMessage(
                "SOS recibido. Obteniendo ubicación..."
            );

            /*
             * PASO 1: GPS del teléfono.
             */
            const location =
                await this.getSOSLocation();

            if (
                !this.sessionActive ||
                version !== this.sessionVersion
            ) {
                return;
            }

            /*
             * PASO 2: guardar en Firebase.
             */
            const alertId =
                await this.alertService.createAlert(
                    ALERT_TYPES.SOS,
                    location
                );

            this.lastSosAt = Date.now();

            console.log(
                "SOS registrado en Firebase:",
                alertId
            );

            this.dashboardView.updateBluetoothMessage(
                "SOS guardado en Firebase. Enviando Telegram..."
            );

            /*
             * PASO 3: enviar Telegram.
             *
             * El envío falla por separado.
             * Una falla de Telegram no elimina
             * el SOS previamente registrado.
             */
            if (this.telegramService) {

                try {

                    const result =
                        await this.telegramService.sendAlert(
                            alertId
                        );

                    console.log(
                        "Resultado de Telegram:",
                        result
                    );

                    if (
                        this.sessionActive &&
                        version === this.sessionVersion
                    ) {

                        this.dashboardView.updateBluetoothMessage(
                            "SOS enviado a Firebase y Telegram"
                        );
                    }

                } catch (telegramError) {

                    console.error(
                        "La alerta está en Firebase, " +
                        "pero Telegram falló:",
                        telegramError
                    );

                    if (
                        this.sessionActive &&
                        version === this.sessionVersion
                    ) {

                        this.dashboardView.updateBluetoothMessage(
                            "SOS registrado en Firebase. " +
                            "Telegram no pudo enviarse: " +
                            telegramError.message
                        );
                    }
                }

            } else {

                console.warn(
                    "TelegramService no está disponible."
                );

                this.dashboardView.updateBluetoothMessage(
                    "SOS guardado en Firebase. " +
                    "Telegram no está configurado."
                );
            }

        } catch (error) {

            console.error(
                "Error al procesar SOS:",
                error
            );

            if (
                !this.sessionActive ||
                version !== this.sessionVersion
            ) {
                return;
            }

            this.dashboardView.updateBluetoothMessage(
                "No se pudo registrar SOS: " +
                error.message
            );

            window.alert(
                "El ESP32 envió un SOS, pero no " +
                "se pudo registrarlo en Firebase. " +
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
                        this.simulatorService
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
