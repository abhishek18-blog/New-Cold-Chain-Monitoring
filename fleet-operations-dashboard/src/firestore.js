import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, onSnapshot } from 'firebase/firestore';

const firebaseConfig = {
  projectId: (typeof window !== 'undefined' && window.__FIREBASE_PROJECT_ID__) || "coldchain-local",
  apiKey: (typeof window !== 'undefined' && window.__FIREBASE_API_KEY__) || "dummy-api-key",
};

let db = null;
try {
  const apps = getApps();
  const app = apps.length === 0 ? initializeApp(firebaseConfig) : apps[0];
  db = getFirestore(app);
} catch (e) {
  console.warn("Firestore Web SDK initialization:", e);
}

/**
 * Subscribes to real-time updates from Firestore 'trucks' collection using onSnapshot().
 * Provides direct, serverless live streaming updates without HTTP polling loops.
 */
export function subscribeToTrucks(onUpdate, onError) {
  if (!db) {
    if (onError) onError(new Error("Firestore client not initialized"));
    return null;
  }
  try {
    const trucksCol = collection(db, "trucks");
    return onSnapshot(
      trucksCol,
      (snapshot) => {
        const trucks = [];
        snapshot.forEach((doc) => {
          trucks.push({ id: doc.id, ...doc.data() });
        });
        if (trucks.length > 0) {
          onUpdate(trucks);
        }
      },
      (err) => {
        if (onError) onError(err);
      }
    );
  } catch (err) {
    if (onError) onError(err);
    return null;
  }
}
