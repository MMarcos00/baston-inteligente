
import { ALERT_TYPES } from "../domain/constants.js";

const DEVICE_UID = "Kf0yMxgUzRTZ17Vq5M8jzQ1RqW33";
const CAREGIVER_UID = "ErQQJUH79XT65flAqwP11o5lycv2";

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

        Object.assign(this, {
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
        });

        // Firebase.
        this.unsubscribers = [];
        this.currentDeviceStatus = null;
        this.statusTimer = null;

        // Simulador.
        this.simulatorBound = false;

        // GPS del teléfono.
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

        // Sesión y roles.
        this.sessionActive = false;
        this.sessionVersion = 0;
        this.currentUser = null;
        this.isCaregiver = false;
        this.isDeviceUser = false;
    }


    /*
     * ==========================================
     * INICIAR APLICACIÓN
     * ==========================================
     */
    start() {

        this.bindViews();

        this.loginView.bindPasswordToggle();

        // Nadie recibe avisos hasta validar su rol.
        this.alertService.setNotificationsEnabled(false);

        this.authService.observeSession((user) => {

            this.sessionVersion++;

            // Desactivar avisos de la sesión anterior.
            this.alertService.setNotificationsEnabled(false);

            this.stopSubscriptions();
            this.stopStatusMonitor();

            this.phoneLocationService?.stop();

            if (!user) {

                this.showLogin();
                return;
            }

            this.currentUser = user;
            this.sessionActive = true;

            this.isCaregiver =
                user.uid === CAREGIVER_UID;

            this.isDeviceUser =
                user.uid === DEVICE_UID;

            console.log(
                "Rol de usuario:",
                this.isCaregiver
                    ? "Cuidador"
                    : this.isDeviceUser
                        ? "Bastón"
                        : "No reconocido"
            );

            this.showDashboard();
        });
    }


    /*
     * ==========================================
     * VINCULAR BOTONES
     * ==========================================
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

                this.alertService.setNotificationsEnabled(
                    false
                );

                await this.authService.logout();
            }
        );

        this.dashboardView.bindCenterMap(
            () => {

                this.mapAdapter.centerOnLastLocation();
            }
        );

        this.dashboardView.bindBluetooth(
            () => this.connectBluetooth()
        );
    }


    /*
     * ==========================================
     * MOSTRAR DASHBOARD
     * ==========================================
     */
    showDashboard() {

        const version = this.sessionVersion;

        this.loginView.hide();
        this.dashboardView.show();

        /*
         * Identificar el rol en la vista.
         *
         * Esto controla la visibilidad
         * de los botones y paneles.
         */
        this.dashboardView.setCaregiverMode(
            this.isCaregiver
        );

        /*
         * NUEVO:
         * Notificaciones únicamente
         * para la cuenta del cuidador.
         *
         * Al bastón se le desactivan
         * sonido, vibración y notificaciones
         * mediante AlertService.
         */
        this.alertService.setNotificationsEnabled(
            this.isCaregiver
        );

        /*
         * Limpiar información visual de
         * una sesión anterior.
         */
        this.dashboardView.setPhoneLocation(null);

        this.dashboardView.setPendingFall(false);

        this.phoneLocationReceived = false;
        this.lastPhoneLocation = null;
        this.lastPhoneLocationAt = 0;
        this.lastPhoneHistoryAt = 0;

        this.currentDeviceStatus = null;

        this.dashboardView.updateStatus(
            null,
            false
        );

        /*
         * Inicializar mapa.
         */
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
         * Escuchar Firebase.
         */
        this.startSubscriptions();

        /*
         * Actualizar estados cada 15 segundos.
         */
        this.startStatusMonitor();

        const params = new URLSearchParams(
            window.location.search
        );


        /*
         * ==========================================
         * GPS DEL TELÉFONO ANDROID
         * ==========================================
         *
         * Solo el usuario bastón puede
         * transmitir su ubicación.
         *
         * Se activa mediante ?gps=1.
         */
        if (
            this.isDeviceUser &&
            params.get("gps") === "1" &&
            this.phoneLocationService
        ) {

            this.phoneLocationService.start(

                async (location) => {

                    if (
                        !this.sessionActive ||
                        !this.isDeviceUser ||
                        version !== this.sessionVersion
                    ) {
                        return;
                    }

                    /*
                     * Guardar ubicación válida.
                     */
                    if (this.isValidLocation(location)) {

                        this.lastPhoneLocation = {

                            lat: location.lat,

                            lng: location.lng,

                            gpsFix: true
                        };

                        this.lastPhoneLocationAt =
                            Date.now();

                        /*
                         * Actualizar el panel GPS
                         * inmediatamente.
                         */
                        this.dashboardView.setPhoneLocation(
                            this.lastPhoneLocation,
                            this.lastPhoneLocationAt
                        );
                    }

                    /*
                     * Guardar posición en Firebase.
                     */
                    try {

                        await this.deviceService
                            .writePhoneLocation(
                                location
                            );

                        const now = Date.now();

                        /*
                         * Registrar historial cada
                         * 30 segundos aproximadamente.
                         */
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
                        "Error del GPS:",
                        message
                    );
                }
            );
        }


        /*
         * ==========================================
         * SIMULADOR
         * ==========================================
         *
         * Solo cuenta del bastón.
         */
        if (
            this.isDeviceUser &&
            params.get("sim") === "1"
        ) {

            this.dashboardView.showSimulator();

            if (!this.simulatorBound) {

                this.bindSimulator();

                this.simulatorBound = true;
            }

        } else {

            this.dashboardView.simulatorPanel
                ?.classList.add("hidden");
        }


        /*
         * ==========================================
         * ESTADO BLUETOOTH
         * ==========================================
         */
        const connected = Boolean(
            this.isDeviceUser &&
            this.bluetoothService
                ?.device?.gatt?.connected
        );

        this.dashboardView.updateBluetoothStatus(
            connected
                ? "connected"
                : "disconnected"
        );
    }


    /*
     * ==========================================
     * CERRAR SESIÓN
     * ==========================================
     */
    showLogin() {

        /*
         * Desactivar inmediatamente
         * cualquier aviso de emergencia.
         */
        this.alertService.setNotificationsEnabled(
            false
        );

        this.sessionActive = false;

        this.currentUser = null;
        this.isCaregiver = false;
        this.isDeviceUser = false;

        this.stopSubscriptions();
        this.stopStatusMonitor();

        this.phoneLocationService?.stop();

        this.phoneLocationReceived = false;
        this.lastPhoneLocation = null;
        this.lastPhoneLocationAt = 0;
        this.lastPhoneHistoryAt = 0;

        this.currentDeviceStatus = null;

        this.dashboardView.setPhoneLocation(null);
        this.dashboardView.setPendingFall(false);

        /*
         * Desconectar Bluetooth.
         */
        if (this.bluetoothService) {

            try {

                Promise.resolve(
                    this.bluetoothService.disconnect()
                ).catch((error) => {

                    console.error(
                        "Error desconectando Bluetooth:",
                        error
                    );
                });

            } catch (error) {

                console.error(
                    "Error desconectando Bluetooth:",
                    error
                );
            }
        }

        this.bluetoothConnecting = false;
        this.lastBleMessage = null;

        this.sosProcessing = false;
        this.lastSosAt = 0;

        this.dashboardView.hide();
        this.loginView.show();
    }


    /*
     * ==========================================
     * MONITOR DEL ESTADO
     * ==========================================
     */
    startStatusMonitor() {

        this.stopStatusMonitor();

        this.statusTimer = setInterval(() => {

            if (!this.sessionActive) {
                return;
            }

            this.refreshDeviceStatus();

            /*
             * Verificar si la ubicación GPS
             * sigue siendo reciente.
             */
            this.dashboardView.refreshCombinedStatus();

        }, 15000);
    }


    stopStatusMonitor() {

        if (this.statusTimer !== null) {

            clearInterval(this.statusTimer);
        }

        this.statusTimer = null;
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


    /*
     * ==========================================
     * SUSCRIPCIONES FIREBASE
     * ==========================================
     */
    startSubscriptions() {

        this.stopSubscriptions();

        const version = this.sessionVersion;

        const validSession = () => {

            return (
                this.sessionActive &&
                version === this.sessionVersion
            );
        };


        /*
         * ==========================================
         * ESTADO DEL BASTÓN
         * ==========================================
         */
        const unsubscribeStatus =
            this.deviceService.subscribeToStatus(

                (status) => {

                    if (!validSession()) {
                        return;
                    }

                    this.currentDeviceStatus = status;

                    this.refreshDeviceStatus();

                    const online = status
                        ? this.deviceService.isOnline(status)
                        : false;

                    if (
                        online &&
                        !this.phoneLocationReceived &&
                        status &&
                        typeof status.hasLocation === "function" &&
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
         * ==========================================
         * HISTORIAL DE UBICACIONES
         * ==========================================
         */
        const unsubscribeHistory =
            this.deviceService.subscribeToHistory(

                (points) => {

                    if (!validSession()) {
                        return;
                    }

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
         * ==========================================
         * ALERTAS DE FIREBASE
         * ==========================================
         *
         * AlertService solo notificará
         * al cuidador.
         *
         * DashboardView mostrará las
         * caídas pendientes.
         */
        const unsubscribeAlerts =
            this.alertService.subscribeToAlerts(

                (alerts) => {

                    if (!validSession()) {
                        return;
                    }

                    this.dashboardView.renderAlerts(
                        alerts,

                        (id) => {

                            if (!this.isCaregiver) {

                                return Promise.reject(
                                    new Error(
                                        "Solo el cuidador puede atender alertas."
                                    )
                                );
                            }

                            return this.alertService
                                .markAsAttended(id);
                        }
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
         * ==========================================
         * UBICACIÓN DEL TELÉFONO
         * ==========================================
         */
        const unsubscribePhone =
            this.deviceService.subscribeToPhoneLocation(

                (location) => {

                    if (!validSession()) {
                        return;
                    }

                    const updatedAt =
                        Number(location?.updatedAt);

                    /*
                     * Ubicación válida por
                     * un máximo de 60 segundos.
                     */
                    const recent =
                        Number.isFinite(updatedAt) &&
                        updatedAt > 0 &&
                        Date.now() - updatedAt <= 60000 &&
                        updatedAt <= Date.now() + 10000;

                    if (
                        !this.isValidLocation(location) ||
                        !recent
                    ) {

                        this.phoneLocationReceived = false;

                        if (!this.isDeviceUser) {

                            this.dashboardView
                                .setPhoneLocation(null);
                        }

                        return;
                    }

                    this.phoneLocationReceived = true;

                    /*
                     * Actualizar estado GPS.
                     */
                    this.dashboardView.setPhoneLocation(
                        location,
                        updatedAt
                    );

                    /*
                     * Actualizar mapa.
                     */
                    this.mapAdapter.updateLocation(
                        location.lat,
                        location.lng
                    );
                },

                (error) => {

                    console.error(
                        "Error de ubicación:",
                        error
                    );
                }
            );


        /*
         * Guardar suscripciones.
         */
        this.unsubscribers = [

            unsubscribeStatus,

            unsubscribeHistory,

            unsubscribeAlerts,

            unsubscribePhone
        ];
    }


    /*
     * ==========================================
     * DETENER SUSCRIPCIONES
     * ==========================================
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
     * ==========================================
     * CONECTAR ESP32 POR BLUETOOTH BLE
     * ==========================================
     */
    async connectBluetooth() {

        /*
         * Solo el usuario bastón.
         */
        if (
            !this.sessionActive ||
            !this.isDeviceUser ||
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
                "Utiliza Chrome en Android."
            );

            return;
        }

        /*
         * Evitar reconectar si sigue conectado.
         */
        if (
            this.bluetoothService
                .device?.gatt?.connected
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

        const version = this.sessionVersion;

        try {

            await this.bluetoothService.connect(

                (message) => {

                    if (
                        this.sessionActive &&
                        this.isDeviceUser &&
                        version === this.sessionVersion
                    ) {

                        this.handleBluetoothMessage(
                            message
                        );
                    }
                },

                (status) => {

                    if (
                        this.sessionActive &&
                        this.isDeviceUser &&
                        version === this.sessionVersion
                    ) {

                        this.dashboardView
                            .updateBluetoothStatus(
                                status
                            );
                    }
                }
            );

            /*
             * Comprobar sesión y conexión.
             */
            if (
                !this.sessionActive ||
                !this.isDeviceUser ||
                version !== this.sessionVersion
            ) {

                await this.bluetoothService.disconnect();

                return;
            }

            if (
                !this.bluetoothService
                    .device?.gatt?.connected
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

        } catch (error) {

            console.error(
                "Error de Bluetooth:",
                error
            );

            if (
                !this.sessionActive ||
                version !== this.sessionVersion
            ) {
                return;
            }

            const cancelled =
                error.name === "NotFoundError";

            this.dashboardView.updateBluetoothStatus(
                cancelled
                    ? "disconnected"
                    : "error"
            );

            if (!cancelled) {

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
     * ==========================================
     * RECIBIR MENSAJES BLUETOOTH
     * ==========================================
     */
    handleBluetoothMessage(message) {

        if (
            !this.sessionActive ||
            !this.isDeviceUser
        ) {
            return;
        }

        const text = String(
            message ?? ""
        ).trim();

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
         * Detectar mensaje SOS físico.
         */
        if (text === "SOS: Necesito ayuda") {

            void this.processBluetoothSOS();
        }
    }


    /*
     * ==========================================
     * VALIDAR UBICACIÓN GPS
     * ==========================================
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
     * ==========================================
     * OBTENER UBICACIÓN PARA SOS
     * ==========================================
     */
    async getSOSLocation() {

        /*
         * Aprovechar GPS reciente
         * de los últimos 30 segundos.
         */
        if (
            this.isValidLocation(
                this.lastPhoneLocation
            ) &&
            Date.now() - this.lastPhoneLocationAt <= 30000
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
                        position.timestamp ||
                        Date.now();

                    /*
                     * Reflejar GPS en pantalla.
                     */
                    this.dashboardView.setPhoneLocation(
                        location,
                        this.lastPhoneLocationAt
                    );

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
     * ==========================================
     * PROCESAR SOS FÍSICO DEL ESP32
     * ==========================================
     *
     * 1. Recibir Bluetooth.
     * 2. Obtener coordenadas GPS.
     * 3. Guardar alerta en Firebase.
     * 4. Enviar alerta a Telegram.
     */
    async processBluetoothSOS() {

        if (
            !this.sessionActive ||
            !this.isDeviceUser ||
            this.sosProcessing
        ) {
            return;
        }

        /*
         * Evitar señales repetidas
         * en menos de tres segundos.
         */
        if (
            Date.now() - this.lastSosAt < 3000
        ) {
            return;
        }

        this.sosProcessing = true;

        const version = this.sessionVersion;

        try {

            this.dashboardView.updateBluetoothMessage(
                "SOS recibido. Obteniendo ubicación..."
            );

            /*
             * PASO 1. OBTENER GPS.
             */
            const location =
                await this.getSOSLocation();

            if (
                !this.sessionActive ||
                !this.isDeviceUser ||
                version !== this.sessionVersion
            ) {
                return;
            }

            /*
             * PASO 2. GUARDAR ALERTA.
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
             * PASO 3. ENVIAR TELEGRAM.
             */
            if (!this.telegramService) {

                this.dashboardView.updateBluetoothMessage(
                    "SOS guardado en Firebase. " +
                    "Telegram no está configurado."
                );

                return;
            }

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
                    "SOS registrado, pero Telegram falló:",
                    telegramError
                );

                if (
                    this.sessionActive &&
                    version === this.sessionVersion
                ) {

                    this.dashboardView.updateBluetoothMessage(
                        "SOS guardado en Firebase. " +
                        "Error de Telegram: " +
                        telegramError.message
                    );
                }
            }

        } catch (error) {

            console.error(
                "Error al procesar SOS:",
                error
            );

            if (
                this.sessionActive &&
                version === this.sessionVersion
            ) {

                this.dashboardView.updateBluetoothMessage(
                    "No se pudo registrar SOS: " +
                    error.message
                );

                window.alert(
                    "No se pudo registrar SOS en Firebase: " +
                    error.message
                );
            }

        } finally {

            this.sosProcessing = false;
        }
    }


    /*
     * ==========================================
     * SIMULADOR
     * ==========================================
     */
    bindSimulator() {

        this.dashboardView.bindSimulator({

            normal: async () => {

                return this.runSimulator(
                    () =>
                        this.simulatorService.simulateNormal()
                );
            },

            obstacle: async () => {

                return this.runSimulator(
                    () =>
                        this.simulatorService.simulateObstacle()
                );
            },

            fall: async () => {

                return this.runSimulator(
                    () =>
                        this.simulatorService.simulateFall()
                );
            },

            sos: async () => {

                return this.runSimulator(
                    () =>
                        this.simulatorService.simulateSos()
                );
            },

            gps: async () => {

                return this.runSimulator(
                    () =>
                        this.simulatorService
                            .simulateGpsWithoutSignal()
                );
            }
        });
    }


    /*
     * ==========================================
     * EJECUTAR SIMULADOR
     * ==========================================
     */
    async runSimulator(operation) {

        if (!this.isDeviceUser) {

            window.alert(
                "El simulador solo está disponible " +
                "para la cuenta del bastón."
            );

            return;
        }

        try {

            await operation();

        } catch (error) {

            console.error(
                "Error del simulador:",
                error
            );

            window.alert(
                "No se pudo ejecutar el simulador: " +
                error.message
            );
        }
    }
}
