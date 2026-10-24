
/*
 * ==========================================
 * BASTÓN INTELIGENTE MEJORADO
 * SERVICIO DE TELEGRAM
 * ==========================================
 *
 * Universidad Mariano Gálvez
 * Arquitectura de Computadoras 2
 *
 * Función:
 * Enviar alertas registradas en Firebase
 * hacia Cloudflare Workers.
 *
 * Cloudflare se encarga de enviar
 * los mensajes al bot de Telegram.
 *
 * IMPORTANTE:
 * El token secreto del bot nunca debe
 * incluirse en este archivo.
 */

export class TelegramService {

    constructor(authRepository) {

        this.authRepository = authRepository;

        /*
         * Dirección pública de nuestro
         * Cloudflare Worker.
         */
        this.workerUrl =
            "https://smartcane-telegram.mendezmarcosgt.workers.dev";

    }


    /*
     * ==========================================
     * OBTENER TOKEN DE FIREBASE
     * ==========================================
     *
     * Identifica al usuario que inició sesión.
     */
    async getFirebaseToken() {

        const user =
            this.authRepository.getCurrentUser();

        if (!user) {

            throw new Error(
                "No existe una sesión activa en Firebase."
            );
        }

        /*
         * Firebase genera o reutiliza
         * un ID Token válido.
         */
        const token = await user.getIdToken();

        if (!token) {

            throw new Error(
                "No se pudo obtener el token de Firebase."
            );
        }

        return token;
    }


    /*
     * ==========================================
     * ENVIAR ALERTA A TELEGRAM
     * ==========================================
     *
     * Recibe el identificador de una
     * alerta que ya existe en Firebase.
     */
    async sendAlert(alertId) {

        if (
            typeof alertId !== "string" ||
            !alertId.trim()
        ) {

            throw new Error(
                "El identificador de la alerta no es válido."
            );
        }

        /*
         * Obtener identificación temporal
         * de la cuenta del dispositivo.
         */
        const token =
            await this.getFirebaseToken();

        /*
         * Preparar solicitud al Worker.
         */
        const response = await fetch(
            this.workerUrl + "/send-alert",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",

                    "Authorization":
                        "Bearer " + token
                },

                body: JSON.stringify({
                    alertId: alertId
                })
            }
        );

        /*
         * Leer respuesta del servidor.
         */
        let result;

        try {

            result = await response.json();

        } catch (error) {

            throw new Error(
                "El servidor Telegram devolvió " +
                "una respuesta no válida."
            );
        }

        /*
         * Verificar si ocurrió un error.
         */
        if (
            !response.ok ||
            result.ok !== true
        ) {

            throw new Error(
                result.error ||
                "No se pudo enviar la alerta a Telegram."
            );
        }

        /*
         * Confirmar el resultado.
         */
        if (result.alreadySent) {

            console.log(
                "Esta alerta ya fue enviada a Telegram."
            );

        } else {

            console.log(
                "Cloudflare confirmó el envío a Telegram."
            );
        }

        return result;
    }
}
