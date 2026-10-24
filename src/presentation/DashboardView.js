
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

        // Bluetooth BLE.
        this.bluetoothButton = null;
        this.bluetoothStatus = null;
        this.bluetoothMessage = null;

        this.bluetoothBound = false;
        this.simulatorBound = false;

        // Estado del dispositivo desde Firebase.
        this.lastDeviceStatus = null;
        this.lastDeviceOnline = false;

        this.createBluetoothPanel();
    }


    /*
     * ========================================
     * CREAR PANEL BLUETOOTH
     * ========================================
     */
    createBluetoothPanel() {

        const existing =
            document.getElementById("bluetoothPanel");

        if (existing) {

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

        this.bluetoothStatus =
            document.createElement("p");

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
     * BOTÓN CONECTAR BLUETOOTH
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
     * ========================================
     * ESTADO BLUETOOTH DEL ESP32
     * ========================================
     *
     * Este estado es independiente
     * de Firebase status/lastSeen.
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
     * MOSTRAR MENSAJES DEL ESP32
     * ========================================
     */
    updateBluetoothMessage(message) {

        if (!this.bluetoothMessage) {
            return;
        }

        this.bluetoothMessage.textContent =
            "Última señal BLE: " + message;

        const isSos =
            message === "SOS: Necesito ayuda";

        this.bluetoothMessage.style.color =
            isSos ? "#c53030" : "#5f6875";

        this.bluetoothMessage.style.fontWeight =
            isSos ? "bold" : "normal";
    }


    /*
     * ========================================
     * MOSTRAR DASHBOARD
     * ========================================
     */
    show() {

        this.screen.classList.remove("hidden");
    }


    /*
     * ========================================
     * OCULTAR DASHBOARD
     * ========================================
     */
    hide() {

        this.screen.classList.add("hidden");

        this.updateBluetoothStatus(
            "disconnected"
        );
    }


    /*
     * ========================================
     * MOSTRAR SIMULADOR
     * ========================================
     */
    showSimulator() {

        this.simulatorPanel.classList.remove(
            "hidden"
        );
    }


    /*
     * ========================================
     * ACTUALIZAR ESTADO DEL DISPOSITIVO
     * ========================================
     *
     * isOnline representa datos recientes
     * de status/lastSeen en Firebase.
     *
     * No representa la conexión BLE.
     */
    updateStatus(status, isOnline) {

        this.lastDeviceStatus = status;
        this.lastDeviceOnline = Boolean(isOnline);

        /*
         * Mostrar el estado real de los
         * datos del dispositivo en Firebase.
         */
        this.connectionStatus.textContent =
            isOnline
                ? "Datos recientes"
                : "Sin datos recientes del bastón";

        this.connectionIndicator.classList.toggle(
            "online",
            Boolean(isOnline)
        );

        this.connectionIndicator.classList.toggle(
            "offline",
            !isOnline
        );

        /*
         * Si no existe estado en Firebase.
         */
        if (!status) {

            this.lastSeenText.textContent =
                "Sin datos del dispositivo";

            this.obstacleValue.textContent = "--";

            this.fallValue.textContent =
                "Sin datos recientes";

            this.fallCard.classList.remove(
                "fall-alert"
            );

            this.gpsWarning.classList.remove(
                "hidden"
            );

            this.coordinatesText.textContent =
                "Ubicación GPS no disponible";

            return;
        }


        /*
         * ========================================
         * FECHA DEL ÚLTIMO REGISTRO
         * ========================================
         */
        if (status.lastSeen) {

            this.lastSeenText.textContent =
                `Último dato: ${
                    this.formatDate(status.lastSeen)
                }`;

        } else {

            this.lastSeenText.textContent =
                "Sin datos recientes";
        }


        /*
         * ========================================
         * SENSOR DE OBSTÁCULOS
         * ========================================
         *
         * No presentar lecturas antiguas
         * como si fueran mediciones actuales.
         */
        if (
            !isOnline ||
            status.obstacleCm === null ||
            status.obstacleCm === undefined ||
            !Number.isFinite(
                Number(status.obstacleCm)
            )
        ) {

            this.obstacleValue.textContent = "--";

        } else {

            this.obstacleValue.textContent =
                Number(
                    status.obstacleCm
                ).toFixed(0);
        }


        /*
         * ========================================
         * DETECCIÓN DE CAÍDAS
         * ========================================
         *
         * Una caída solo se muestra como
         * activa cuando los datos de Firebase
         * son recientes.
         *
         * No se borra el historial.
         */
        if (!isOnline) {

            if (status.fallDetected === true) {

                this.fallValue.textContent =
                    "Registro anterior de caída";

            } else {

                this.fallValue.textContent =
                    "Sin datos recientes";
            }

            this.fallCard.classList.remove(
                "fall-alert"
            );

        } else if (status.fallDetected === true) {

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


        /*
         * ========================================
         * UBICACIÓN DEL DISPOSITIVO
         * ========================================
         */
        const gpsAvailable =
            isOnline &&
            typeof status.hasLocation === "function" &&
            status.hasLocation();

        this.gpsWarning.classList.toggle(
            "hidden",
            Boolean(gpsAvailable)
        );

        if (gpsAvailable) {

            this.coordinatesText.textContent =
                `${status.lat.toFixed(6)}, ${
                    status.lng.toFixed(6)
                }`;

        } else {

            this.coordinatesText.textContent =
                "Sin ubicación reciente del bastón";
        }
    }


    /*
     * ========================================
     * RENDERIZAR ALERTAS
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

        /*
         * ========================================
         * ENLACE DE UBICACIÓN
         * ========================================
         */
        if (item.isLocated()) {

            const location =
                document.createElement("a");

            location.className =
                "alert-location";

            location.href =
                `https://maps.google.com/?q=${
                    item.lat
                },${item.lng}`;

            location.target = "_blank";

            location.rel =
                "noopener noreferrer";

            location.textContent =
                "📍 Ver ubicación";

            article.appendChild(location);

        } else {

            const noGps =
                document.createElement("span");

            noGps.className = "alert-time";

            noGps.textContent =
                "GPS sin señal";

            article.appendChild(noGps);
        }


        /*
         * ========================================
         * ALERTAS ATENDIDAS
         * ========================================
         */
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
     * ========================================
     * BOTÓN CERRAR SESIÓN
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
     * BOTÓN CENTRAR MAPA
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
     * SIMULADOR
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
