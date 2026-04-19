// DO NOT USE 'use client'
// This file is a service worker and runs in a different context.

// Import the Firebase app and messaging packages using the v9 modular syntax via importScripts
// This is the standard way to use Firebase in a service worker.
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// IMPORTANT:
// The configuration must be hardcoded here. Service workers cannot import
// from other modules in the same way regular client-side code can.
const firebaseConfig = {
  "projectId": "studio-1513959978-e631d",
  "appId": "1:859353066925:web:b70267cb6cfeadb7550524",
  "apiKey": "AIzaSyAjgPK0flAnxsNVVQxbrMOsyhimILG36n0",
  "authDomain": "studio-1513959978-e631d.firebaseapp.com",
  "messagingSenderId": "859353066925"
};

// Initialize the Firebase app in the service worker with the config
firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo-192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Optional: Handle notification clicks
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  // This logic focuses the browser tab if it's already open, or opens a new one
  event.waitUntil(
    clients.matchAll({
      type: "window"
    })
    .then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url == '/' && 'focus' in client)
          return client.focus();
      }
      if (clients.openWindow)
        return clients.openWindow('/');
    })
  );
});
