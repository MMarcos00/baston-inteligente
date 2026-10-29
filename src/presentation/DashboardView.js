
/*
 * ============================================
 * SMARTCANE - DASHBOARD VIEW
 * ============================================
 *
 * Interfaz del bastón y del cuidador.
 *
 * - Estado de monitoreo
 * - Conexión Bluetooth BLE
 * - GPS y mapa
 * - Posibles caídas MPU6050
 * - Alertas SOS
 * - Historial
 * - Notificaciones
 * - Simulador
 *
 * Se oculta la tarjeta visual del sensor
 * de obstáculos, sin alterar el ESP32.
 */

export class DashboardView {

    constructor() {

        const get = (id) =>
            document.getElementById(id);

        // Pantallas.
        this.screen = get("dashboardScreen");

        // Estado general.
        this.connectionStatus = get("connectionStatus");
        this.connectionIndicator = get("connectionIndicator");
        this.lastSeenText = get("lastSeenText");

        // Sensores y GPS.
        this.gpsWarning = get("gpsWarning");
        this.obstacleValue = get("obstacleValue");
        this.fallValue = get("fallValue");
        this.fallCard = get("fallCard");
        this.coordinatesText = get("coordinatesText");

        // Alertas.
        this.alertsList = get("alertsList");
        this.historyAlertsList = get("historyAlertsList");
        this.pendingAlertCount = get("pendingAlertCount");

        this.pendingAlertCountSecondary =
            get("pendingAlertCountSecondary");

        this.noPendingAlerts = get("noPendingAlerts");

        // Botones generales.
        this.logoutButton = get("logoutButton");
        this.centerMapButton = get("centerMapButton");

        // Simulador.
        this.simulatorPanel = get("simulatorPanel");

        this.simulateNormalButton =
            get("simulateNormalButton");

        this.simulateObstacleButton =
            get("simulateObstacleButton");

        this.simulateFallButton =
            get("simulateFallButton");

        this.simulateSosButton =
            get("simulateSosButton");

        this.simulateGpsButton =
            get("simulateGpsButton");

        // Interfaz del cuidador.
        this.caregiverIntro = get("caregiverIntro");
        this.caregiverNavigation = get("caregiverNavigation");
        this.caregiverSummary = get("caregiverSummary");

        // Interfaz del bastón.
        this.deviceIntro = get("deviceIntro");
        this.deviceInfoPanel = get("deviceInfoPanel");

        // Notificaciones.
        this.notificationsPanel = get("notificationsPanel");

        // Pestañas.
        this.tabPanels = {
            inicio: get("scPanelInicio"),
            mapa: get("scPanelMapa"),
            alertas: get("scPanelAlertas"),
            historial: get("scPanelHistorial"),
            notificaciones: get("scPanelNotificaciones")
        };

        // Bluetooth BLE.
        this.bluetoothPanel = null;
        this.bluetoothButton = null;
        this.bluetoothStatus = null;
        this.bluetoothMessage = null;

        this.bluetoothConnected = false;
        this.bluetoothBound = false;

        // Simulador.
        this.simulatorBound = false;

        // Estado Firebase.
        this.lastDeviceStatus = null;
        this.lastDeviceOnline = false;

        // GPS del teléfono.
        this.phoneLocation = null;
        this.phoneLocationAt = 0;

        // Rol.
        this.isCaregiver = false;

        // Alertas.
        this.pendingFall = false;
        this.currentAlerts = [];

        // Panel MPU6050.
        this.mpuPanel = null;
        this.mpuStatus = null;
        this.mpuLastEvent = null;

        // Mapa.
        this.mapAdapter = null;

        // Referencia a tarjeta oculta.
        this.obstacleCard = null;

        // Inicialización.
        this.hideObstacleCard();
        this.createBluetoothPanel();
        this.createMPUPanel();
        this.configureTabs();
    }

    /*
     * ============================================
     * OCULTAR TARJETA DE OBSTÁCULOS
     * ============================================
     *
     * Busca el contenedor visual que incluye
     * el valor obstacleValue y el título
     * "Sensor de obstáculos".
     *
     * No depende de una clase CSS específica.
     *
     * Nunca oculta la tarjeta de caídas,
     * el panel principal ni el dashboard.
     */

    hideObstacleCard() {

        if (!this.obstacleValue) {
            return;
        }

        let element = this.obstacleValue.parentElement;
        let candidate = null;

        while (
            element &&
            element !== this.screen &&
            element !== document.body
            ) {

            // No subir hasta un contenedor general.
            if (
                (this.fallValue &&
                    element.contains(this.fallValue)) ||
                (this.connectionStatus &&
                    element.contains(this.connectionStatus))
            ) {
                break;
            }

            const text = element.textContent || "";

            // Debe contener el título y el valor.
            if (
                element.contains(this.obstacleValue) &&
                /Sensor de obstáculos/i.test(text)
            ) {
                candidate = element;
            }

            element = element.parentElement;
        }

        if (!candidate) {

            console.warn(
                "No se encontró la tarjeta completa del sensor de obstáculos."
            );

            return;
        }

        this.obstacleCard = candidate;

        candidate.hidden = true;

        candidate.style.setProperty(
            "display",
            "none",
            "important"
        );

        candidate.setAttribute(
            "aria-hidden",
            "true"
        );

        console.log(
            "Tarjeta de obstáculos ocultada."
        );
    }

    /*
     * ============================================
     * CONFIGURAR PESTAÑAS
     * ============================================
     */

    configureTabs() {

        const buttons = document.querySelectorAll(
            "[data-sc-tab]"
        );

        for (const button of buttons) {

            button.addEventListener("click", () => {

                if (!this.isCaregiver) {
                    return;
                }

                this.openTab(button.dataset.scTab);
            });
        }

        const shortcuts = document.querySelectorAll(
            "[data-sc-open]"
        );

        for (const button of shortcuts) {

            button.addEventListener("click", () => {

                if (!this.isCaregiver) {
                    return;
                }

                this.openTab(button.dataset.scOpen);
            });
        }
    }

    /*
     * ============================================
     * ABRIR PESTAÑA
     * ============================================
     */

    openTab(tabName) {

        if (!this.isCaregiver) {
            return;
        }

        if (!this.tabPanels[tabName]) {
            return;
        }

        for (
            const [name, panel]
            of Object.entries(this.tabPanels)
            ) {

            if (!panel) {
                continue;
            }

            panel.classList.toggle(
                "sc-active",
                name === tabName
            );
        }

        const buttons = document.querySelectorAll(
            "[data-sc-tab]"
        );

        for (const button of buttons) {

            button.setAttribute(
                "aria-selected",
                String(button.dataset.scTab === tabName)
            );
        }

        if (tabName === "mapa") {

            setTimeout(() => {

                if (
                    this.mapAdapter &&
                    typeof this.mapAdapter.invalidateSize ===
                    "function"
                ) {
                    this.mapAdapter.invalidateSize();
                }

                window.dispatchEvent(
                    new Event("resize")
                );

            }, 150);
        }
    }

    /*
     * ============================================
     * ADAPTADOR DEL MAPA
     * ============================================
     */

    setMapAdapter(mapAdapter) {

        this.mapAdapter = mapAdapter;
    }

    /*
     * ============================================
     * CREAR PANEL BLUETOOTH
     * ============================================
     */

    createBluetoothPanel() {

        const existing = document.getElementById(
            "bluetoothPanel"
        );

        if (existing) {

            this.bluetoothPanel = existing;

            this.bluetoothButton =
                document.getElementById(
                    "connectBluetoothButton"
                );

            this.bluetoothStatus =
                document.getElementById(
                    "bluetoothStatus"
                );

            this.bluetoothMessage =
                document.getElementById(
                    "bluetoothMessage"
                );

            return;
        }

        const panel = document.createElement("section");

        panel.id = "bluetoothPanel";
        panel.className = "sc-card";

        panel.style.cssText = `
            margin-top:18px;
            padding:20px;
            border-radius:16px;
            background:#ffffff;
            border:1px solid #e2e8f0;
        `;

        const title = document.createElement("h3");

        title.textContent = "Conexión con el bastón";

        title.style.cssText = `
            margin:0 0 12px;
            font-size:19px;
            color:#101b36;
        `;

        this.bluetoothStatus =
            document.createElement("p");

        this.bluetoothStatus.id = "bluetoothStatus";

        this.bluetoothStatus.textContent =
            "Estado: Desconectado";

        this.bluetoothStatus.style.cssText = `
            font-size:14px;
            color:#b91c1c;
            margin-bottom:14px;
        `;

        this.bluetoothButton =
            document.createElement("button");

        this.bluetoothButton.id =
            "connectBluetoothButton";

        this.bluetoothButton.type = "button";
        this.bluetoothButton.className = "primary-button";

        this.bluetoothButton.textContent =
            "Conectar SmartCane";

        this.bluetoothButton.style.cssText = `
            width:100%;
            max-width:340px;
            padding:14px 18px;
            border-radius:11px;
            background:#2563eb;
            color:#ffffff;
            font-size:15px;
            font-weight:700;
            cursor:pointer;
        `;

        this.bluetoothMessage =
            document.createElement("p");

        this.bluetoothMessage.id =
            "bluetoothMessage";

        this.bluetoothMessage.textContent =
            "Esperando conexión con el ESP32.";

        this.bluetoothMessage.style.cssText = `
            margin:14px 0 0;
            color:#64748b;
            font-size:13px;
            overflow-wrap:anywhere;
        `;

        panel.append(
            title,
            this.bluetoothStatus,
            this.bluetoothButton,
            this.bluetoothMessage
        );

        this.bluetoothPanel = panel;

        if (this.deviceInfoPanel) {

            this.deviceInfoPanel.appendChild(panel);

        } else if (this.screen) {

            this.screen.appendChild(panel);
        }
    }

    /*
     * ============================================
     * PANEL INFORMATIVO MPU6050
     * ============================================
     */

    createMPUPanel() {

        const existing = document.getElementById(
            "scMPUPanel"
        );

        if (existing) {

            this.mpuPanel = existing;

        } else {

            this.mpuPanel =
                document.createElement("section");

            this.mpuPanel.id = "scMPUPanel";
            this.mpuPanel.className = "sc-card";

            this.mpuPanel.style.cssText = `
                margin-top:18px;
                padding:20px;
                border-radius:16px;
                border:1px solid #dbeafe;
                background:#f8fbff;
            `;
        }

        this.mpuPanel.replaceChildren();

        const title = document.createElement("h3");

        title.textContent =
            "🧭 Monitoreo de posibles caídas";

        title.style.cssText = `
            margin:0 0 10px;
            font-size:17px;
            color:#101b36;
        `;

        this.mpuStatus =
            document.createElement("p");

        this.mpuStatus.style.cssText = `
            margin:8px 0;
            font-size:14px;
            color:#475569;
        `;

        this.mpuLastEvent =
            document.createElement("p");

        this.mpuLastEvent.style.cssText = `
            margin:8px 0;
            font-size:13px;
            color:#64748b;
        `;

        const note = document.createElement("p");

        note.textContent =
            "Las posibles caídas se detectan en el ESP32 " +
            "y se registran en Firebase cuando el evento " +
            "llega por Bluetooth.";

        note.style.cssText = `
            margin:12px 0 0;
            font-size:12px;
            color:#64748b;
            line-height:1.5;
        `;

        this.mpuPanel.append(
            title,
            this.mpuStatus,
            this.mpuLastEvent,
            note
        );

        if (!existing) {

            const container =
                this.deviceInfoPanel ||
                this.screen;

            container?.appendChild(this.mpuPanel);
        }

        this.updateMPUStatus();
    }

    /*
     * ============================================
     * ACTUALIZAR INFORMACIÓN MPU6050
     * ============================================
     */

    updateMPUStatus() {

        const falls = this.currentAlerts.filter(
            (alert) => alert.type === "fall"
        );

        const pending = falls.filter(
            (alert) => alert.attended !== true
        );

        if (this.mpuStatus) {

            this.mpuStatus.textContent =
                pending.length > 0
                    ? `⚠️ ${pending.length} posible(s) caída(s) pendiente(s)`
                    : "Sin posibles caídas pendientes";

            this.mpuStatus.style.color =
                pending.length > 0
                    ? "#b91c1c"
                    : "#15803d";

            this.mpuStatus.style.fontWeight =
                pending.length > 0
                    ? "700"
                    : "400";
        }

        if (this.mpuLastEvent) {

            const latest = falls.reduce(
                (current, item) => {

                    if (!current) {
                        return item;
                    }

                    return Number(item.createdAt) >
                    Number(current.createdAt)
                        ? item
                        : current;

                },
                null
            );

            this.mpuLastEvent.textContent = latest
                ? "Última posible caída: " +
                this.formatDate(latest.createdAt) +
                (latest.attended
                    ? " · Atendida"
                    : " · Pendiente")
                : "Todavía no hay caídas registradas.";
        }
    }

    /*
     * ============================================
     * BOTÓN CONECTAR BLUETOOTH
     * ============================================
     */

    bindBluetooth(callback) {

        if (
            !this.bluetoothButton ||
            this.bluetoothBound
        ) {
            return;
        }

        this.bluetoothButton.addEventListener(
            "click",
            async () => {

                if (
                    this.isCaregiver ||
                    this.bluetoothButton.disabled
                ) {
                    return;
                }

                this.updateBluetoothStatus(
                    "connecting"
                );

                try {

                    await callback();

                } catch (error) {

                    console.error(
                        "Error Bluetooth:",
                        error
                    );

                    this.updateBluetoothStatus(
                        "error"
                    );
                }
            }
        );

        this.bluetoothBound = true;
    }

    /*
     * ============================================
     * ACTUALIZAR ESTADO BLUETOOTH
     * ============================================
     */

    updateBluetoothStatus(status) {

        const states = {

            connected: {
                text: "Estado: Conectado a SmartCane",
                color: "#15803d",
                button: "SmartCane conectado",
                disabled: true
            },

            disconnected: {
                text: "Estado: Desconectado",
                color: "#b91c1c",
                button: "Conectar SmartCane",
                disabled: false
            },

            connecting: {
                text: "Estado: Conectando...",
                color: "#b45309",
                button: "Conectando...",
                disabled: true
            },

            error: {
                text: "Estado: Error de conexión",
                color: "#b91c1c",
                button: "Reintentar conexión",
                disabled: false
            }
        };

        const selected =
            states[status] ||
            states.disconnected;

        this.bluetoothConnected =
            status === "connected";

        if (this.bluetoothStatus) {

            this.bluetoothStatus.textContent =
                selected.text;

            this.bluetoothStatus.style.color =
                selected.color;
        }

        if (this.bluetoothButton) {

            this.bluetoothButton.textContent =
                selected.button;

            this.bluetoothButton.disabled =
                selected.disabled;
        }

        this.refreshCombinedStatus();
    }

    /*
     * ============================================
     * MOSTRAR MENSAJES DEL ESP32
     * ============================================
     */

    updateBluetoothMessage(message) {

        if (!this.bluetoothMessage) {
            return;
        }

        const text = String(message ?? "");

        this.bluetoothMessage.textContent =
            "Última señal BLE: " + text;

        const isSOS = /SOS/i.test(text);

        const isFall =
            /caida|caída|fall/i.test(text);

        const isEmergency =
            isSOS || isFall;

        this.bluetoothMessage.style.color =
            isEmergency
                ? "#b91c1c"
                : "#64748b";

        this.bluetoothMessage.style.fontWeight =
            isEmergency
                ? "700"
                : "400";
    }

    /*
     * ============================================
     * MOSTRAR DASHBOARD
     * ============================================
     */

    show() {

        this.screen?.classList.remove(
            "hidden"
        );

        // Garantizar que siga oculta.
        this.hideObstacleCard();
    }

    /*
     * ============================================
     * OCULTAR DASHBOARD
     * ============================================
     */

    hide() {

        this.screen?.classList.add(
            "hidden"
        );

        this.updateBluetoothStatus(
            "disconnected"
        );
    }

    /*
     * ============================================
     * MOSTRAR SIMULADOR
     * ============================================
     */

    showSimulator() {

        this.simulatorPanel?.classList.remove(
            "hidden"
        );
    }

    /*
     * ============================================
     * CONFIGURAR INTERFAZ POR ROL
     * ============================================
     */

    setCaregiverMode(isCaregiver) {

        this.isCaregiver =
            Boolean(isCaregiver);

        if (this.caregiverIntro) {

            this.caregiverIntro.hidden =
                !this.isCaregiver;
        }

        if (this.caregiverNavigation) {

            this.caregiverNavigation.hidden =
                !this.isCaregiver;
        }

        if (this.caregiverSummary) {

            this.caregiverSummary.hidden =
                !this.isCaregiver;
        }

        if (this.deviceIntro) {

            this.deviceIntro.hidden =
                this.isCaregiver;
        }

        if (this.deviceInfoPanel) {

            this.deviceInfoPanel.hidden =
                this.isCaregiver;
        }

        if (this.notificationsPanel) {

            this.notificationsPanel.hidden =
                !this.isCaregiver;

            this.notificationsPanel.classList.toggle(
                "hidden",
                !this.isCaregiver
            );
        }

        if (this.bluetoothPanel) {

            this.bluetoothPanel.hidden =
                this.isCaregiver;
        }

        if (this.mpuPanel) {

            this.mpuPanel.hidden =
                this.isCaregiver;
        }

        if (this.centerMapButton) {

            this.centerMapButton.hidden =
                !this.isCaregiver;
        }

        if (this.isCaregiver) {

            this.openTab("inicio");

        } else {

            for (
                const [name, panel]
                of Object.entries(this.tabPanels)
                ) {

                panel?.classList.toggle(
                    "sc-active",
                    name === "inicio"
                );
            }
        }

        this.hideObstacleCard();

        this.refreshCombinedStatus();
    }

    /*
     * ============================================
     * ACTUALIZAR ESTADO FIREBASE
     * ============================================
     */

    updateStatus(status, isOnline) {

        this.lastDeviceStatus = status;

        this.lastDeviceOnline =
            Boolean(isOnline);

        this.refreshCombinedStatus();
    }

    /*
     * ============================================
     * GUARDAR UBICACIÓN DEL TELÉFONO
     * ============================================
     */

    setPhoneLocation(
        location,
        receivedAt = Date.now()
    ) {

        const valid = Boolean(
            location &&
            location.gpsFix === true &&
            Number.isFinite(location.lat) &&
            Number.isFinite(location.lng) &&
            location.lat >= -90 &&
            location.lat <= 90 &&
            location.lng >= -180 &&
            location.lng <= 180
        );

        if (valid) {

            this.phoneLocation = {
                lat: location.lat,
                lng: location.lng,
                gpsFix: true
            };

            this.phoneLocationAt =
                Number(receivedAt);

        } else {

            this.phoneLocation = null;
            this.phoneLocationAt = 0;
        }

        this.refreshCombinedStatus();
    }

    /*
     * ============================================
     * REGISTRAR CAÍDA PENDIENTE
     * ============================================
     */

    setPendingFall(value) {

        this.pendingFall =
            Boolean(value);

        this.refreshCombinedStatus();
    }

    /*
     * ============================================
     * ACTUALIZAR ESTADO GENERAL
     * ============================================
     */

    refreshCombinedStatus() {

        const status = this.lastDeviceStatus;
        const now = Date.now();

        const recentDevice =
            this.lastDeviceOnline;

        const gpsRecent = Boolean(
            this.phoneLocation &&
            this.phoneLocationAt > 0 &&
            now - this.phoneLocationAt <= 60000 &&
            this.phoneLocationAt <= now + 10000
        );

        /*
         * ESTADO DE MONITOREO.
         */

        let connectionText =
            "Sin datos recientes del bastón";

        if (recentDevice) {

            connectionText =
                "Datos recientes del bastón";

        } else if (
            this.bluetoothConnected &&
            !this.isCaregiver
        ) {

            connectionText =
                "ESP32 conectado por Bluetooth";

        } else if (gpsRecent) {

            connectionText =
                "Ubicación reciente del teléfono";
        }

        if (this.connectionStatus) {

            this.connectionStatus.textContent =
                connectionText;
        }

        const visuallyOnline = Boolean(
            recentDevice ||
            gpsRecent ||
            (
                this.bluetoothConnected &&
                !this.isCaregiver
            )
        );

        this.connectionIndicator?.classList.toggle(
            "online",
            visuallyOnline
        );

        this.connectionIndicator?.classList.toggle(
            "offline",
            !visuallyOnline
        );

        /*
         * ÚLTIMA ACTUALIZACIÓN.
         */

        if (this.lastSeenText) {

            if (
                recentDevice &&
                status?.lastSeen
            ) {

                this.lastSeenText.textContent =
                    "Último dato del bastón: " +
                    this.formatDate(status.lastSeen);

            } else if (gpsRecent) {

                this.lastSeenText.textContent =
                    "GPS del teléfono actualizado: " +
                    this.formatDate(
                        this.phoneLocationAt
                    );

            } else if (status?.lastSeen) {

                this.lastSeenText.textContent =
                    "Último registro: " +
                    this.formatDate(status.lastSeen) +
                    " (antiguo)";

            } else {

                this.lastSeenText.textContent =
                    "Sin datos recientes";
            }
        }

        /*
         * POSIBLES CAÍDAS.
         */

        if (this.fallValue) {

            this.fallValue.textContent =
                this.pendingFall
                    ? "Posible caída pendiente"
                    : "Sin caída pendiente";
        }

        this.fallCard?.classList.toggle(
            "fall-alert",
            this.pendingFall
        );

        /*
         * GPS DEL TELÉFONO O DEL DISPOSITIVO.
         */

        const deviceGPS = Boolean(
            recentDevice &&
            status &&
            typeof status.hasLocation ===
            "function" &&
            status.hasLocation()
        );

        const gpsAvailable =
            gpsRecent || deviceGPS;

        this.gpsWarning?.classList.toggle(
            "hidden",
            gpsAvailable
        );

        if (this.coordinatesText) {

            if (gpsRecent) {

                this.coordinatesText.textContent =
                    this.phoneLocation.lat.toFixed(6) +
                    ", " +
                    this.phoneLocation.lng.toFixed(6) +
                    " (teléfono)";

            } else if (deviceGPS) {

                this.coordinatesText.textContent =
                    Number(status.lat).toFixed(6) +
                    ", " +
                    Number(status.lng).toFixed(6);

            } else {

                this.coordinatesText.textContent =
                    "Sin ubicación GPS reciente";
            }
        }

        // Mantener oculta la tarjeta obsoleta.
        if (
            this.obstacleCard &&
            !this.obstacleCard.hidden
        ) {

            this.hideObstacleCard();
        }
    }

    /*
     * ============================================
     * RENDERIZAR ALERTAS
     * ============================================
     */

    renderAlerts(alerts, onAttend) {

        const records = Array.isArray(alerts)
            ? alerts
            : [];

        this.currentAlerts = records;

        const pending = records.filter(
            (alert) => alert.attended !== true
        );

        const attended = records.filter(
            (alert) => alert.attended === true
        );

        /*
         * Actualizar caídas pendientes.
         */

        this.setPendingFall(
            pending.some(
                (alert) => alert.type === "fall"
            )
        );

        this.updateMPUStatus();

        /*
         * CONTADORES.
         */

        if (this.pendingAlertCount) {

            this.pendingAlertCount.textContent =
                String(pending.length);

            this.pendingAlertCount.hidden =
                pending.length === 0;
        }

        if (this.pendingAlertCountSecondary) {

            this.pendingAlertCountSecondary.textContent =
                pending.length === 1
                    ? "1 pendiente"
                    : pending.length + " pendientes";
        }

        /*
         * ALERTAS PENDIENTES.
         */

        if (this.alertsList) {

            this.alertsList.replaceChildren();

            if (pending.length === 0) {

                const empty =
                    document.createElement("div");

                empty.className = "sc-empty";

                empty.textContent =
                    "No hay emergencias pendientes.";

                this.alertsList.appendChild(empty);

            } else {

                for (const alert of pending) {

                    const element =
                        this.createAlertElement(
                            alert,
                            onAttend
                        );

                    this.alertsList.appendChild(
                        element
                    );
                }
            }
        }

        if (this.noPendingAlerts) {

            this.noPendingAlerts.hidden = true;
        }

        /*
         * HISTORIAL.
         */

        if (this.historyAlertsList) {

            this.historyAlertsList.replaceChildren();

            if (attended.length === 0) {

                const empty =
                    document.createElement("div");

                empty.className = "sc-empty";

                empty.textContent =
                    "No existen alertas atendidas " +
                    "en los registros cargados.";

                this.historyAlertsList.appendChild(
                    empty
                );

            } else {

                for (const alert of attended) {

                    const element =
                        this.createAlertElement(
                            alert,
                            onAttend
                        );

                    this.historyAlertsList.appendChild(
                        element
                    );
                }
            }
        }
    }

    /*
     * ============================================
     * CREAR ELEMENTO DE ALERTA
     * ============================================
     */

    createAlertElement(item, onAttend) {

        const article =
            document.createElement("article");

        article.className =
            "alert-item " +
            (
                item.attended === true
                    ? "attended"
                    : "unattended"
            );

        /*
         * TÍTULO Y FECHA.
         */

        const header =
            document.createElement("div");

        header.className = "alert-header";

        const type =
            document.createElement("span");

        type.className = "alert-type";

        const isFall =
            item.type === "fall";

        type.textContent = isFall
            ? "⚠️ Posible caída detectada"
            : "🚨 Emergencia SOS";

        const time =
            document.createElement("span");

        time.className = "alert-time";

        time.textContent =
            this.formatDate(
                item.createdAt
            );

        header.append(type, time);

        article.appendChild(header);

        /*
         * DESCRIPCIÓN.
         */

        const description =
            document.createElement("p");

        description.className =
            "sc-device-note";

        description.textContent = isFall
            ? "El bastón registró un evento de posible caída."
            : "Se recibió una solicitud de ayuda SOS.";

        description.style.marginBottom = "10px";

        article.appendChild(description);

        /*
         * UBICACIÓN.
         */

        const locationRow =
            document.createElement("div");

        locationRow.style.marginBottom = "12px";

        const located = Boolean(
            item.gpsFix === true &&
            Number.isFinite(Number(item.lat)) &&
            Number.isFinite(Number(item.lng)) &&
            Number(item.lat) >= -90 &&
            Number(item.lat) <= 90 &&
            Number(item.lng) >= -180 &&
            Number(item.lng) <= 180
        );

        if (located) {

            const coordinates =
                document.createElement("p");

            coordinates.className =
                "sc-device-note";

            coordinates.textContent =
                "Coordenadas: " +
                Number(item.lat).toFixed(6) +
                ", " +
                Number(item.lng).toFixed(6);

            const link =
                document.createElement("a");

            link.className = "alert-location";

            link.href =
                "https://maps.google.com/?q=" +
                encodeURIComponent(
                    item.lat + "," + item.lng
                );

            link.target = "_blank";

            link.rel = "noopener noreferrer";

            link.textContent =
                "📍 Ver lugar de la alerta";

            locationRow.append(
                coordinates,
                link
            );

        } else {

            const noGPS =
                document.createElement("span");

            noGPS.className = "alert-time";

            noGPS.textContent =
                "📍 Ubicación GPS no disponible";

            locationRow.appendChild(noGPS);
        }

        article.appendChild(locationRow);

        /*
         * ESTADO DE ATENCIÓN.
         */

        if (item.attended === true) {

            const attendedLabel =
                document.createElement("span");

            attendedLabel.className =
                "attended-label";

            attendedLabel.textContent =
                "✓ Alerta atendida";

            article.appendChild(
                attendedLabel
            );

        } else if (
            this.isCaregiver &&
            typeof onAttend === "function"
        ) {

            const button =
                document.createElement("button");

            button.type = "button";

            button.className =
                "secondary-button";

            button.textContent =
                "Marcar como atendida";

            button.addEventListener(
                "click",
                async () => {

                    button.disabled = true;

                    button.textContent =
                        "Guardando...";

                    try {

                        await onAttend(item.id);

                        button.textContent =
                            "Actualizando...";

                    } catch (error) {

                        console.error(
                            "Error atendiendo alerta:",
                            error
                        );

                        button.disabled = false;

                        button.textContent =
                            "Marcar como atendida";

                        window.alert(
                            error.message
                        );
                    }
                }
            );

            article.appendChild(button);
        }

        return article;
    }

    /*
     * ============================================
     * CERRAR SESIÓN
     * ============================================
     */

    bindLogout(callback) {

        this.logoutButton?.addEventListener(
            "click",
            callback
        );
    }

    /*
     * ============================================
     * CENTRAR MAPA
     * ============================================
     */

    bindCenterMap(callback) {

        this.centerMapButton?.addEventListener(
            "click",
            callback
        );
    }

    /*
     * ============================================
     * SIMULADOR
     * ============================================
     */

    bindSimulator(callbacks) {

        if (this.simulatorBound) {
            return;
        }

        this.simulateNormalButton?.addEventListener(
            "click",
            callbacks.normal
        );

        this.simulateObstacleButton?.addEventListener(
            "click",
            callbacks.obstacle
        );

        this.simulateFallButton?.addEventListener(
            "click",
            callbacks.fall
        );

        this.simulateSosButton?.addEventListener(
            "click",
            callbacks.sos
        );

        this.simulateGpsButton?.addEventListener(
            "click",
            callbacks.gps
        );

        this.simulatorBound = true;
    }

    /*
     * ============================================
     * FORMATEAR FECHA Y HORA
     * ============================================
     */

    formatDate(timestamp) {

        if (!timestamp) {
            return "Hora no disponible";
        }

        const date = new Date(timestamp);

        if (Number.isNaN(date.getTime())) {
            return "Fecha no válida";
        }

        return new Intl.DateTimeFormat(
            "es-GT",
            {
                dateStyle: "short",
                timeStyle: "medium"
            }
        ).format(date);
    }
}
