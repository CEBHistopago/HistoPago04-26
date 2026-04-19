'use server';

import { initializeApp, getApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { firebaseConfig } from './config';
import fs from 'fs';
import path from 'path';

let adminApp: App | null = null;

/**
 * Initializes or retrieves the Firebase Admin SDK instance.
 * Uses a named app to ensure it doesn't conflict with client-side instances
 * and always has full administrative privileges.
 */
export async function initializeFirebaseAdmin() {
    const ADMIN_APP_NAME = 'histopago-admin-server';
    
    // Check if the admin app is already initialized in this session
    const existingApps = getApps();
    adminApp = existingApps.find(app => app.name === ADMIN_APP_NAME) || null;

    if (!adminApp) {
        // Resolve path from the project root
        const serviceAccountPath = path.resolve(process.cwd(), 'serviceAccountKey.json');

        if (!fs.existsSync(serviceAccountPath)) {
            throw new Error(
                `Could not initialize Firebase Admin SDK. The 'serviceAccountKey.json' file was not found in the project root.`
            );
        }

        try {
            const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
            adminApp = initializeApp({
                credential: cert(serviceAccount),
                databaseURL: `https://${firebaseConfig.projectId}.firebaseio.com`
            }, ADMIN_APP_NAME);
            
            console.log(`[Firebase Admin] App '${ADMIN_APP_NAME}' initialized successfully.`);
        } catch (e: any) {
            throw new Error(`Failed to initialize Firebase Admin SDK: ${e.message}`);
        }
    }
    
    if (!adminApp) {
        throw new Error('Firebase Admin App could not be initialized.');
    }

    const firestore = getFirestore(adminApp);
  
    return { adminApp, firestore };
}
