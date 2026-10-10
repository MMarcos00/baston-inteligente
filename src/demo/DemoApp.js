const DEMO_EMAIL = "demo@baston.local";
const DEMO_PASSWORD = "Demo1234!";

let map = null;
let marker = null;
let trajectory = null;

let currentLocation = {
    lat: 14.291000,
    lng: -89.895000
};

let demoState = {
    obstacleCm: 85,
    fallDetected: false,
    online: true
};

const alerts = [];

export function startDemo() {

    console.log("Modo DEMO iniciado");

    setupLogin();
}

function setupLogin() {

    const loginForm = document.getElementById("loginForm");
    const loginError = document.getElementById("loginError");
    const loginButton = document.getElementById("loginButton");

    if (!loginForm) {
        console.error("No se encontró loginForm.");
        return;
    }

    loginForm.addEventListener("submit", async (event) => {

        event.preventDefault();

        loginError.textContent = "";
        loginError.classList.add("hidden");

        const email =
            document.getElementById("email").value.trim();

        const password =
            document.getElementById("password").value;

        if (!email || !password) {
            showLoginError(
                "Debes ingresar tu correo y contraseña."
            );
            return;
        }

        if (
            email !== DEMO_EMAIL ||
            password !== DEMO_PASSWORD
        ) {

            showLoginError(
                "Correo o contraseña incorrectos."
            );

            return;
        }

        loginButton.disabled = true;
        loginButton.textContent = "Ingresando...";

        await new Promise(resolve =>
            setTimeout(resolve, 500)
        );

        loginButton.disabled = false;
        loginButton.textContent = "Iniciar sesión";

        showDashboard();
    });
}

function showLoginError(message) {

    const loginError =
        document.getElementById("loginError");

    loginError.textContent = message;
    loginError.classList.remove("hidden");
}

function showDashboard() {

    const loginScreen =
        document.getElementById("loginScreen");

    const dashboardScreen =
        document.getElementById("dashboardScreen");

    loginScreen.classList.add("hidden");
    dashboardScreen.classList.remove("hidden");

    setupDashboard();

    setTimeout(() => {

        initializeMap();

        updateDashboard();

    }, 100);
}

function setupDashboard() {

    const logoutButton =
        document.getElementById("logoutButton");

    const centerMapButton =
        document.getElementById("centerMapButton");

    const normalButton =
        document.getElementById("simulateNormalButton");

    const obstacleButton =
        document.getElementById("simulateObstacleButton");

    const fallButton =
        document.getElementById("simulateFallButton");

    const sosButton =
        document.getElementById("simulateSosButton");

    const simulatorPanel =
        document.getElementById("simulatorPanel");

    /*
     * Mostramos el simulador.
     */
    simulatorPanel.classList.remove("hidden");

    /*
     * Logout.
     */
    logoutButton.onclick = () => {

        if (map) {
            map.remove();
            map = null;
            marker = null;
            trajectory = null;
        }

        document
            .getElementById("dashboardScreen")
            .classList.add("hidden");

        document
            .getElementById("loginScreen")
            .classList.remove("hidden");

        document
            .getElementById("password")
            .value = "";

        document
            .getElementById("loginError")
            .classList.add("hidden");
    };

    /*
     * Centrar mapa.
     */
    centerMapButton.onclick = () => {

        if (!map || !marker) {
            return;
        }

        map.setView(
            [
                currentLocation.lat,
                currentLocation.lng
            ],
            16
        );

        marker.openPopup();
    };

    /*
     * Estado normal.
     */
    normalButton.onclick = () => {

        demoState.online = true;
        demoState.obstacleCm = 85;
        demoState.fallDetected = false;

        currentLocation.lat += 0.0003;
        currentLocation.lng += 0.0002;

        updateDashboard();
        addHistoryPoint();
    };

    /*
     * Obstáculo.
     */
    obstacleButton.onclick = () => {

        demoState.online = true;
        demoState.obstacleCm = 25;
        demoState.fallDetected = false;

        updateDashboard();

        addAlert(
            "obstacle",
            "⚠️ Obstáculo cercano"
        );
    };

    /*
     * Caída.
     */
    fallButton.onclick = () => {

        demoState.online = true;
        demoState.obstacleCm = 40;
        demoState.fallDetected = true;

        updateDashboard();

        addAlert(
            "fall",
            "⚠️ Posible caída"
        );

        notifyUser(
            "Posible caída",
            "Se detectó una posible caída."
        );
    };

    /*
     * SOS.
     */
    sosButton.onclick = () => {

        demoState.online = true;
        demoState.fallDetected = false;

        updateDashboard();

        addAlert(
            "sos",
            "🚨 SOS"
        );

        notifyUser(
            "🚨 SOS",
            "El usuario ha enviado una alerta SOS."
        );
    };

    /*
     * Activamos botones.
     */
    normalButton.disabled = false;
    obstacleButton.disabled = false;
    fallButton.disabled = false;
    sosButton.disabled = false;
}

function initializeMap() {

    if (typeof L === "undefined") {

        console.error(
            "Leaflet no está cargado."
        );

        return;
    }

    if (map) {
        return;
    }

    map = L.map("map");

    /*
     * OpenStreetMap
     */
    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom: 19,
            attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'
        }
    ).addTo(map);

    /*
     * Posición inicial.
     */
    map.setView(
        [
            currentLocation.lat,
            currentLocation.lng
        ],
        16
    );

    /*
     * Marcador.
     */
    marker = L.marker([
        currentLocation.lat,
        currentLocation.lng
    ]).addTo(map);

    marker.bindPopup(
        "<strong>🦯 Bastón Inteligente</strong><br>" +
        "Ubicación simulada"
    );

    marker.openPopup();

    /*
     * Línea del recorrido.
     */
    trajectory = L.polyline(
        [
            [
                currentLocation.lat,
                currentLocation.lng
            ]
        ]
    ).addTo(map);

    setTimeout(() => {

        map.invalidateSize();

    }, 200);
}

function updateDashboard() {

    const connectionStatus =
        document.getElementById(
            "connectionStatus"
        );

    const connectionIndicator =
        document.getElementById(
            "connectionIndicator"
        );

    const lastSeenText =
        document.getElementById(
            "lastSeenText"
        );

    const obstacleValue =
        document.getElementById(
            "obstacleValue"
        );

    const fallValue =
        document.getElementById(
            "fallValue"
        );

    const fallCard =
        document.getElementById(
            "fallCard"
        );

    const gpsWarning =
        document.getElementById(
            "gpsWarning"
        );

    const coordinatesText =
        document.getElementById(
            "coordinatesText"
        );

    /*
     * Estado conexión.
     */
    connectionStatus.textContent =
        demoState.online
            ? "En línea"
            : "Sin conexión";

    connectionIndicator.classList.toggle(
        "online",
        demoState.online
    );

    connectionIndicator.classList.toggle(
        "offline",
        !demoState.online
    );

    /*
     * Último dato.
     */
    lastSeenText.textContent =
        "Último dato: " +
        new Date().toLocaleString("es-GT");

    /*
     * Obstáculo.
     */
    obstacleValue.textContent =
        demoState.obstacleCm;

    /*
     * Caída.
     */
    if (demoState.fallDetected) {

        fallValue.textContent =
            "DETECTADA";

        fallCard.classList.add(
            "fall-alert"
        );

    } else {

        fallValue.textContent =
            "Sin detectar";

        fallCard.classList.remove(
            "fall-alert"
        );
    }

    /*
     * GPS.
     */
    gpsWarning.classList.add("hidden");

    coordinatesText.textContent =
        `${currentLocation.lat.toFixed(6)}, ` +
        `${currentLocation.lng.toFixed(6)}`;

    /*
     * Actualizar marcador.
     */
    if (map && marker) {

        marker.setLatLng([
            currentLocation.lat,
            currentLocation.lng
        ]);

        marker.setPopupContent(
            "<strong>🦯 Bastón Inteligente</strong><br>" +
            "Ubicación simulada<br>" +
            `${currentLocation.lat.toFixed(6)}, ` +
            `${currentLocation.lng.toFixed(6)}`
        );
    }

    /*
     * Actualizar recorrido.
     */
    addHistoryPoint();
}

function addHistoryPoint() {

    if (!trajectory) {
        return;
    }

    const points =
        trajectory.getLatLngs();

    points.push([
        currentLocation.lat,
        currentLocation.lng
    ]);

    trajectory.setLatLngs(points);

    if (map) {

        map.setView(
            [
                currentLocation.lat,
                currentLocation.lng
            ],
            map.getZoom()
        );
    }
}

function addAlert(type, message) {

    const alert = {

        id: Date.now(),

        type: type,

        message: message,

        lat: currentLocation.lat,

        lng: currentLocation.lng,

        createdAt: Date.now(),

        attended: false
    };

    alerts.unshift(alert);

    renderAlerts();
}

function renderAlerts() {

    const alertsList =
        document.getElementById(
            "alertsList"
        );

    if (!alerts.length) {

        alertsList.innerHTML =
            `
            <div class="empty-state">
                No hay alertas recientes.
            </div>
            `;

        return;
    }

    alertsList.innerHTML = "";

    alerts.forEach(alert => {

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

        const typeText =
            alert.type === "fall"
                ? "⚠️ Posible caída"
                : alert.type === "sos"
                    ? "🚨 SOS"
                    : "⚠️ Obstáculo";

        article.innerHTML =
            `
            <div class="alert-header">

                <span class="alert-type">
                    ${typeText}
                </span>

                <span class="alert-time">
                    ${new Date(
                alert.createdAt
            ).toLocaleString("es-GT")}
                </span>

            </div>

            <p>
                ${alert.message}
            </p>

            <a
                class="alert-location"
                href="https://maps.google.com/?q=${alert.lat},${alert.lng}"
                target="_blank"
                rel="noopener noreferrer"
            >
                📍 Ver ubicación
            </a>
            `;

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

            button.type = "button";

            button.className =
                "secondary-button";

            button.textContent =
                "Marcar como atendida";

            button.onclick = () => {

                alert.attended = true;

                renderAlerts();
            };

            article.appendChild(
                button
            );
        }

        alertsList.appendChild(
            article
        );
    });
}

async function notifyUser(
    title,
    message
) {

    /*
     * Notificación del navegador.
     */
    if (
        "Notification" in window
    ) {

        if (
            Notification.permission ===
            "default"
        ) {

            await Notification.requestPermission();
        }

        if (
            Notification.permission ===
            "granted"
        ) {

            new Notification(
                title,
                {
                    body: message
                }
            );
        }
    }

    /*
     * Vibración.
     */
    if ("vibrate" in navigator) {

        navigator.vibrate([
            250,
            150,
            250
        ]);
    }

    /*
     * Sonido.
     */
    playAlertSound();
}

function playAlertSound() {

    try {

        const AudioContext =
            window.AudioContext ||
            window.webkitAudioContext;

        if (!AudioContext) {
            return;
        }

        const audioContext =
            new AudioContext();

        const oscillator =
            audioContext.createOscillator();

        const gain =
            audioContext.createGain();

        oscillator.type = "sine";

        oscillator.frequency.value =
            880;

        gain.gain.value =
            0.15;

        oscillator.connect(gain);

        gain.connect(
            audioContext.destination
        );

        oscillator.start();

        oscillator.stop(
            audioContext.currentTime + 0.25
        );

    } catch (error) {

        console.warn(
            "No se pudo reproducir el sonido:",
            error
        );
    }
}