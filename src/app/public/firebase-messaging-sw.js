// Import the Firebase app and messaging services using the compatibility library.
// This is a reliable way to ensure the service worker functions correctly without a complex build setup.
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// This is the configuration for your web app's Firebase project.
// It's safe to be public.
const firebaseConfig = {
  "projectId": "studio-1513959978-e631d",
  "appId": "1:859353066925:web:b70267cb6cfeadb7550524",
  "apiKey": "AIzaSyAjgPK0flAnxsNVVQxbrMOsyhimILG36n0",
  "authDomain": "studio-1513959978-e631d.firebaseapp.com",
  "messagingSenderId": "859353066925"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background messages.
const messaging = firebase.messaging();

// Optional: Add a handler for background messages.
// This ensures notifications are displayed even when the app tab is not active.
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  // Customize the notification that is shown to the user.
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo-192.png' // A default icon for the notification
  };

  // The service worker needs to show the notification.
  self.registration.showNotification(notificationTitle, notificationOptions);
});
