
const params = new URLSearchParams(
    window.location.search
);

const demoMode = params.get("demo") === "1";


async function startApplication() {

    /*
     * ========================================
     * MODO DEMO
     * ========================================
     *
     * No utiliza Firebase.
     */
    if (demoMode) {

        const {
            startDemo
        } = await import(
            "./demo/DemoApp.js"
            );

        startDemo();

        console.log(
            "Aplicación iniciada en modo DEMO."
        );

        return;
    }


    /*
     * ========================================
     * MODO NORMAL
     * ========================================
     *
     * Firebase + GPS + Bluetooth + Telegram.
     */
    try {

        /*
         * ========================================
         * FIREBASE
         * ========================================
         */
        const {
            FirebaseBootstrap
        } = await import(
            "./infrastructure/firebase/FirebaseBootstrap.js"
            );

        const {
            FirebaseAuthRepository
        } = await import(
            "./infrastructure/firebase/FirebaseAuthRepository.js"
            );

        const {
            FirebaseDeviceRepository
        } = await import(
            "./infrastructure/firebase/FirebaseDeviceRepository.js"
            );


        /*
         * ========================================
         * SERVICIOS DE APLICACIÓN
         * ========================================
         */
        const {
            AuthService
        } = await import(
            "./application/AuthService.js"
            );

        const {
            DeviceService
        } = await import(
            "./application/DeviceService.js"
            );

        const {
            AlertService
        } = await import(
            "./application/AlertService.js"
            );

        const {
            SimulatorService
        } = await import(
            "./application/SimulatorService.js"
            );

        const {
            PhoneLocationService
        } = await import(
            "./application/PhoneLocationService.js"
            );

        /*
         * Bluetooth BLE del ESP32.
         */
        const {
            BluetoothService
        } = await import(
            "./application/BluetoothService.js"
            );

        /*
         * NUEVO: Telegram mediante Cloudflare.
         */
        const {
            TelegramService
        } = await import(
            "./application/TelegramService.js"
            );


        /*
         * ========================================
         * MAPAS
         * ========================================
         */
        const {
            LeafletMapAdapter
        } = await import(
            "./infrastructure/map/LeafletMapAdapter.js"
            );


        /*
         * ========================================
         * NOTIFICACIONES
         * ========================================
         */
        const {
            BrowserNotificationAdapter
        } = await import(
            "./infrastructure/notifications/BrowserNotificationAdapter.js"
            );

        const {
            SoundNotificationAdapter
        } = await import(
            "./infrastructure/notifications/SoundNotificationAdapter.js"
            );


        /*
         * ========================================
         * VISTAS Y CONTROLADOR
         * ========================================
         */
        const {
            LoginView
        } = await import(
            "./presentation/LoginView.js"
            );

        const {
            DashboardView
        } = await import(
            "./presentation/DashboardView.js"
            );

        const {
            AppController
        } = await import(
            "./presentation/AppController.js"
            );


        /*
         * ========================================
         * INICIALIZAR FIREBASE
         * ========================================
         */
        const {
            auth,
            database
        } = FirebaseBootstrap.initialize();


        /*
         * ========================================
         * REPOSITORIOS
         * ========================================
         */
        const authRepository =
            new FirebaseAuthRepository(
                auth
            );

        const deviceRepository =
            new FirebaseDeviceRepository(
                database
            );


        /*
         * ========================================
         * SERVICIOS
         * ========================================
         */
        const authService =
            new AuthService(
                authRepository
            );

        const deviceService =
            new DeviceService(
                deviceRepository
            );

        const notificationService =
            new BrowserNotificationAdapter();

        const soundService =
            new SoundNotificationAdapter();

        const alertService =
            new AlertService(
                deviceRepository,
                notificationService,
                soundService
            );

        const simulatorService =
            new SimulatorService(
                deviceRepository
            );

        /*
         * GPS del teléfono Android.
         */
        const phoneLocationService =
            new PhoneLocationService();

        /*
         * Bluetooth BLE.
         */
        const bluetoothService =
            new BluetoothService();

        /*
         * NUEVO: Telegram.
         *
         * Utiliza el repositorio de
         * autenticación para obtener un
         * ID Token de Firebase.
         */
        const telegramService =
            new TelegramService(
                authRepository
            );


        /*
         * ========================================
         * MAPA
         * ========================================
         */
        const mapAdapter =
            new LeafletMapAdapter(
                "map"
            );


        /*
         * ========================================
         * VISTAS
         * ========================================
         */
        const loginView =
            new LoginView(
                authService
            );

        const dashboardView =
            new DashboardView();


        /*
         * ========================================
         * CONTROLADOR PRINCIPAL
         * ========================================
         */
        const controller =
            new AppController({

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

                // NUEVO: servicio de Telegram.
                telegramService

            });


        /*
         * ========================================
         * INICIAR APLICACIÓN
         * ========================================
         */
        controller.start();

        console.log(
            "Aplicación iniciada correctamente."
        );

        console.log(
            "Bluetooth BLE disponible."
        );

        console.log(
            "Servicio Telegram inicializado."
        );


    } catch (error) {

        console.error(
            "Error iniciando la aplicación:",
            error
        );

        const loginError =
            document.getElementById(
                "loginError"
            );

        if (loginError) {

            loginError.textContent =
                "No se pudo iniciar la aplicación. " +
                "Revisa la configuración.";

            loginError.classList.remove(
                "hidden"
            );
        }
    }
}


startApplication();
