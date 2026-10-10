import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import {
    getAuth
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import {
    getDatabase
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

import {
    firebaseConfig
} from "../../config/firebase.config.js";


export class FirebaseBootstrap {

    static initialize() {

        const app =
            initializeApp(firebaseConfig);

        const auth =
            getAuth(app);

        const database =
            getDatabase(app);

        return {
            app,
            auth,
            database
        };

    }

}