export class LoginView {

    constructor() {
        this.loginScreen = document.getElementById("loginScreen");
        this.dashboardScreen = document.getElementById("dashboardScreen");

        this.loginForm = document.getElementById("loginForm");
        this.emailInput = document.getElementById("email");
        this.passwordInput = document.getElementById("password");

        this.togglePasswordButton = document.getElementById("togglePassword");
        this.loginError = document.getElementById("loginError");
        this.loginButton = document.getElementById("loginButton");
    }

    bindLogin(handler) {
        this.loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            this.clearError();

            const email = this.emailInput.value.trim();
            const password = this.passwordInput.value;

            if (!email || !password) {
                this.showError("Completa el correo y la contraseña.");
                return;
            }

            this.setLoading(true);

            try {
                await handler(email, password);
            } catch (error) {
                this.showError(this.getErrorMessage(error));
            } finally {
                this.setLoading(false);
            }
        });
    }

    bindPasswordToggle() {
        this.togglePasswordButton.addEventListener("click", () => {

            const isPassword =
                this.passwordInput.type === "password";

            this.passwordInput.type =
                isPassword ? "text" : "password";

            this.togglePasswordButton.textContent =
                isPassword ? "Ocultar" : "Mostrar";
        });
    }

    show() {
        this.loginScreen.classList.remove("hidden");
        this.dashboardScreen.classList.add("hidden");
    }

    hide() {
        this.loginScreen.classList.add("hidden");
        this.dashboardScreen.classList.remove("hidden");
    }

    clearError() {
        this.loginError.textContent = "";
        this.loginError.classList.add("hidden");
    }

    showError(message) {
        this.loginError.textContent = message;
        this.loginError.classList.remove("hidden");
    }

    setLoading(loading) {
        this.loginButton.disabled = loading;

        this.loginButton.textContent =
            loading ? "Iniciando sesión..." : "Iniciar sesión";
    }

    getErrorMessage(error) {

        switch (error?.code) {

            case "auth/invalid-credential":
                return "Correo o contraseña incorrectos.";

            case "auth/invalid-email":
                return "El correo electrónico no es válido.";

            case "auth/user-disabled":
                return "Esta cuenta está deshabilitada.";

            case "auth/too-many-requests":
                return "Demasiados intentos. Intenta nuevamente más tarde.";

            case "auth/network-request-failed":
                return "No hay conexión con Firebase.";

            default:
                return "No se pudo iniciar sesión. Intenta nuevamente.";
        }
    }
}