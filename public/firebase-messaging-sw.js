// This file MUST be in the /public directory

// Give the service worker access to Firebase Messaging.
// Note that you can only use Firebase Messaging here. Other Firebase libraries
// are not available in the service worker.
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// IMPORTANT: Replace this with your project's Firebase config object.
const firebaseConfig = {
  "projectId": "studio-1513959978-e631d",
  "appId": "1:859353066925:web:b70267cb6cfeadb7550524",
  "apiKey": "AIzaSyAjgPK0flAnxsNVVQxbrMOsyhimILG36n0",
  "authDomain": "studio-1513959978-e631d.firebaseapp.com",
  "measurementId": "",
  "messagingSenderId": "859353066925"
};

// Initialize the Firebase app in the service worker with the config above.
firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Received background message ",
    payload
  );

  // Customize notification here
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo-192.png' // Ensure this icon exists in your /public folder
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
