import * as SecureStore from "expo-secure-store";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  getReactNativePersistence,
  initializeAuth,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const secureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const secureStoreChunkSize = 1800;

function getSecureStorageKey(key) {
  return `firebase_auth_${key.replace(/[^A-Za-z0-9._-]/g, (value) =>
    `_${value.charCodeAt(0).toString(16)}_`
  )}`;
}

async function removeSecureAuthItem(key) {
  const storageKey = getSecureStorageKey(key);
  const metaKey = `${storageKey}.meta`;
  const meta = await SecureStore.getItemAsync(metaKey, secureStoreOptions);

  if (meta) {
    try {
      const { chunks } = JSON.parse(meta);
      await Promise.all(
        Array.from({ length: chunks }, (_, index) =>
          SecureStore.deleteItemAsync(
            `${storageKey}.${index}`,
            secureStoreOptions
          )
        )
      );
    } catch {
      // If metadata is corrupted, deleting the metadata prevents reuse.
    }
  }

  await SecureStore.deleteItemAsync(metaKey, secureStoreOptions);
}

const secureAuthStorage = {
  async setItem(key, value) {
    const storageKey = getSecureStorageKey(key);
    const metaKey = `${storageKey}.meta`;
    await removeSecureAuthItem(key);

    const chunks = [];
    for (let index = 0; index < value.length; index += secureStoreChunkSize) {
      chunks.push(value.slice(index, index + secureStoreChunkSize));
    }

    await Promise.all(
      chunks.map((chunk, index) =>
        SecureStore.setItemAsync(
          `${storageKey}.${index}`,
          chunk,
          secureStoreOptions
        )
      )
    );
    await SecureStore.setItemAsync(
      metaKey,
      JSON.stringify({ chunks: chunks.length }),
      secureStoreOptions
    );
  },

  async getItem(key) {
    const storageKey = getSecureStorageKey(key);
    const meta = await SecureStore.getItemAsync(
      `${storageKey}.meta`,
      secureStoreOptions
    );

    if (!meta) {
      return null;
    }

    let chunks = 0;
    try {
      chunks = JSON.parse(meta).chunks;
    } catch {
      await removeSecureAuthItem(key);
      return null;
    }

    const values = [];
    for (let index = 0; index < chunks; index += 1) {
      const value = await SecureStore.getItemAsync(
        `${storageKey}.${index}`,
        secureStoreOptions
      );
      if (value === null) {
        return null;
      }
      values.push(value);
    }

    return values.join("");
  },

  async removeItem(key) {
    await removeSecureAuthItem(key);
  },
};

export const hasFirebaseConfig = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
);

export const firebaseApp = hasFirebaseConfig
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

function createAuth(app) {
  if (!app) {
    return null;
  }

  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(secureAuthStorage),
    });
  } catch {
    return getAuth(app);
  }
}

export const firebaseAuth = createAuth(firebaseApp);
export const firestoreDb = firebaseApp ? getFirestore(firebaseApp) : null;
export const firebaseStorage = firebaseApp ? getStorage(firebaseApp) : null;
