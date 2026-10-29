
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

        // Firebase y monitoreo.
        this.unsubscribers = [];
        this.currentDeviceStatus = null;
        this.statusTimer = null;
        this.heartbeatInProgress = false;

        // Simulador.
        this.simulatorBound = false;

        // Ubicación GPS del teléfono Android.
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

        // Emergencias.
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

        // Avisos solo para el cuidador.
        this.alertService.setNotificationsEnabled(
            this.isCaregiver
        );

        // Reiniciar información visual.
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

        // Inicializar el mapa.
        this.mapAdapter.initialize();

        setTimeout(() => {

            if (
                this.sessionActive &&
                version === this.sessionVersion
            ) {

                this.mapAdapter.invalidateSize();
            }

        }, 100);

        // Escuchar Firebase.
        this.startSubscriptions();

        // Comprobar estado periódicamente.
        this.startStatusMonitor();

        const params = new URLSearchParams(
            window.location.search
        );

        /*
         * ==========================================
         * GPS AUTOMÁTICO DEL TELÉFONO
         * ==========================================
         *
         * NUEVO:
         *
         * Ya no es necesario ?gps=1.
         *
         * La cuenta del bastón inicia
         * automáticamente el monitoreo GPS.
         *
         * La cuenta del cuidador solamente
         * consulta las coordenadas de Firebase.
         */

        this.gpsEnabled = Boolean(
            this.isDeviceUser &&
            this.phoneLocationService
        );

        if (this.gpsEnabled) {

            console.log(
                "SmartCane: iniciando GPS automático."
            );

            // Escuchar cambios de ubicación.
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

                    this.dashboardView.updateBluetoothMessage(
                        "GPS: " + message
                    );
                }
            );

            // Solicitar ubicaciones periódicamente.
            this.startGPSRefresh(version);
        }

        /*
         * ==========================================
         * SIMULADOR
         * ==========================================
         *
         * Sigue disponible usando ?sim=1.
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

        if (connected) {

            void this.sendBluetoothHeartbeat();
        }
    }

    /*
     * ==========================================
     * RECIBIR UBICACIÓN DEL TELÉFONO
     * ==========================================
     *
     * 1. Validar sesión y coordenadas.
     * 2. Actualizar interfaz.
     * 3. Actualizar mapa local.
     * 4. Guardar ubicación en Firebase.
     * 5. Registrar historial cada 30 segundos.
     */

    async handlePhoneLocation(location, version) {

        if (
            !this.sessionActive ||
            !this.isDeviceUser ||
            !this.gpsEnabled ||
            version !== this.sessionVersion
        ) {

            return;
        }

        if (!this.isValidLocation(location)) {

            console.warn(
                "SmartCane: ubicación GPS inválida.",
                location
            );

            return;
        }

        const normalizedLocation = {

            lat: location.lat,

            lng: location.lng,

            gpsFix: true,

            accuracy: Number.isFinite(location.accuracy)
                ? Math.max(0, location.accuracy)
                : 0
        };

        this.lastPhoneLocation =
            normalizedLocation;

        this.lastPhoneLocationAt =
            Date.now();

        /*
         * Actualizar información GPS local.
         */

        this.dashboardView.setPhoneLocation(
            normalizedLocation,
            this.lastPhoneLocationAt
        );

        /*
         * Actualizar marcador del mapa.
         */

        this.mapAdapter.updateLocation(
            normalizedLocation.lat,
            normalizedLocation.lng
        );

        console.log(
            "SmartCane: nueva ubicación GPS:",
            normalizedLocation
        );

        /*
         * Guardar posición en Firebase.
         */

        try {

            await this.deviceService.writePhoneLocation(
                normalizedLocation
            );

            console.log(
                "Ubicación GPS guardada en Firebase."
            );

        } catch (error) {

            console.error(
                "Error guardando ubicación GPS:",
                error
            );

            return;
        }

        /*
         * Registrar historial cada 30 segundos.
         */

        const now = Date.now();

        if (
            now - this.lastPhoneHistoryAt >= 30000
        ) {

            // Reservar el intervalo antes de escribir
            // para evitar registros simultáneos.
            this.lastPhoneHistoryAt = now;

            try {

                await this.deviceService
                    .writePhoneLocationHistory(
                        normalizedLocation
                    );

            } catch (error) {

                console.error(
                    "Error guardando historial GPS:",
                    error
                );

                this.lastPhoneHistoryAt = 0;
            }
        }
    }

    /*
     * ==========================================
     * ACTUALIZACIÓN PERIÓDICA DEL GPS
     * ==========================================
     *
     * CORRECCIÓN:
     *
     * No llamar stopGPSRefresh() aquí,
     * porque esa función también desactiva
     * gpsEnabled.
     *
     * Solicitar ubicación al iniciar y
     * repetir aproximadamente cada 30 segundos.
     */

    startGPSRefresh(version) {

        // Eliminar solamente el intervalo anterior.
        if (this.gpsRefreshTimer !== null) {

            clearInterval(
                this.gpsRefreshTimer
            );

            this.gpsRefreshTimer = null;
        }

        if (!this.gpsEnabled) {

            return;
        }

        const refreshLocation = () => {

            if (
                !this.sessionActive ||
                !this.isDeviceUser ||
                !this.gpsEnabled ||
                version !== this.sessionVersion ||
                this.gpsRefreshInProgress
            ) {

                return;
            }

            if (!navigator.geolocation) {

                console.error(
                    "El teléfono no admite geolocalización."
                );

                return;
            }

            this.gpsRefreshInProgress = true;

            navigator.geolocation.getCurrentPosition(

                (position) => {

                    this.gpsRefreshInProgress = false;

                    if (
                        !this.sessionActive ||
                        !this.isDeviceUser ||
                        !this.gpsEnabled ||
                        version !== this.sessionVersion
                    ) {

                        return;
                    }

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
                        "Error actualizando GPS:",
                        error.code,
                        error.message
                    );
                },

                {
                    enableHighAccuracy: true,
                    maximumAge: 3000,
                    timeout: 20000
                }
            );
        };

        // Solicitar la primera ubicación.
        refreshLocation();

        // Solicitar nuevas posiciones.
        this.gpsRefreshTimer = setInterval(
            refreshLocation,
            30000
        );

        console.log(
            "SmartCane: actualización GPS cada 30 segundos."
        );
    }

    /*
     * ==========================================
     * DETENER GPS
     * ==========================================
     */

    stopGPSRefresh() {

        if (this.gpsRefreshTimer !== null) {

            clearInterval(
                this.gpsRefreshTimer
            );
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

        this.alertService.setNotificationsEnabled(
            false
        );

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

        /*
         * Desconectar Bluetooth al cerrar sesión.
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

            /*
             * Mantener el estado actualizado
             * solo si el ESP32 sigue conectado.
             */

            if (this.isDeviceUser) {

                void this.sendBluetoothHeartbeat();
            }

            this.refreshDeviceStatus();

            this.dashboardView.refreshCombinedStatus();

        }, 15000);
    }

    stopStatusMonitor() {

        if (this.statusTimer !== null) {

            clearInterval(
                this.statusTimer
            );
        }

        this.statusTimer = null;
    }

    /*
     * ==========================================
     * HEARTBEAT BLUETOOTH
     * ==========================================
     *
     * Actualiza lastSeen en Firebase cada
     * 15 segundos mientras la conexión
     * Bluetooth del teléfono esté activa.
     *
     * El heartbeat NO representa una medición
     * de distancia ni de aceleración.
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
                this.isValidLocation(
                    this.lastPhoneLocation
                ) &&
                Date.now() -
                this.lastPhoneLocationAt <= 60000
            );

            const location = locationRecent
                ? this.lastPhoneLocation
                : {
                    lat: 0,
                    lng: 0,
                    gpsFix: false
                };

            /*
             * El esquema de status requiere
             * obstacleCm y fallDetected.
             *
             * obstacleCm se conserva si ya existe;
             * en caso contrario se utiliza 0
             * como valor de compatibilidad.
             *
             * Esto NO es una medición real.
             */

            const previousObstacle =
                Number(
                    this.currentDeviceStatus?.obstacleCm
                );

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
                    "Heartbeat Bluetooth enviado a Firebase."
                );
            }

        } catch (error) {

            console.error(
                "Error actualizando estado SmartCane:",
                error
            );

        } finally {

            this.heartbeatInProgress = false;
        }
    }

    /*
     * ==========================================
     * ACTUALIZAR ESTADO DEL BASTÓN
     * ==========================================
     */

    refreshDeviceStatus() {

        const status =
            this.currentDeviceStatus;

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
                        "Error escuchando estado:",
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
                        "Error escuchando historial:",
                        error
                    );
                }
            );

        /*
         * ==========================================
         * ALERTAS SOS Y CAÍDAS
         * ==========================================
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
                        "Error escuchando alertas:",
                        error
                    );
                }
            );

        /*
         * ==========================================
         * UBICACIÓN GPS DEL TELÉFONO
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

                    const now = Date.now();

                    const recent = Boolean(
                        Number.isFinite(updatedAt) &&
                        updatedAt > 0 &&
                        now - updatedAt <= 60000 &&
                        updatedAt <= now + 10000
                    );

                    /*
                     * No mostrar ubicaciones antiguas
                     * como si fueran actuales.
                     */

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
                     * Actualizar datos GPS.
                     */

                    this.dashboardView.setPhoneLocation(
                        location,
                        updatedAt
                    );

                    /*
                     * Mostrar marcador en Leaflet.
                     */

                    this.mapAdapter.updateLocation(
                        location.lat,
                        location.lng
                    );

                    console.log(
                        "Ubicación GPS recibida desde Firebase:",
                        location.lat,
                        location.lng
                    );
                },

                (error) => {

                    console.error(
                        "Error escuchando GPS:",
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

            if (
                typeof unsubscribe === "function"
            ) {

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

        /*
         * Si ya está conectado, mantener
         * el estado correctamente.
         */

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
                            .updateBluetoothStatus(
                                status
                            );

                        if (status === "connected") {

                            void this.sendBluetoothHeartbeat();
                        }
                    }
                }
            );

            /*
             * Verificar que la sesión
             * siga activa al conectar.
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
                "Error conectando Bluetooth:",
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
     *
     * Los mensajes deben coincidir con
     * los emitidos por el ESP32.
     */

    handleBluetoothMessage(message) {

        if (
            !this.sessionActive ||
            !this.isDeviceUser
        ) {

            return;
        }

        const text =
            String(message ?? "").trim();

        if (!text) {

            return;
        }

        this.lastBleMessage = text;

        console.log(
            "Mensaje recibido del ESP32:",
            text
        );

        this.dashboardView.updateBluetoothMessage(
            text
        );

        /*
         * SOS físico.
         */

        if (text === "SOS: Necesito ayuda") {

            void this.processBluetoothSOS(
                ALERT_TYPES.SOS
            );

            return;
        }

        /*
         * Posible caída MPU6050.
         */

        if (
            text === "ALERTA: Posible caida detectada"
        ) {

            void this.processBluetoothSOS(
                ALERT_TYPES.FALL
            );

            return;
        }

        /*
         * Mensaje inicial del ESP32.
         */

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
     * OBTENER UBICACIÓN PARA EMERGENCIA
     * ==========================================
     */

    async getSOSLocation() {

        /*
         * Reutilizar posición reciente.
         */

        if (
            this.isValidLocation(
                this.lastPhoneLocation
            ) &&
            Date.now() -
            this.lastPhoneLocationAt <= 30000
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
                        Date.now();

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
     * PROCESAR EMERGENCIA SOS O CAÍDA
     * ==========================================
     *
     * 1. Recibir mensaje BLE.
     * 2. Obtener ubicación GPS.
     * 3. Crear alerta en Firebase.
     * 4. Enviar alerta a Telegram.
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

        /*
         * Evitar duplicados consecutivos
         * del mismo evento.
         */

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

            /*
             * Si falla el GPS, la emergencia
             * se registra igualmente.
             */

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

            /*
             * Crear alerta Firebase.
             */

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

            /*
             * Verificar Telegram.
             */

            if (!this.telegramService) {

                this.dashboardView.updateBluetoothMessage(
                    `${eventName} guardado en Firebase. Telegram no configurado.`
                );

                return;
            }

            /*
             * Notificar Telegram.
             */

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
