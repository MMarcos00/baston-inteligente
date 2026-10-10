export class AuthService {

    constructor(authRepository) {

        this.authRepository =
            authRepository;

    }


    async login(email, password) {

        const normalizedEmail =
            email.trim();

        if (!normalizedEmail) {

            throw new Error(
                "Debes ingresar tu correo electrónico."
            );

        }

        if (!password) {

            throw new Error(
                "Debes ingresar tu contraseña."
            );

        }

        try {

            return await this.authRepository.login(
                normalizedEmail,
                password
            );

        } catch (error) {

            throw new Error(
                this.translateFirebaseError(error)
            );

        }

    }


    async logout() {

        await this.authRepository.logout();

    }


    observeSession(callback) {

        return this.authRepository
            .observeAuthState(callback);

    }


    translateFirebaseError(error) {

        const code =
            error?.code ?? "";

        const messages = {

            "auth/invalid-email":
                "El correo electrónico no es válido.",

            "auth/invalid-credential":
                "El correo o la contraseña son incorrectos.",

            "auth/user-not-found":
                "El usuario no existe.",

            "auth/wrong-password":
                "La contraseña es incorrecta.",

            "auth/too-many-requests":
                "Demasiados intentos. Intenta nuevamente más tarde.",

            "auth/network-request-failed":
                "No hay conexión con Firebase.",

            "auth/user-disabled":
                "Esta cuenta está deshabilitada."

        };

        return (
            messages[code] ??
            "No fue posible iniciar sesión. Intenta nuevamente."
        );

    }

}