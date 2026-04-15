import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import {
  isLikelyFlutterWebView,
  requestNativeGoogleSignIn,
  waitForFlutterInAppWebView,
} from "./mobileBridge";

// Firebase configuration - will be populated from backend
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "",
  vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY || import.meta.env.VITE_FCM_VAPID_KEY || "",
};

// Fetch config from backend
const fetchFirebaseConfig = async () => {
  try {
    const { adminAPI } = await import("./api/index.js");
    const response = await adminAPI.getPublicEnvVariables();

    if (response.data.success && response.data.data) {
      const config = response.data.data;
      // Only override if backend provides values
      if (config.FIREBASE_API_KEY)
        firebaseConfig.apiKey = config.FIREBASE_API_KEY;
      if (config.FIREBASE_AUTH_DOMAIN)
        firebaseConfig.authDomain = config.FIREBASE_AUTH_DOMAIN;
      if (config.FIREBASE_PROJECT_ID)
        firebaseConfig.projectId = config.FIREBASE_PROJECT_ID;
      if (config.FIREBASE_STORAGE_BUCKET)
        firebaseConfig.storageBucket = config.FIREBASE_STORAGE_BUCKET;
      if (config.FIREBASE_MESSAGING_SENDER_ID)
        firebaseConfig.messagingSenderId = config.FIREBASE_MESSAGING_SENDER_ID;
      if (config.FIREBASE_APP_ID) firebaseConfig.appId = config.FIREBASE_APP_ID;
      if (config.FIREBASE_VAPID_KEY) firebaseConfig.vapidKey = config.FIREBASE_VAPID_KEY;
      if (config.MEASUREMENT_ID)
        firebaseConfig.measurementId = config.MEASUREMENT_ID;

      console.log("✅ Firebase config loaded from database");
      return true;
    }
    return false;
  } catch (e) {
    console.warn(
      "⚠️ Failed to fetch firebase config from backend, using defaults/env",
      e,
    );
    return false;
  }
};

// Initialize Firebase app only once
let app;
let firebaseAuth;
let googleProvider;

// Function to ensure Firebase is initialized
async function ensureFirebaseInitialized() {
  await fetchFirebaseConfig(); // Try to load from backend first

  // Validate Firebase configuration
  const requiredFields = [
    "apiKey",
    "authDomain",
    "projectId",
    "appId",
    "messagingSenderId",
  ];
  const missingFields = requiredFields.filter(
    (field) => !firebaseConfig[field] || firebaseConfig[field] === "undefined",
  );

  if (missingFields.length > 0) {
    console.warn(
      "⚠️ Firebase configuration is missing required fields:",
      missingFields,
    );
    console.warn(
      "💡 Authentication features may not work until configured in Admin Panel.",
    );
    return;
  }

  try {
    const existingApps = getApps();
    if (existingApps.length === 0) {
      app = initializeApp(firebaseConfig);
      console.log(
        "🚀 Firebase initialized successfully with config from database",
      );
    } else {
      app = existingApps[0];
    }

    // Initialize Auth
    if (!firebaseAuth) {
      firebaseAuth = getAuth(app);
    }

    // Initialize Google Provider
    if (!googleProvider) {
      googleProvider = new GoogleAuthProvider();
      googleProvider.addScope("email");
      googleProvider.addScope("profile");
    }
  } catch (error) {
    console.error("❌ Firebase initialization error:", error);
  }

  return app;
}

export function getFirebaseVapidKey() {
  return firebaseConfig.vapidKey || import.meta.env.VITE_FIREBASE_VAPID_KEY || import.meta.env.VITE_FCM_VAPID_KEY || "";
}

export async function signInWithGoogleBridge() {
  await ensureFirebaseInitialized();

  if (!firebaseAuth || !googleProvider) {
    throw new Error("Firebase is not configured correctly for Google sign-in.");
  }

  const { GoogleAuthProvider, signInWithCredential, signInWithPopup } = await import("firebase/auth");
  const likelyFlutterWebView = isLikelyFlutterWebView();
  const isFlutterWebView = await waitForFlutterInAppWebView();

  if (isFlutterWebView) {
    const nativeResult = await requestNativeGoogleSignIn();

    if (nativeResult && nativeResult.success) {
      if (!nativeResult.idToken) {
        throw new Error("Native Google sign-in did not return an ID token.");
      }

      const credential = GoogleAuthProvider.credential(nativeResult.idToken);
      const result = await signInWithCredential(firebaseAuth, credential);

      return {
        result,
        source: "flutter-native-google",
      };
    }

    const nativeMessage = nativeResult?.error || nativeResult?.message || "";
    if (!nativeMessage) {
      return {
        result: null,
        source: "flutter-native-google",
        cancelled: true,
      };
    }

    throw new Error(nativeMessage);
  }

  if (likelyFlutterWebView) {
    throw new Error(
      "Flutter Google sign-in bridge was not available in the app. Please reopen the app and try again.",
    );
  }

  const result = await signInWithPopup(firebaseAuth, googleProvider);

  return {
    result,
    source: "web-google-popup",
  };
}

export { firebaseAuth, googleProvider, ensureFirebaseInitialized };
