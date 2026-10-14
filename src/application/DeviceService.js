
import {
    DeviceStatus,
    DeviceHistoryPoint
} from "../domain/entities.js";

import {
    DEVICE_ONLINE_THRESHOLD_MS
} from "../domain/constants.js";


export class DeviceService {

    constructor(deviceRepository) {
        this.deviceRepository = deviceRepository;
    }

    subscribeToStatus(callback, onError) {
        return this.deviceRepository.subscribeToStatus(
            (data) => {
                const status = new DeviceStatus(data ?? {});
                callback(status);
            },
            onError
        );
    }

    subscribeToHistory(callback, onError) {
        return this.deviceRepository.subscribeToHistory(
            (points) => {
                const history = points.map(
                    (point) => new DeviceHistoryPoint(point)
                );

                callback(history);
            },
            onError
        );
    }

    subscribeToPhoneLocation(callback, onError) {
        return this.deviceRepository.subscribeToPhoneLocation(
            callback,
            onError
        );
    }

    async writePhoneLocation(location) {
        return this.deviceRepository.writePhoneLocation(location);
    }

    async writePhoneLocationHistory(location) {
        return this.deviceRepository.writePhoneLocationHistory(location);
    }

    isOnline(status) {
        if (!status?.lastSeen) {
            return false;
        }

        return (
            Date.now() - status.lastSeen
        ) < DEVICE_ONLINE_THRESHOLD_MS;
    }

    async getStatus() {
        const data = await this.deviceRepository.getStatus();

        return new DeviceStatus(data ?? {});
    }

}
