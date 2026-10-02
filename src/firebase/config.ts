import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import bundledConfig from '../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || bundledConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || bundledConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || bundledConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || bundledConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || bundledConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || bundledConfig.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || bundledConfig.measurementId,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || bundledConfig.firestoreDatabaseId || '',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const customDatabaseId =
  firebaseConfig.firestoreDatabaseId &&
  firebaseConfig.firestoreDatabaseId !== '(default)' &&
  firebaseConfig.firestoreDatabaseId.trim() !== ''
    ? firebaseConfig.firestoreDatabaseId
    : undefined;

// Use experimentalForceLongPolling to ensure reliable connectivity in iframe / container environments
export const db = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
  },
  customDatabaseId
);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Test connection on boot with graceful error handling
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    // Offline mode is supported by Firestore local persistence
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore is running in offline cache mode.');
    }
  }
}

// Defer connection check to allow browser environment to initialize
setTimeout(() => {
  testConnection();
}, 1500);
