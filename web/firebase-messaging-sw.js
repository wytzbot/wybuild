/* Firebase Cloud Messaging background worker for WyBuild. */
importScripts('/firebase-config.js');
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js');
if (self.WYBUILD_FIREBASE_CONFIG && self.WYBUILD_FIREBASE_CONFIG.apiKey && !self.WYBUILD_FIREBASE_CONFIG.apiKey.startsWith('REPLACE_')) {
  firebase.initializeApp(self.WYBUILD_FIREBASE_CONFIG);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || 'WyBuild build update';
    const options = { body: payload.notification?.body || 'Your build has finished.', data: payload.data || {}, icon: '/icons/Icon-192.png' };
    self.registration.showNotification(title, options);
  });
}
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(target));
});
