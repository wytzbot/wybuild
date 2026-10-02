/* Firebase Web client config. These values identify the Firebase project and are public.
   Fill in the Firebase Web App config and VAPID public key from Firebase Console.
   Never put a service-account private key in this file. */
self.WYBUILD_FIREBASE_CONFIG = {
  apiKey: "REPLACE_WITH_FIREBASE_WEB_API_KEY",
  authDomain: "REPLACE_WITH_PROJECT.firebaseapp.com",
  projectId: "REPLACE_WITH_PROJECT_ID",
  storageBucket: "REPLACE_WITH_PROJECT.appspot.com",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",
  appId: "REPLACE_WITH_FIREBASE_WEB_APP_ID"
};
self.WYBUILD_FCM_VAPID_KEY = "REPLACE_WITH_FIREBASE_WEB_PUSH_VAPID_PUBLIC_KEY";
