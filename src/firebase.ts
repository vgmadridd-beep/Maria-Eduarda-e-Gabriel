import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// @ts-ignore - __FIREBASE_CONFIG__ is injected by Vite define
const injectedConfig = typeof __FIREBASE_CONFIG__ !== 'undefined' ? __FIREBASE_CONFIG__ : {};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || injectedConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || injectedConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || injectedConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || injectedConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || injectedConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || injectedConfig.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || injectedConfig.measurementId
};

const databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID || injectedConfig.firestoreDatabaseId;

let app;
try {
  app = initializeApp(firebaseConfig);
} catch (e) {
  console.error('Firebase initialization failed:', e);
}

export const db = app ? getFirestore(app, databaseId || '(default)') : null;
export const auth = app ? getAuth(app) : null;
