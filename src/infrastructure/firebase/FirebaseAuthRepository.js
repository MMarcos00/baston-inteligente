import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";


export class FirebaseAuthRepository {

    constructor(auth) {

        this.auth = auth;

    }


    async login(email, password) {

        const credential =
            await signInWithEmailAndPassword(
                this.auth,
                email,
                password
            );

        console.log("========== FIREBASE AUTH ==========");
        console.log("Usuario:", credential.user.email);
        console.log("UID:", credential.user.uid);
        console.log("===================================");

        return credential.user;
    }


    async logout() {

        await signOut(this.auth);

    }


    observeAuthState(callback) {

        return onAuthStateChanged(
            this.auth,
            callback
        );

    }


    getCurrentUser() {

        return this.auth.currentUser;

    }

}