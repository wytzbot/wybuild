/* Optional web push bootstrap. Disabled until firebase-config.js is completed. */
(function () {
  function configured() {
    return self.WYBUILD_FIREBASE_CONFIG && self.WYBUILD_FIREBASE_CONFIG.apiKey &&
      !String(self.WYBUILD_FIREBASE_CONFIG.apiKey).startsWith('REPLACE_') &&
      self.WYBUILD_FCM_VAPID_KEY && !String(self.WYBUILD_FCM_VAPID_KEY).startsWith('REPLACE_');
  }
  window.wybuildEnablePush = async function () {
    if (!configured()) throw new Error('FCM is not configured yet. Fill web/firebase-config.js and set the Firebase service-account JSON in Vercel.');
    if (!('serviceWorker' in navigator) || !('Notification' in window)) throw new Error('This browser does not support web push notifications.');
    if (!window.firebase) throw new Error('Firebase SDK did not load. Check network access and Firebase script URLs.');
    if (!firebase.apps.length) firebase.initializeApp(self.WYBUILD_FIREBASE_CONFIG);
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Notification permission was not granted.');
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const messaging = firebase.messaging();
    const token = await messaging.getToken({ vapidKey: self.WYBUILD_FCM_VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) throw new Error('Firebase did not return a notification token.');
    messaging.onMessage((payload) => {
      const title = payload.notification?.title || 'WyBuild build update';
      const body = payload.notification?.body || 'Your build has finished.';
      if (Notification.permission === 'granted') { navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, { body, icon: '/icons/Icon-192.png', data: payload.data || {} })).catch(() => {}); }
      window.dispatchEvent(new CustomEvent('wybuild-build-notification', { detail: payload }));
    });
    return token;
  };
})();
