
/*
 * ==========================================
 * SMARTCANE - BLUETOOTH SERVICE
 * ==========================================
 *
 * Comunicación BLE con ESP32.
 *
 * Compatible con:
 * - SOS manual.
 * - Detección de posibles caídas MPU6050.
 * - Notificaciones BLE.
 * - Conexión y desconexión.
 *
 * El firmware ESP32 no requiere cambios.
 */

const SERVICE_UUID =
    "4fafc201-1fb5-459e-8fcc-c5c9c331914b";

const CHARACTERISTIC_UUID =
    "beb5483e-36e1-4688-b7f5-ea07361b26a8";

export class BluetoothService {

    constructor() {

        this.device = null;
        this.characteristic = null;

        this.onMessage = null;
        this.onStatusChange = null;

        this.decoder = new TextDecoder("utf-8");

        this.handleNotification =
            this.handleNotification.bind(this);

        this.handleDisconnect =
            this.handleDisconnect.bind(this);
    }

    /*
     * ==========================================
     * COMPROBAR SOPORTE BLE
     * ==========================================
     */

    isSupported() {

        return (
            window.isSecureContext &&
            "bluetooth" in navigator
        );
    }

    /*
     * ==========================================
     * CONECTAR CON SMARTCANE
     * ==========================================
     */

    async connect(onMessage, onStatusChange) {

        if (!this.isSupported()) {

            throw new Error(
                "Este navegador no admite Web Bluetooth. " +
                "Utiliza Chrome en Android con HTTPS."
            );
        }

        // Actualizar callbacks incluso si
        // el dispositivo ya está conectado.
        this.onMessage = onMessage;
        this.onStatusChange = onStatusChange;

        if (this.device?.gatt?.connected &&
            this.characteristic) {

            this.onStatusChange?.("connected");
            return;
        }

        try {

            this.onStatusChange?.("connecting");

            this.device =
                await navigator.bluetooth.requestDevice({

                    filters: [
                        {
                            name: "SmartCane"
                        }
                    ],

                    optionalServices: [
                        SERVICE_UUID
                    ]
                });

            this.device.addEventListener(
                "gattserverdisconnected",
                this.handleDisconnect
            );

            const server =
                await this.device.gatt.connect();

            const service =
                await server.getPrimaryService(
                    SERVICE_UUID
                );

            this.characteristic =
                await service.getCharacteristic(
                    CHARACTERISTIC_UUID
                );

            // Activar las notificaciones BLE.
            await this.characteristic.startNotifications();

            // Evitar listeners duplicados.
            this.characteristic.removeEventListener(
                "characteristicvaluechanged",
                this.handleNotification
            );

            this.characteristic.addEventListener(
                "characteristicvaluechanged",
                this.handleNotification
            );

            this.onStatusChange?.("connected");

            console.log(
                "SmartCane conectado correctamente por BLE"
            );

        } catch (error) {

            console.error(
                "Error conectando SmartCane:",
                error
            );

            if (this.device) {

                this.device.removeEventListener(
                    "gattserverdisconnected",
                    this.handleDisconnect
                );

                if (this.device.gatt?.connected) {
                    this.device.gatt.disconnect();
                }
            }

            this.characteristic = null;
            this.device = null;

            this.onStatusChange?.("error");

            throw error;
        }
    }

    /*
     * ==========================================
     * RECIBIR NOTIFICACIONES BLE
     * ==========================================
     */

    handleNotification(event) {

        try {

            const data = event.target.value;

            if (!data) {
                return;
            }

            const bytes = new Uint8Array(
                data.buffer,
                data.byteOffset,
                data.byteLength
            );

            // Convertir los bytes a texto.
            const message = this.decoder
                .decode(bytes)
                .replace(/\0/g, "")
                .trim();

            if (!message) {
                return;
            }

            console.log(
                "Mensaje recibido del ESP32:",
                message
            );

            /*
             * El AppController se encarga
             * de identificar el tipo de evento.
             *
             * No modificamos los mensajes
             * para mantener compatibilidad
             * exacta con el firmware.
             */

            switch (message) {

                case "SOS: Necesito ayuda":

                    console.log(
                        "SOS manual detectado por Bluetooth"
                    );

                    break;

                case "ALERTA: Posible caida detectada":

                    console.log(
                        "Posible caída detectada por MPU6050"
                    );

                    break;

                case "Smart Cane listo":

                    console.log(
                        "ESP32 preparado"
                    );

                    break;

                default:

                    console.log(
                        "Mensaje informativo del ESP32"
                    );
            }

            // Entregar el mensaje original
            // al AppController.
            this.onMessage?.(message);

        } catch (error) {

            console.error(
                "Error procesando notificación BLE:",
                error
            );
        }
    }

    /*
     * ==========================================
     * DESCONEXIÓN INESPERADA
     * ==========================================
     */

    handleDisconnect() {

        console.warn(
            "SmartCane desconectado por Bluetooth"
        );

        if (this.characteristic) {

            this.characteristic.removeEventListener(
                "characteristicvaluechanged",
                this.handleNotification
            );
        }

        this.characteristic = null;
        this.device = null;

        this.onStatusChange?.("disconnected");
    }

    /*
     * ==========================================
     * DESCONEXIÓN MANUAL
     * ==========================================
     */

    async disconnect() {

        if (this.characteristic) {

            this.characteristic.removeEventListener(
                "characteristicvaluechanged",
                this.handleNotification
            );

            try {

                await this.characteristic
                    .stopNotifications();

            } catch (error) {

                console.warn(
                    "No se pudieron detener las notificaciones:",
                    error
                );
            }
        }

        if (this.device) {

            this.device.removeEventListener(
                "gattserverdisconnected",
                this.handleDisconnect
            );

            if (this.device.gatt?.connected) {

                this.device.gatt.disconnect();
            }
        }

        this.characteristic = null;
        this.device = null;

        this.onMessage = null;

        this.onStatusChange?.("disconnected");

        console.log(
            "SmartCane desconectado correctamente"
        );
    }
}
