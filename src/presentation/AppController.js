
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
        this.heartbeatInProgress = false;

        // Simulador.
        this.simulatorBound = false;

        // GPS del teléfono.
        this.phoneLocationReceived = false;
        this.lastPhoneHistoryAt = 0;
        this.lastPhoneLocation = null;
        this.lastPhoneLocationAt = 0;
        this.gpsEnabled = false;
        this.gpsRefreshTimer = null;
        this.gpsRefreshInProgress = false;

        // Bluetooth BLE.
        this.bluetoothConnecting = false;
        this.lastBleMessage = null;

        // Alertas.
        this.sosProcessing = false;
        this.lastSosAt = 0;
        this.lastEmergencyType = null;

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

        this.alertService.setNotificationsEnabled(false);

        this.authService.observeSession((user) => {

            this.sessionVersion++;

            this.alertService.setNotificationsEnabled(false);

            this.stopSubscriptions();
            this.stopStatusMonitor();
            this.stopGPSRefresh();

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

        this.dashboardView.setCaregiverMode(
            this.isCaregiver
        );

        // Notificaciones solo para cuidador.
        this.alertService.setNotificationsEnabled(
            this.isCaregiver
        );

        // Limpiar información anterior.
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

        // Inicializar mapa.
        this.mapAdapter.initialize();

        setTimeout(() => {

            if (
                this.sessionActive &&
                version === this.sessionVersion
            ) {
                this.mapAdapter.invalidateSize();
            }

        }, 100);

        // Suscripciones Firebase.
        this.startSubscriptions();

        // Monitor cada 15 segundos.
        this.startStatusMonitor();

        const params = new URLSearchParams(
            window.location.search
        );

        /*
         * ==========================================
         * GPS DEL TELÉFONO ANDROID
         * ==========================================
         *
         * Solamente la cuenta del bastón.
         * Requiere ?gps=1.
         */

        this.gpsEnabled = Boolean(
            this.isDeviceUser &&
            params.get("gps") === "1" &&
            this.phoneLocationService
        );

        if (this.gpsEnabled) {

            this.phoneLocationService.start(

                (location) => {

                    void this.handlePhoneLocation(
                        location,
                        version
                    );
                },

                (message) => {

                    console.error(
                        "Error del GPS:",
                        message
                    );
                }
            );

            // Actualización periódica de GPS.
            this.startGPSRefresh(version);
        }

        /*
         * ==========================================
         * SIMULADOR
         * ==========================================
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
            this.bluetoothService?.device?.gatt?.connected
        );

        this.dashboardView.updateBluetoothStatus(
            connected
                ? "connected"
                : "disconnected"
        );
    }

    /*
     * ==========================================
     * RECIBIR GPS DEL TELÉFONO
     * ==========================================
     */

    async handlePhoneLocation(location, version) {

        if (
            !this.sessionActive ||
            !this.isDeviceUser ||
            version !== this.sessionVersion
        ) {
            return;
        }

        if (!this.isValidLocation(location)) {
            return;
        }

        this.lastPhoneLocation = {
            lat: location.lat,
            lng: location.lng,
            gpsFix: true,
            accuracy: Number.isFinite(location.accuracy)
                ? Math.max(0, location.accuracy)
                : 0
        };

        this.lastPhoneLocationAt = Date.now();

        // Actualización visual inmediata.
        this.dashboardView.setPhoneLocation(
            this.lastPhoneLocation,
            this.lastPhoneLocationAt
        );

        this.mapAdapter.updateLocation(
            location.lat,
            location.lng
        );

        try {

            await this.deviceService.writePhoneLocation(
                this.lastPhoneLocation
            );

            const now = Date.now();

            if (
                now - this.lastPhoneHistoryAt >= 30000
            ) {

                await this.deviceService
                    .writePhoneLocationHistory(
                        this.lastPhoneLocation
                    );

                this.lastPhoneHistoryAt = now;
            }

        } catch (error) {

            console.error(
                "Error guardando GPS en Firebase:",
                error
            );
        }
    }

    /*
     * ==========================================
     * ACTUALIZAR GPS PERIÓDICAMENTE
     * ==========================================
     *
     * Permite volver a solicitar coordenadas
     * incluso cuando el teléfono está quieto.
     */

    startGPSRefresh(version) {

        this.stopGPSRefresh();

        if (!this.gpsEnabled) {
            return;
        }

        this.gpsRefreshTimer = setInterval(() => {

            if (
                !this.sessionActive ||
                !this.isDeviceUser ||
                version !== this.sessionVersion ||
                this.gpsRefreshInProgress
            ) {
                return;
            }

            if (!navigator.geolocation) {
                return;
            }

            this.gpsRefreshInProgress = true;

            navigator.geolocation.getCurrentPosition(

                (position) => {

                    this.gpsRefreshInProgress = false;

                    const location = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        gpsFix: true,
                        timestamp: position.timestamp
                    };

                    void this.handlePhoneLocation(
                        location,
                        version
                    );
                },

                (error) => {

                    this.gpsRefreshInProgress = false;

                    console.warn(
                        "No se pudo actualizar el GPS:",
                        error.message
                    );
                },

                {
                    enableHighAccuracy: true,
                    maximumAge: 10000,
                    timeout: 15000
                }

            );

        }, 30000);
    }

    stopGPSRefresh() {

        if (this.gpsRefreshTimer !== null) {

            clearInterval(this.gpsRefreshTimer);
        }

        this.gpsRefreshTimer = null;
        this.gpsRefreshInProgress = false;
        this.gpsEnabled = false;
    }

    /*
     * ==========================================
     * CERRAR SESIÓN
     * ==========================================
     */

    showLogin() {

        this.alertService.setNotificationsEnabled(false);

        this.sessionActive = false;

        this.currentUser = null;
        this.isCaregiver = false;
        this.isDeviceUser = false;

        this.stopSubscriptions();
        this.stopStatusMonitor();
        this.stopGPSRefresh();

        this.phoneLocationService?.stop();

        this.phoneLocationReceived = false;
        this.lastPhoneLocation = null;
        this.lastPhoneLocationAt = 0;
        this.lastPhoneHistoryAt = 0;

        this.currentDeviceStatus = null;

        this.dashboardView.setPhoneLocation(null);
        this.dashboardView.setPendingFall(false);

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
        this.lastEmergencyType = null;

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

            // Heartbeat solo para bastón conectado.
            if (this.isDeviceUser) {

                void this.sendBluetoothHeartbeat();
            }

            this.refreshDeviceStatus();

            this.dashboardView.refreshCombinedStatus();

        }, 15000);
    }

    stopStatusMonitor() {

        if (this.statusTimer !== null) {

            clearInterval(this.statusTimer);
        }

        this.statusTimer = null;
    }

    /*
     * ==========================================
     * HEARTBEAT DE CONEXIÓN BLUETOOTH
     * ==========================================
     *
     * Actualiza lastSeen en Firebase solamente
     * mientras la sesión del bastón tenga
     * conexión BLE activa.
     *
     * No representa una lectura de sensores.
     */

    async sendBluetoothHeartbeat() {

        if (
            !this.sessionActive ||
            !this.isDeviceUser ||
            this.heartbeatInProgress ||
            !this.bluetoothService?.device?.gatt?.connected
        ) {
            return;
        }

        const version = this.sessionVersion;

        this.heartbeatInProgress = true;

        try {

            const locationRecent = Boolean(
                this.isValidLocation(this.lastPhoneLocation) &&
                Date.now() - this.lastPhoneLocationAt <= 60000
            );

            const location = locationRecent
                ? this.lastPhoneLocation
                : {
                    lat: 0,
                    lng: 0,
                    gpsFix: false
                };

            /*
             * El esquema actual de status exige
             * obstacleCm numérico y fallDetected.
             *
             * Se conserva un valor previo cuando
             * existe; en otro caso se usa 0
             * únicamente como valor de compatibilidad.
             *
             * NO es una medición ultrasónica.
             */

            const previousObstacle =
                Number(this.currentDeviceStatus?.obstacleCm);

            const obstacleCm =
                this.currentDeviceStatus?.obstacleCm != null &&
                Number.isFinite(previousObstacle) &&
                previousObstacle >= 0
                    ? previousObstacle
                    : 0;

            await this.deviceService.deviceRepository
                .writeStatus({
                    lat: location.lat,
                    lng: location.lng,
                    gpsFix: location.gpsFix,
                    obstacleCm,
                    fallDetected: false
                });

            if (
                this.sessionActive &&
                version === this.sessionVersion
            ) {

                console.log(
                    "Heartbeat BLE enviado a Firebase."
                );
            }

        } catch (error) {

            console.error(
                "Error actualizando estado del bastón:",
                error
            );

        } finally {

            this.heartbeatInProgress = false;
        }
    }

    /*
     * ==========================================
     * REFRESCAR ESTADO DE FIREBASE
     * ==========================================
     */

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

        const validSession = () => (
            this.sessionActive &&
            version === this.sessionVersion
        );

        /*
         * ESTADO DEL BASTÓN.
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
         * HISTORIAL DE UBICACIONES.
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
         * ALERTAS DE FIREBASE.
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
         * UBICACIÓN DEL TELÉFONO.
         */

        const unsubscribePhone =
            this.deviceService.subscribeToPhoneLocation(

                (location) => {

                    if (!validSession()) {
                        return;
                    }

                    const updatedAt =
                        Number(location?.updatedAt);

                    const now = Date.now();

                    const recent = Boolean(
                        Number.isFinite(updatedAt) &&
                        updatedAt > 0 &&
                        now - updatedAt <= 60000 &&
                        updatedAt <= now + 10000
                    );

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

                    this.dashboardView.setPhoneLocation(
                        location,
                        updatedAt
                    );

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

        if (
            this.bluetoothService.device?.gatt?.connected
        ) {

            this.dashboardView.updateBluetoothStatus(
                "connected"
            );

            void this.sendBluetoothHeartbeat();

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
                            .updateBluetoothStatus(status);

                        if (status === "connected") {

                            void this.sendBluetoothHeartbeat();
                        }
                    }
                }
            );

            if (
                !this.sessionActive ||
                !this.isDeviceUser ||
                version !== this.sessionVersion
            ) {

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

            void this.sendBluetoothHeartbeat();

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

        if (!this.sessionActive || !this.isDeviceUser) {
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

        // SOS manual.
        if (text === "SOS: Necesito ayuda") {

            void this.processBluetoothSOS(
                ALERT_TYPES.SOS
            );

            return;
        }

        // Posible caída del MPU6050.
        if (text === "ALERTA: Posible caida detectada") {

            void this.processBluetoothSOS(
                ALERT_TYPES.FALL ?? "fall"
            );

            return;
        }

        if (text === "Smart Cane listo") {

            console.log(
                "SmartCane preparado."
            );
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
     * OBTENER GPS PARA EMERGENCIA
     * ==========================================
     */

    async getSOSLocation() {

        if (
            this.isValidLocation(this.lastPhoneLocation) &&
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

                        gpsFix: true,

                        accuracy: position.coords.accuracy
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
     * REGISTRAR SOS O POSIBLE CAÍDA
     * ==========================================
     *
     * 1. Recibir evento BLE.
     * 2. Obtener GPS si está disponible.
     * 3. Guardar alerta en Firebase.
     * 4. Enviar aviso a Telegram.
     */

    async processBluetoothSOS(
        type = ALERT_TYPES.SOS
    ) {

        if (
            !this.sessionActive ||
            !this.isDeviceUser ||
            this.sosProcessing
        ) {
            return;
        }

        const isFall =
            type === ALERT_TYPES.FALL ||
            type === "fall";

        const eventName = isFall
            ? "Posible caída"
            : "SOS";

        const now = Date.now();

        if (
            this.lastEmergencyType === type &&
            now - this.lastSosAt < 3000
        ) {
            return;
        }

        this.sosProcessing = true;

        const version = this.sessionVersion;

        try {

            this.dashboardView.updateBluetoothMessage(
                `${eventName} recibido. Obteniendo ubicación...`
            );

            let location;

            try {

                location = await this.getSOSLocation();

            } catch (gpsError) {

                console.warn(
                    "GPS no disponible:",
                    gpsError
                );

                location = {
                    lat: 0,
                    lng: 0,
                    gpsFix: false
                };
            }

            if (
                !this.sessionActive ||
                !this.isDeviceUser ||
                version !== this.sessionVersion
            ) {
                return;
            }

            const alertId =
                await this.alertService.createAlert(
                    type,
                    location
                );

            this.lastSosAt = Date.now();
            this.lastEmergencyType = type;

            console.log(
                `${eventName} registrado en Firebase:`,
                alertId
            );

            this.dashboardView.updateBluetoothMessage(
                `${eventName} guardado en Firebase. Enviando Telegram...`
            );

            if (!this.telegramService) {

                this.dashboardView.updateBluetoothMessage(
                    `${eventName} guardado en Firebase. Telegram no configurado.`
                );

                return;
            }

            try {

                const result =
                    await this.telegramService.sendAlert(
                        alertId
                    );

                console.log(
                    `${eventName} enviado a Telegram:`,
                    result
                );

                if (
                    this.sessionActive &&
                    version === this.sessionVersion
                ) {

                    this.dashboardView.updateBluetoothMessage(
                        `${eventName} enviado a Firebase y Telegram`
                    );
                }

            } catch (telegramError) {

                console.error(
                    `${eventName} registrado, pero Telegram falló:`,
                    telegramError
                );

                if (
                    this.sessionActive &&
                    version === this.sessionVersion
                ) {

                    this.dashboardView.updateBluetoothMessage(
                        `${eventName} guardado en Firebase. Error de Telegram: ${telegramError.message}`
                    );
                }
            }

        } catch (error) {

            console.error(
                `Error procesando ${eventName}:`,
                error
            );

            if (
                this.sessionActive &&
                version === this.sessionVersion
            ) {

                this.dashboardView.updateBluetoothMessage(
                    `No se pudo registrar ${eventName}: ${error.message}`
                );

                window.alert(
                    `No se pudo registrar ${eventName}: ${error.message}`
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
