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
     * Aquí utilizamos Firebase.
     */
    try {

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

        const {
            LeafletMapAdapter
        } = await import(
            "./infrastructure/map/LeafletMapAdapter.js"
            );

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
         * Inicializar Firebase
         */
        const {
            auth,
            database
        } = FirebaseBootstrap.initialize();


        /*
         * Repositorios
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
         * Servicios
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

        const phoneLocationService =
            new PhoneLocationService();


        /*
         * Mapa
         */
        const mapAdapter =
            new LeafletMapAdapter(
                "map"
            );


        /*
         * Vistas
         */
        const loginView =
            new LoginView(
                authService
            );

        const dashboardView =
            new DashboardView();


        /*
         * Controlador principal
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

                phoneLocationService

            });


        /*
         * Iniciar aplicación
         */
        controller.start();

        console.log(
            "Aplicación iniciada correctamente."
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
                "No se pudo iniciar la aplicación. Revisa la configuración de Firebase.";

            loginError.classList.remove(
                "hidden"
            );
        }
    }
}


startApplication();