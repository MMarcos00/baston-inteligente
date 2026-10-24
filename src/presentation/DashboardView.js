
/*
 * ============================================
 * SMARTCANE
 * DashboardView.js
 * ============================================
 *
 * Vista para dos tipos de usuarios:
 *
 * BASTÓN:
 * - Estado de monitoreo
 * - GPS y obstáculos
 * - Conexión Bluetooth BLE
 * - Sin controles de atención
 *
 * CUIDADOR:
 * - Inicio
 * - Ubicación y recorrido
 * - Alertas pendientes
 * - Historial de emergencias
 * - Notificaciones
 *
 * Mantiene compatibilidad con AppController.
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

        // Sensores.
        this.gpsWarning = get("gpsWarning");
        this.obstacleValue = get("obstacleValue");
        this.fallValue = get("fallValue");
        this.fallCard = get("fallCard");
        this.coordinatesText = get("coordinatesText");

        // Alertas e historial.
        this.alertsList = get("alertsList");
        this.historyAlertsList = get("historyAlertsList");

        this.pendingAlertCount = get("pendingAlertCount");
        this.pendingAlertCountSecondary =
            get("pendingAlertCountSecondary");

        this.noPendingAlerts = get("noPendingAlerts");

        // Controles generales.
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

        // Secciones de cada rol.
        this.caregiverIntro = get("caregiverIntro");
        this.caregiverNavigation =
            get("caregiverNavigation");
        this.caregiverSummary = get("caregiverSummary");

        this.deviceIntro = get("deviceIntro");
        this.deviceInfoPanel = get("deviceInfoPanel");

        this.notificationsPanel =
            get("notificationsPanel");

        // Pestañas.
        this.tabPanels = {
            inicio: get("scPanelInicio"),
            mapa: get("scPanelMapa"),
            alertas: get("scPanelAlertas"),
            historial: get("scPanelHistorial"),
            notificaciones: get("scPanelNotificaciones")
        };

        // Bluetooth.
        this.bluetoothPanel = null;
        this.bluetoothButton = null;
        this.bluetoothStatus = null;
        this.bluetoothMessage = null;

        this.bluetoothConnected = false;
        this.bluetoothBound = false;

        // Evitar enlazar el simulador varias veces.
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

        // Mapa.
        this.mapAdapter = null;

        this.createBluetoothPanel();
        this.configureTabs();
    }


    /*
     * ============================================
     * CONFIGURAR NAVEGACIÓN DEL CUIDADOR
     * ============================================
     */
    configureTabs() {

        const buttons = document.querySelectorAll(
            "[data-sc-tab]"
        );

        for (const button of buttons) {

            button.addEventListener(
                "click",
                () => {

                    if (!this.isCaregiver) {
                        return;
                    }

                    this.openTab(
                        button.dataset.scTab
                    );
                }
            );
        }

        const shortcuts = document.querySelectorAll(
            "[data-sc-open]"
        );

        for (const button of shortcuts) {

            button.addEventListener(
                "click",
                () => {

                    if (!this.isCaregiver) {
                        return;
                    }

                    this.openTab(
                        button.dataset.scOpen
                    );
                }
            );
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
                String(
                    button.dataset.scTab === tabName
                )
            );
        }

        /*
         * Leaflet necesita recalcular su tamaño
         * cuando se abre la pestaña del mapa.
         */
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
     * RECIBIR ADAPTADOR DEL MAPA
     * ============================================
     *
     * Es opcional porque AppController también
     * administra el mapa directamente.
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

        const existing =
            document.getElementById(
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

        const panel = document.createElement(
            "section"
        );

        panel.id = "bluetoothPanel";

        panel.className = "sc-card";

        panel.style.cssText = `
            margin-top: 18px;
            padding: 20px;
            border-radius: 16px;
            background: #ffffff;
            border: 1px solid #e2e8f0;
        `;

        const title =
            document.createElement("h3");

        title.textContent =
            "Conexión con el bastón";

        title.style.cssText = `
            margin: 0 0 12px;
            font-size: 19px;
            color: #101b36;
        `;

        this.bluetoothStatus =
            document.createElement("p");

        this.bluetoothStatus.id =
            "bluetoothStatus";

        this.bluetoothStatus.textContent =
            "Estado: Desconectado";

        this.bluetoothStatus.style.cssText = `
            font-size: 14px;
            color: #b91c1c;
            margin-bottom: 14px;
        `;

        this.bluetoothButton =
            document.createElement("button");

        this.bluetoothButton.id =
            "connectBluetoothButton";

        this.bluetoothButton.type =
            "button";

        this.bluetoothButton.className =
            "primary-button";

        this.bluetoothButton.textContent =
            "Conectar SmartCane";

        this.bluetoothButton.style.cssText = `
            width: 100%;
            max-width: 340px;
            padding: 14px 18px;
            border-radius: 11px;
            background: #2563eb;
            color: #ffffff;
            font-size: 15px;
            font-weight: 700;
            cursor: pointer;
        `;

        this.bluetoothMessage =
            document.createElement("p");

        this.bluetoothMessage.id =
            "bluetoothMessage";

        this.bluetoothMessage.textContent =
            "Esperando conexión con el ESP32.";

        this.bluetoothMessage.style.cssText = `
            margin: 14px 0 0;
            color: #64748b;
            font-size: 13px;
            overflow-wrap: anywhere;
        `;

        panel.append(
            title,
            this.bluetoothStatus,
            this.bluetoothButton,
            this.bluetoothMessage
        );

        this.bluetoothPanel = panel;

        /*
         * Colocar Bluetooth dentro de la
         * interfaz del usuario bastón.
         */
        if (this.deviceInfoPanel) {

            this.deviceInfoPanel.appendChild(
                panel
            );

        } else if (this.screen) {

            this.screen.appendChild(
                panel
            );
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

        this.bluetoothMessage.textContent =
            "Última señal BLE: " + message;

        const isSOS =
            String(message).includes("SOS");

        this.bluetoothMessage.style.color =
            isSOS
                ? "#b91c1c"
                : "#64748b";

        this.bluetoothMessage.style.fontWeight =
            isSOS
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

        /*
         * Mostrar navegación y secciones
         * solamente al cuidador.
         */
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

        /*
         * Interfaz sencilla del bastón.
         */
        if (this.deviceIntro) {

            this.deviceIntro.hidden =
                this.isCaregiver;
        }

        if (this.deviceInfoPanel) {

            this.deviceInfoPanel.hidden =
                this.isCaregiver;
        }

        /*
         * Notificaciones exclusivas
         * de la cuenta del cuidador.
         */
        if (this.notificationsPanel) {

            this.notificationsPanel.hidden =
                !this.isCaregiver;

            this.notificationsPanel.classList.toggle(
                "hidden",
                !this.isCaregiver
            );
        }

        /*
         * Bluetooth solamente al bastón.
         */
        if (this.bluetoothPanel) {

            this.bluetoothPanel.hidden =
                this.isCaregiver;
        }

        /*
         * Botón de centrar mapa
         * para el cuidador.
         */
        if (this.centerMapButton) {

            this.centerMapButton.hidden =
                !this.isCaregiver;
        }

        /*
         * Restablecer la pestaña inicial.
         */
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

        this.refreshCombinedStatus();
    }


    /*
     * ============================================
     * GUARDAR ESTADO DE FIREBASE
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
     * GUARDAR GPS DEL TELÉFONO
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
     * ACTUALIZAR ESTADO COMBINADO
     * ============================================
     */
    refreshCombinedStatus() {

        const status =
            this.lastDeviceStatus;

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
         * ESTADO GENERAL.
         *
         * GPS del teléfono no significa que
         * el ESP32 esté conectado por BLE.
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
                    this.formatDate(
                        status.lastSeen
                    );

            } else if (gpsRecent) {

                this.lastSeenText.textContent =
                    "GPS del teléfono actualizado: " +
                    this.formatDate(
                        this.phoneLocationAt
                    );

            } else if (status?.lastSeen) {

                this.lastSeenText.textContent =
                    "Último registro: " +
                    this.formatDate(
                        status.lastSeen
                    ) +
                    " (antiguo)";

            } else {

                this.lastSeenText.textContent =
                    "Sin datos recientes";
            }
        }


        /*
         * SENSOR DE OBSTÁCULOS.
         */
        if (this.obstacleValue) {

            const value = status?.obstacleCm;

            if (
                recentDevice &&
                value !== null &&
                value !== undefined &&
                Number.isFinite(
                    Number(value)
                )
            ) {

                this.obstacleValue.textContent =
                    Number(value).toFixed(0);

            } else {

                this.obstacleValue.textContent =
                    "--";
            }
        }


        /*
         * CAÍDAS.
         *
         * Una caída atendida queda en
         * el historial, no como pendiente.
         */
        if (this.fallValue) {

            this.fallValue.textContent =
                this.pendingFall
                    ? "Caída pendiente"
                    : "Sin caída pendiente";
        }

        this.fallCard?.classList.toggle(
            "fall-alert",
            this.pendingFall
        );


        /*
         * GPS DEL TELÉFONO O DISPOSITIVO.
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
                    status.lat.toFixed(6) +
                    ", " +
                    status.lng.toFixed(6);

            } else {

                this.coordinatesText.textContent =
                    "Sin ubicación GPS reciente";
            }
        }
    }


    /*
     * ============================================
     * RENDERIZAR ALERTAS DE FIREBASE
     * ============================================
     *
     * Separa:
     * - Pendientes
     * - Historial atendido
     */
    renderAlerts(alerts, onAttend) {

        const records =
            Array.isArray(alerts)
                ? alerts
                : [];

        this.currentAlerts = records;

        const pending =
            records.filter(
                (alert) =>
                    alert.attended !== true
            );

        const attended =
            records.filter(
                (alert) =>
                    alert.attended === true
            );

        /*
         * Actualizar indicador de caídas.
         */
        this.setPendingFall(
            pending.some(
                (alert) =>
                    alert.type === "fall"
            )
        );


        /*
         * Actualizar contadores.
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
         * RENDERIZAR PENDIENTES.
         */
        if (this.alertsList) {

            this.alertsList.replaceChildren();

            if (pending.length === 0) {

                const empty =
                    document.createElement("div");

                empty.className =
                    "sc-empty";

                empty.textContent =
                    "No hay emergencias pendientes.";

                this.alertsList.appendChild(
                    empty
                );

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

            // Ya mostramos el vacío en alertsList.
            this.noPendingAlerts.hidden = true;
        }


        /*
         * RENDERIZAR HISTORIAL ATENDIDO.
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
                item.attended
                    ? "attended"
                    : "unattended"
            );

        /*
         * TÍTULO Y FECHA.
         */
        const header =
            document.createElement("div");

        header.className =
            "alert-header";

        const type =
            document.createElement("span");

        type.className =
            "alert-type";

        type.textContent =
            item.type === "fall"
                ? "⚠️ Posible caída"
                : "🚨 Emergencia SOS";

        const time =
            document.createElement("span");

        time.className =
            "alert-time";

        time.textContent =
            this.formatDate(
                item.createdAt
            );

        header.append(
            type,
            time
        );

        article.appendChild(
            header
        );


        /*
         * UBICACIÓN DE LA EMERGENCIA.
         */
        const locationRow =
            document.createElement("div");

        locationRow.style.marginBottom =
            "12px";

        if (
            typeof item.isLocated === "function" &&
            item.isLocated()
        ) {

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

            link.className =
                "alert-location";

            link.href =
                "https://maps.google.com/?q=" +
                encodeURIComponent(
                    item.lat + "," + item.lng
                );

            link.target =
                "_blank";

            link.rel =
                "noopener noreferrer";

            link.textContent =
                "📍 Ver lugar de la alerta";

            locationRow.append(
                coordinates,
                link
            );

        } else {

            const noGPS =
                document.createElement("span");

            noGPS.className =
                "alert-time";

            noGPS.textContent =
                "Ubicación no disponible";

            locationRow.appendChild(
                noGPS
            );
        }

        article.appendChild(
            locationRow
        );


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

            button.type =
                "button";

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

                        await onAttend(
                            item.id
                        );

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

            article.appendChild(
                button
            );
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

        const date =
            new Date(timestamp);

        if (
            Number.isNaN(
                date.getTime()
            )
        ) {

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
