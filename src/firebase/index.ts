'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

/**
 * Initializes Firebase SDK on the client side.
 * It follows a robust strategy attempting automatic initialization first.
 */
export function initializeFirebase() {
  let app: FirebaseApp;

  if (!getApps().length) {
    try {
      // In production, App Hosting provides environment variables for auto-init
      app = initializeApp();
    } catch (e) {
      // Manual fallback for development or misconfigured environments
      console.log('[Firebase Init] Automatic failed, using config object.');
      app = initializeApp(firebaseConfig);
    }
  } else {
    app = getApp();
  }

  // Ensure services are initialized with the correct app instance
  return {
    firebaseApp: app,
    auth: getAuth(app),
    firestore: getFirestore(app),
    functions: getFunctions(app),
  };
}

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
