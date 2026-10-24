
export class DashboardView {

    constructor() {

        const get = (id) =>
            document.getElementById(id);

        this.screen = get("dashboardScreen");

        this.connectionStatus = get("connectionStatus");
        this.connectionIndicator = get("connectionIndicator");
        this.lastSeenText = get("lastSeenText");

        this.gpsWarning = get("gpsWarning");
        this.obstacleValue = get("obstacleValue");
        this.fallValue = get("fallValue");
        this.fallCard = get("fallCard");
        this.coordinatesText = get("coordinatesText");

        this.alertsList = get("alertsList");

        this.logoutButton = get("logoutButton");
        this.centerMapButton = get("centerMapButton");

        this.simulatorPanel = get("simulatorPanel");
        this.simulateNormalButton = get("simulateNormalButton");
        this.simulateObstacleButton = get("simulateObstacleButton");
        this.simulateFallButton = get("simulateFallButton");
        this.simulateSosButton = get("simulateSosButton");
        this.simulateGpsButton = get("simulateGpsButton");

        // Elementos Bluetooth BLE.
        this.bluetoothButton = null;
        this.bluetoothStatus = null;
        this.bluetoothMessage = null;

        this.bluetoothBound = false;
        this.simulatorBound = false;

        this.createBluetoothPanel();
    }


    /*
     * ========================================
     * PANEL BLUETOOTH BLE
     * ========================================
     *
     * Se crea desde JavaScript para evitar
     * modificar el HTML existente.
     */
    createBluetoothPanel() {

        if (document.getElementById("bluetoothPanel")) {

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

        panel.style.cssText = `
            padding: 18px;
            margin: 15px 0;
            border-radius: 12px;
            border: 1px solid #dce3eb;
            background: #ffffff;
            color: #263238;
            box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        `;

        const title = document.createElement("h3");
        title.textContent = "Bluetooth del bastón";

        title.style.cssText = `
            margin: 0 0 12px;
            font-size: 18px;
            color: #263238;
        `;

        this.bluetoothStatus = document.createElement("p");
        this.bluetoothStatus.id = "bluetoothStatus";
        this.bluetoothStatus.textContent =
            "Estado: Desconectado";

        this.bluetoothStatus.style.cssText = `
            margin: 8px 0;
            font-size: 14px;
            color: #a94442;
        `;

        this.bluetoothButton =
            document.createElement("button");

        this.bluetoothButton.id =
            "connectBluetoothButton";

        this.bluetoothButton.type = "button";

        this.bluetoothButton.textContent =
            "Conectar SmartCane";

        this.bluetoothButton.className =
            "primary-button";

        this.bluetoothButton.style.cssText = `
            display: block;
            width: 100%;
            max-width: 300px;
            padding: 12px 16px;
            margin-top: 12px;
            background: #2563eb;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
        `;

        this.bluetoothMessage =
            document.createElement("p");

        this.bluetoothMessage.id =
            "bluetoothMessage";

        this.bluetoothMessage.textContent =
            "Esperando conexión con el ESP32.";

        this.bluetoothMessage.style.cssText = `
            margin: 12px 0 0;
            color: #5f6875;
            font-size: 13px;
            overflow-wrap: anywhere;
        `;

        panel.append(
            title,
            this.bluetoothStatus,
            this.bluetoothButton,
            this.bluetoothMessage
        );

        /*
         * Colocar el panel cerca del mapa.
         * Si no encuentra el botón del mapa,
         * lo inserta al inicio del dashboard.
         */
        if (
            this.centerMapButton &&
            this.centerMapButton.parentElement
        ) {

            this.centerMapButton.parentElement
                .insertAdjacentElement(
                    "afterend",
                    panel
                );

        } else if (this.screen) {

            this.screen.prepend(panel);

        }
    }


    /*
     * ========================================
     * BOTÓN DE CONEXIÓN BLE
     * ========================================
     */
    bindBluetooth(callback) {

        if (!this.bluetoothButton) {
            console.error(
                "No se encontró el botón Bluetooth."
            );
            return;
        }

        if (this.bluetoothBound) {
            return;
        }

        this.bluetoothButton.addEventListener(
            "click",
            async () => {

                this.updateBluetoothStatus("connecting");

                try {

                    await callback();

                } catch (error) {

                    console.error(
                        "Error Bluetooth:",
                        error
                    );

                    this.updateBluetoothStatus("error");

                }

            }
        );

        this.bluetoothBound = true;
    }


    /*
     * ========================================
     * ACTUALIZAR ESTADO BLUETOOTH
     * ========================================
     */
    updateBluetoothStatus(status) {

        if (!this.bluetoothStatus) {
            return;
        }

        const states = {

            connected: {
                text: "Estado: Conectado a SmartCane",
                color: "#16803c",
                button: "SmartCane conectado",
                disabled: true
            },

            disconnected: {
                text: "Estado: Desconectado",
                color: "#a94442",
                button: "Conectar SmartCane",
                disabled: false
            },

            connecting: {
                text: "Estado: Conectando...",
                color: "#b7791f",
                button: "Conectando...",
                disabled: true
            },

            error: {
                text: "Estado: Error de conexión",
                color: "#c53030",
                button: "Reintentar conexión",
                disabled: false
            }

        };

        const selected =
            states[status] || states.disconnected;

        this.bluetoothStatus.textContent =
            selected.text;

        this.bluetoothStatus.style.color =
            selected.color;

        if (this.bluetoothButton) {

            this.bluetoothButton.textContent =
                selected.button;

            this.bluetoothButton.disabled =
                selected.disabled;

            this.bluetoothButton.style.opacity =
                selected.disabled ? "0.65" : "1";

        }
    }


    /*
     * ========================================
     * MOSTRAR MENSAJE BLE
     * ========================================
     */
    updateBluetoothMessage(message) {

        if (!this.bluetoothMessage) {
            return;
        }

        this.bluetoothMessage.textContent =
            "Última señal BLE: " + message;

        if (message === "SOS: Necesito ayuda") {

            this.bluetoothMessage.style.color =
                "#c53030";

            this.bluetoothMessage.style.fontWeight =
                "bold";

        } else {

            this.bluetoothMessage.style.color =
                "#5f6875";

            this.bluetoothMessage.style.fontWeight =
                "normal";
        }
    }


    /*
     * ========================================
     * MOSTRAR Y OCULTAR DASHBOARD
     * ========================================
     */
    show() {

        this.screen.classList.remove("hidden");

    }

    hide() {

        this.screen.classList.add("hidden");

        this.updateBluetoothStatus("disconnected");

    }


    /*
     * ========================================
     * MOSTRAR SIMULADOR
     * ========================================
     */
    showSimulator() {

        this.simulatorPanel.classList.remove("hidden");

    }


    /*
     * ========================================
     * ACTUALIZAR ESTADO DEL BASTÓN
     * ========================================
     *
     * Este indicador sigue dependiendo
     * del estado almacenado en Firebase.
     * NO representa la conexión Bluetooth.
     */
    updateStatus(status, isOnline) {

        this.connectionStatus.textContent =
            isOnline
                ? "En línea"
                : "Sin conexión";

        this.connectionIndicator.classList.toggle(
            "online",
            isOnline
        );

        this.connectionIndicator.classList.toggle(
            "offline",
            !isOnline
        );

        if (!status) {
            return;
        }

        if (status.lastSeen) {

            this.lastSeenText.textContent =
                `Último dato: ${
                    this.formatDate(status.lastSeen)
                }`;

        } else {

            this.lastSeenText.textContent =
                "Sin datos recientes";

        }

        if (
            status.obstacleCm === null ||
            status.obstacleCm === undefined
        ) {

            this.obstacleValue.textContent = "--";

        } else {

            this.obstacleValue.textContent =
                Number(status.obstacleCm).toFixed(0);

        }

        if (status.fallDetected) {

            this.fallValue.textContent =
                "DETECTADA";

            this.fallCard.classList.add(
                "fall-alert"
            );

        } else {

            this.fallValue.textContent =
                "Sin detectar";

            this.fallCard.classList.remove(
                "fall-alert"
            );

        }

        const gpsAvailable =
            status.hasLocation();

        this.gpsWarning.classList.toggle(
            "hidden",
            gpsAvailable
        );

        if (gpsAvailable) {

            this.coordinatesText.textContent =
                `${status.lat.toFixed(6)}, ${status.lng.toFixed(6)}`;

        } else {

            this.coordinatesText.textContent =
                "Ubicación GPS no disponible";

        }
    }


    /*
     * ========================================
     * MOSTRAR ALERTAS
     * ========================================
     */
    renderAlerts(alerts, onAttend) {

        if (!alerts.length) {

            this.alertsList.innerHTML = `
                <div class="empty-state">
                    No hay alertas recientes.
                </div>
            `;

            return;
        }

        this.alertsList.innerHTML = "";

        for (const item of alerts) {

            const element =
                this.createAlertElement(
                    item,
                    onAttend
                );

            this.alertsList.appendChild(element);
        }
    }


    /*
     * ========================================
     * CREAR ELEMENTO DE ALERTA
     * ========================================
     */
    createAlertElement(item, onAttend) {

        const article =
            document.createElement("article");

        article.className =
            `alert-item ${
                item.attended
                    ? "attended"
                    : "unattended"
            }`;

        const header =
            document.createElement("div");

        header.className = "alert-header";

        const type =
            document.createElement("span");

        type.className = "alert-type";

        type.textContent =
            item.type === "fall"
                ? "⚠️ Posible caída"
                : "🚨 SOS";

        const time =
            document.createElement("span");

        time.className = "alert-time";

        time.textContent =
            this.formatDate(item.createdAt);

        header.append(type, time);

        article.appendChild(header);

        if (item.isLocated()) {

            const location =
                document.createElement("a");

            location.className =
                "alert-location";

            location.href =
                `https://maps.google.com/?q=${item.lat},${item.lng}`;

            location.target = "_blank";

            location.rel =
                "noopener noreferrer";

            location.textContent =
                "📍 Ver ubicación";

            article.appendChild(location);

        } else {

            const noGps =
                document.createElement("span");

            noGps.className =
                "alert-time";

            noGps.textContent =
                "GPS sin señal";

            article.appendChild(noGps);
        }

        if (item.attended) {

            const attended =
                document.createElement("span");

            attended.className =
                "attended-label";

            attended.textContent = "✓ Atendida";

            article.appendChild(attended);

        } else {

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

                    } catch (error) {

                        button.disabled = false;

                        button.textContent =
                            "Marcar como atendida";

                        window.alert(error.message);

                    }
                }
            );

            article.appendChild(button);
        }

        return article;
    }


    /*
     * ========================================
     * CERRAR SESIÓN
     * ========================================
     */
    bindLogout(callback) {

        this.logoutButton.addEventListener(
            "click",
            callback
        );
    }


    /*
     * ========================================
     * CENTRAR MAPA
     * ========================================
     */
    bindCenterMap(callback) {

        this.centerMapButton.addEventListener(
            "click",
            callback
        );
    }


    /*
     * ========================================
     * BOTONES DEL SIMULADOR
     * ========================================
     */
    bindSimulator(callbacks) {

        if (this.simulatorBound) {
            return;
        }

        this.simulateNormalButton.addEventListener(
            "click",
            callbacks.normal
        );

        this.simulateObstacleButton.addEventListener(
            "click",
            callbacks.obstacle
        );

        this.simulateFallButton.addEventListener(
            "click",
            callbacks.fall
        );

        this.simulateSosButton.addEventListener(
            "click",
            callbacks.sos
        );

        this.simulateGpsButton.addEventListener(
            "click",
            callbacks.gps
        );

        this.simulatorBound = true;
    }


    /*
     * ========================================
     * FORMATO DE FECHA
     * ========================================
     */
    formatDate(timestamp) {

        if (!timestamp) {
            return "Hora no disponible";
        }

        return new Intl.DateTimeFormat(
            "es-GT",
            {
                dateStyle: "short",
                timeStyle: "medium"
            }
        ).format(
            new Date(timestamp)
        );
    }
}
