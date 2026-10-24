
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

        this.handleNotification =
            this.handleNotification.bind(this);

        this.handleDisconnect =
            this.handleDisconnect.bind(this);
    }

    isSupported() {
        return (
            window.isSecureContext &&
            "bluetooth" in navigator
        );
    }

    async connect(onMessage, onStatusChange) {
        if (!this.isSupported()) {
            throw new Error(
                "Este navegador no admite Web Bluetooth. " +
                "Utiliza Chrome en Android con HTTPS."
            );
        }

        if (this.device?.gatt?.connected) {
            return;
        }

        this.onMessage = onMessage;
        this.onStatusChange = onStatusChange;

        try {
            this.device =
                await navigator.bluetooth.requestDevice({
                    filters: [
                        { name: "SmartCane" }
                    ],
                    optionalServices: [SERVICE_UUID]
                });

            this.device.addEventListener(
                "gattserverdisconnected",
                this.handleDisconnect
            );

            const server =
                await this.device.gatt.connect();

            const service =
                await server.getPrimaryService(SERVICE_UUID);

            this.characteristic =
                await service.getCharacteristic(
                    CHARACTERISTIC_UUID
                );

            await this.characteristic.startNotifications();

            this.characteristic.addEventListener(
                "characteristicvaluechanged",
                this.handleNotification
            );

            this.onStatusChange?.("connected");

            console.log("SmartCane conectado por BLE");

        } catch (error) {
            if (this.device?.gatt?.connected) {
                this.device.gatt.disconnect();
            }

            this.onStatusChange?.("error");
            throw error;
        }
    }

    handleNotification(event) {
        const data = event.target.value;

        const bytes = new Uint8Array(
            data.buffer,
            data.byteOffset,
            data.byteLength
        );

        const message = new TextDecoder().decode(bytes);

        console.log("Mensaje BLE:", message);

        this.onMessage?.(message);
    }

    handleDisconnect() {
        this.characteristic = null;
        this.onStatusChange?.("disconnected");

        console.log("SmartCane desconectado");
    }

    async disconnect() {
        if (this.characteristic) {
            this.characteristic.removeEventListener(
                "characteristicvaluechanged",
                this.handleNotification
            );
        }

        if (this.device) {
            this.device.removeEventListener(
                "gattserverdisconnected",
                this.handleDisconnect
            );

            if (this.device.gatt.connected) {
                this.device.gatt.disconnect();
            }
        }

        this.characteristic = null;
        this.device = null;
        this.onStatusChange?.("disconnected");
    }
}
