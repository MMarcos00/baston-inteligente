export class SoundNotificationAdapter {

    constructor() {

        this.audioContext =
            null;

        this.unlocked = false;

        this.bindUserInteraction();

    }


    bindUserInteraction() {

        const unlock =
            () => {

                this.unlocked = true;

                if (
                    !this.audioContext
                ) {

                    const AudioContext =
                        window.AudioContext ||
                        window.webkitAudioContext;

                    if (AudioContext) {

                        this.audioContext =
                            new AudioContext();

                    }

                }

            };


        document.addEventListener(
            "click",
            unlock,
            {
                once: false
            }
        );

        document.addEventListener(
            "touchstart",
            unlock,
            {
                once: false
            }
        );

    }


    notify() {

        if (!this.unlocked) {
            return;
        }

        if (!this.audioContext) {
            return;
        }


        const oscillator =
            this.audioContext
                .createOscillator();

        const gain =
            this.audioContext
                .createGain();


        oscillator.type =
            "sine";

        oscillator.frequency.value =
            880;


        gain.gain.setValueAtTime(
            0.0001,
            this.audioContext.currentTime
        );

        gain.gain.exponentialRampToValueAtTime(
            0.25,
            this.audioContext.currentTime + 0.02
        );

        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            this.audioContext.currentTime + 0.45
        );


        oscillator
            .connect(gain);

        gain
            .connect(
                this.audioContext.destination
            );


        oscillator.start();

        oscillator.stop(
            this.audioContext.currentTime +
            0.45
        );

    }

}