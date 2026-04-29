import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID;

// ValidaÃ§Ã£o bÃ¡sica para evitar tela branca sem erros claros
if (!firebaseConfig.apiKey && typeof window !== 'undefined') {
  console.warn("Firebase configuration is missing. If you are on Vercel, make sure to add Environment Variables starting with VITE_FIREBASE_.");
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, databaseId || '(default)');
export const auth = getAuth();
