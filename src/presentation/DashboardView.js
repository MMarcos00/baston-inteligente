export class DashboardView {

    constructor() {

        this.screen =
            document.getElementById(
                "dashboardScreen"
            );

        this.connectionStatus =
            document.getElementById(
                "connectionStatus"
            );

        this.connectionIndicator =
            document.getElementById(
                "connectionIndicator"
            );

        this.lastSeenText =
            document.getElementById(
                "lastSeenText"
            );

        this.gpsWarning =
            document.getElementById(
                "gpsWarning"
            );

        this.obstacleValue =
            document.getElementById(
                "obstacleValue"
            );

        this.fallValue =
            document.getElementById(
                "fallValue"
            );

        this.fallCard =
            document.getElementById(
                "fallCard"
            );

        this.coordinatesText =
            document.getElementById(
                "coordinatesText"
            );

        this.alertsList =
            document.getElementById(
                "alertsList"
            );

        this.logoutButton =
            document.getElementById(
                "logoutButton"
            );

        this.centerMapButton =
            document.getElementById(
                "centerMapButton"
            );

        this.simulatorPanel =
            document.getElementById(
                "simulatorPanel"
            );

        this.simulateNormalButton =
            document.getElementById(
                "simulateNormalButton"
            );

        this.simulateObstacleButton =
            document.getElementById(
                "simulateObstacleButton"
            );

        this.simulateFallButton =
            document.getElementById(
                "simulateFallButton"
            );

        this.simulateSosButton =
            document.getElementById(
                "simulateSosButton"
            );

        this.simulateGpsButton =
            document.getElementById(
                "simulateGpsButton"
            );
    }


    show() {

        this.screen
            .classList
            .remove("hidden");

    }


    hide() {

        this.screen
            .classList
            .add("hidden");

    }


    showSimulator() {

        this.simulatorPanel
            .classList
            .remove("hidden");

    }


    updateStatus(
        status,
        isOnline
    ) {

        this.connectionStatus
            .textContent =
            isOnline
                ? "En línea"
                : "Sin conexión";


        this.connectionIndicator
            .classList
            .toggle(
                "online",
                isOnline
            );

        this.connectionIndicator
            .classList
            .toggle(
                "offline",
                !isOnline
            );


        if (status.lastSeen) {

            this.lastSeenText
                .textContent =
                `Último dato: ${this.formatDate(
                    status.lastSeen
                )}`;

        } else {

            this.lastSeenText
                .textContent =
                "Sin datos recientes";

        }


        if (
            status.obstacleCm === null ||
            status.obstacleCm === undefined
        ) {

            this.obstacleValue
                .textContent =
                "--";

        } else {

            this.obstacleValue
                .textContent =
                Number(
                    status.obstacleCm
                ).toFixed(0);

        }


        if (status.fallDetected) {

            this.fallValue
                .textContent =
                "DETECTADA";

            this.fallCard
                .classList
                .add("fall-alert");

        } else {

            this.fallValue
                .textContent =
                "Sin detectar";

            this.fallCard
                .classList
                .remove("fall-alert");

        }


        const gpsAvailable =
            status.hasLocation();


        this.gpsWarning
            .classList
            .toggle(
                "hidden",
                gpsAvailable
            );


        if (gpsAvailable) {

            this.coordinatesText
                .textContent =
                `${status.lat.toFixed(6)}, ${status.lng.toFixed(6)}`;

        } else {

            this.coordinatesText
                .textContent =
                "Ubicación GPS no disponible";

        }

    }


    renderAlerts(
        alerts,
        onAttend
    ) {

        if (!alerts.length) {

            this.alertsList.innerHTML =
                `
                <div class="empty-state">
                    No hay alertas recientes.
                </div>
                `;

            return;

        }


        this.alertsList.innerHTML =
            "";


        for (
            const alert
            of alerts
            ) {

            const element =
                this.createAlertElement(
                    alert,
                    onAttend
                );

            this.alertsList
                .appendChild(
                    element
                );

        }

    }


    createAlertElement(
        alert,
        onAttend
    ) {

        const article =
            document.createElement(
                "article"
            );


        article.className =
            `alert-item ${
                alert.attended
                    ? "attended"
                    : "unattended"
            }`;


        const header =
            document.createElement(
                "div"
            );

        header.className =
            "alert-header";


        const type =
            document.createElement(
                "span"
            );

        type.className =
            "alert-type";


        type.textContent =
            alert.type === "fall"
                ? "⚠️ Posible caída"
                : "🚨 SOS";


        const time =
            document.createElement(
                "span"
            );

        time.className =
            "alert-time";

        time.textContent =
            this.formatDate(
                alert.createdAt
            );


        header.append(
            type,
            time
        );


        article.appendChild(
            header
        );


        if (alert.isLocated()) {

            const location =
                document.createElement(
                    "a"
                );

            location.className =
                "alert-location";

            location.href =
                `https://maps.google.com/?q=${alert.lat},${alert.lng}`;

            location.target =
                "_blank";

            location.rel =
                "noopener noreferrer";

            location.textContent =
                "📍 Ver ubicación";

            article.appendChild(
                location
            );

        } else {

            const noGps =
                document.createElement(
                    "span"
                );

            noGps.className =
                "alert-time";

            noGps.textContent =
                "GPS sin señal";

            article.appendChild(
                noGps
            );

        }


        if (alert.attended) {

            const attended =
                document.createElement(
                    "span"
                );

            attended.className =
                "attended-label";

            attended.textContent =
                "✓ Atendida";

            article.appendChild(
                attended
            );

        } else {

            const button =
                document.createElement(
                    "button"
                );

            button.type =
                "button";

            button.className =
                "secondary-button";

            button.textContent =
                "Marcar como atendida";


            button.addEventListener(
                "click",
                async () => {

                    button.disabled =
                        true;

                    button.textContent =
                        "Guardando...";


                    try {

                        await onAttend(
                            alert.id
                        );

                    } catch (error) {

                        button.disabled =
                            false;

                        button.textContent =
                            "Marcar como atendida";

                        alert(
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


    bindLogout(callback) {

        this.logoutButton
            .addEventListener(
                "click",
                callback
            );

    }


    bindCenterMap(callback) {

        this.centerMapButton
            .addEventListener(
                "click",
                callback
            );

    }


    bindSimulator(
        callbacks
    ) {

        this.simulateNormalButton
            .addEventListener(
                "click",
                callbacks.normal
            );


        this.simulateObstacleButton
            .addEventListener(
                "click",
                callbacks.obstacle
            );


        this.simulateFallButton
            .addEventListener(
                "click",
                callbacks.fall
            );


        this.simulateSosButton
            .addEventListener(
                "click",
                callbacks.sos
            );

        this.simulateGpsButton
            .addEventListener(
                "click",
                callbacks.gps
            );

    }


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