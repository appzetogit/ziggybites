import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { ensureFirebaseInitialized, getFirebaseVapidKey } from "@/lib/firebase";
import { adminAPI, authAPI, deliveryAPI, restaurantAPI } from "@/lib/api";

const FCM_SW_PATH = "/firebase-messaging-sw.js";
const FCM_SW_SCOPE = "/firebase-cloud-messaging-push-scope/";
const NOTIFICATION_DEBOUNCE_MS = 5000;

const ROLE_CONFIG = {
  user: {
    register: (platform, token) => authAPI.registerFcmToken(platform, token),
    remove: (platform) => authAPI.removeFcmToken(platform),
    logPrefix: "[FCM]",
    defaultTitle: "Ziggy Update",
    defaultIcon: "/favicon.ico",
  },
  restaurant: {
    register: (platform, token) => restaurantAPI.registerFcmToken(platform, token),
    remove: (platform) => restaurantAPI.removeFcmToken(platform),
    logPrefix: "[FCM][Restaurant]",
    defaultTitle: "Ziggy Restaurant",
    defaultIcon: "/favicon.ico",
  },
  delivery: {
    register: (platform, token) => deliveryAPI.registerFcmToken(platform, token),
    remove: (platform) => deliveryAPI.removeFcmToken(platform),
    logPrefix: "[FCM][Delivery]",
    defaultTitle: "Ziggy Delivery",
    defaultIcon: "/favicon.ico",
  },
};

let serviceWorkerRegistrationPromise = null;
let foregroundHandlerInitialized = false;

function getRoleConfig(role) {
  const config = ROLE_CONFIG[role];
  if (!config) {
    throw new Error(`Unsupported FCM role: ${role}`);
  }
  return config;
}

function getRoleCacheKey(role) {
  return `fcm_token_web_${role}`;
}

function getNotificationDebounceKey(payload, title) {
  const tag =
    payload?.data?.tag ||
    payload?.data?.orderId ||
    payload?.messageId ||
    title;
  return `fcm_notif_shown_${tag}`;
}

async function ensureServiceWorkerRegistered() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    console.warn("[FCM] Service Worker API not available");
    return null;
  }

  if (!serviceWorkerRegistrationPromise) {
    serviceWorkerRegistrationPromise = navigator.serviceWorker
      .register(FCM_SW_PATH, { scope: FCM_SW_SCOPE })
      .then(async (registration) => {
        if (typeof registration.update === "function") {
          try {
            await registration.update();
          } catch {
            // Ignore update failure and continue with current registration.
          }
        }

        await navigator.serviceWorker.ready;
        return registration;
      })
      .catch((error) => {
        serviceWorkerRegistrationPromise = null;
        throw error;
      });
  }

  return serviceWorkerRegistrationPromise;
}

async function ensureMessagingReady() {
  const app = await ensureFirebaseInitialized();
  if (!app) {
    console.warn("[FCM] Firebase app not initialized, skipping FCM setup");
    return null;
  }

  const supported = await isSupported();
  if (!supported) {
    console.warn("[FCM] Firebase messaging is not supported in this browser");
    return null;
  }

  const vapidKey = getFirebaseVapidKey();
  if (!vapidKey) {
    console.warn(
      "[FCM] No VAPID key. Set FIREBASE_VAPID_KEY in Admin -> Environment Variables, or VITE_FIREBASE_VAPID_KEY in .env",
    );
    return null;
  }

  const registration = await ensureServiceWorkerRegistered();
  if (!registration) return null;

  return {
    messaging: getMessaging(app),
    registration,
    vapidKey,
  };
}

function showForegroundNotification(payload, role) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return;
  }

  const config = getRoleConfig(role);
  const title =
    payload?.notification?.title ||
    payload?.data?.title ||
    config.defaultTitle;
  const body = payload?.notification?.body || payload?.data?.body || "";
  const icon =
    payload?.notification?.icon ||
    payload?.data?.icon ||
    config.defaultIcon;
  const image = payload?.notification?.image || payload?.data?.image || undefined;
  const tag =
    payload?.data?.tag ||
    payload?.data?.orderId ||
    payload?.messageId ||
    title;

  const debounceKey = getNotificationDebounceKey(payload, title);
  const lastShown = Number(localStorage.getItem(debounceKey) || 0);
  if (Date.now() - lastShown < NOTIFICATION_DEBOUNCE_MS) {
    return;
  }

  localStorage.setItem(debounceKey, String(Date.now()));
  new Notification(title, {
    body,
    icon,
    image,
    tag,
    data: payload?.data || {},
  });
}

async function ensureForegroundHandler(role = "user") {
  if (foregroundHandlerInitialized) return;

  const messagingSetup = await ensureMessagingReady();
  if (!messagingSetup) return;

  onMessage(messagingSetup.messaging, (payload) => {
    console.log("[FCM] Foreground message received:", payload);
    showForegroundNotification(payload, role);
  });

  foregroundHandlerInitialized = true;
}

async function getBrowserFcmToken() {
  console.log("[FCM] Starting web FCM registration flow");

  const messagingSetup = await ensureMessagingReady();
  if (!messagingSetup) return null;

  if (typeof Notification === "undefined") {
    console.warn("[FCM] Notification API not available");
    return null;
  }

  let permission = Notification.permission;
  if (permission !== "granted") {
    permission = await Notification.requestPermission();
    console.log("[FCM] Notification permission:", permission);
  }

  if (permission !== "granted") {
    return null;
  }

  const token = await getToken(messagingSetup.messaging, {
    vapidKey: messagingSetup.vapidKey,
    serviceWorkerRegistration: messagingSetup.registration,
  });

  console.log("[FCM] getToken result length:", token?.length || 0);

  if (!token) {
    console.warn(
      "[FCM] No FCM token from getToken. Ensure notification permission is granted and VAPID key is set.",
    );
    return null;
  }

  return token;
}

async function registerFcmToken(role) {
  const config = getRoleConfig(role);

  try {
    await ensureForegroundHandler(role);

    const token = await getBrowserFcmToken();
    if (!token) return null;

    const cacheKey = getRoleCacheKey(role);
    const cachedToken = localStorage.getItem(cacheKey);

    if (cachedToken === token) {
      console.log(`${config.logPrefix} Token unchanged, refreshing backend sync`);
    } else {
      localStorage.setItem(cacheKey, token);
    }

    console.log(`${config.logPrefix} Token to send:`, `${token.substring(0, 30)}...`);
    const res = await config.register("web", token);
    const saved =
      res?.data?.data?.fcmTokenWeb ??
      res?.data?.data?.fcmtokenWeb;

    console.log(
      `${config.logPrefix} Backend saved fcmTokenWeb:`,
      saved ? `${saved.substring(0, 30)}...` : "null",
    );

    return token;
  } catch (error) {
    console.error(
      `${config.logPrefix} Error during web FCM registration:`,
      error?.message || error,
    );

    if (error?.code === "messaging/permission-blocked") {
      console.warn(
        `${config.logPrefix} User denied notification permission. Token will stay null until permission is granted.`,
      );
    } else if (error?.code === "messaging/invalid-vapid-key") {
      console.warn(`${config.logPrefix} Invalid VAPID key. Check Firebase config.`);
    }

    return null;
  }
}

async function removeFcmToken(role) {
  const config = getRoleConfig(role);

  try {
    await config.remove("web");
    localStorage.removeItem(getRoleCacheKey(role));
  } catch (error) {
    console.error(`${config.logPrefix} Error removing FCM token for web:`, error);
  }
}

export async function initializeFcmWeb(role = "user") {
  await ensureForegroundHandler(role);
}

export async function registerFcmTokenForLoggedInUser() {
  return registerFcmToken("user");
}

export async function registerFcmTokenForRestaurant() {
  return registerFcmToken("restaurant");
}

export async function registerFcmTokenForDelivery() {
  return registerFcmToken("delivery");
}

export async function removeFcmTokenForLoggedInUser() {
  return removeFcmToken("user");
}

export async function removeFcmTokenForRestaurant() {
  return removeFcmToken("restaurant");
}

export async function removeFcmTokenForDelivery() {
  return removeFcmToken("delivery");
}

export async function fetchFirebaseMessagingConfig() {
  try {
    const response = await adminAPI.getPublicEnvVariables();
    const data = response?.data?.data || {};

    return {
      apiKey: data.FIREBASE_API_KEY || "",
      authDomain: data.FIREBASE_AUTH_DOMAIN || "",
      projectId: data.FIREBASE_PROJECT_ID || "",
      storageBucket: data.FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: data.FIREBASE_MESSAGING_SENDER_ID || "",
      appId: data.FIREBASE_APP_ID || "",
    };
  } catch (error) {
    console.warn("[FCM] Failed to fetch Firebase messaging config:", error);
    return null;
  }
}
