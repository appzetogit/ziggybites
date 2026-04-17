/* eslint-env serviceworker */
/* global firebase, importScripts */
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

function applyFirebaseConfig(data = {}) {
  data = data || {};

  firebaseConfig.apiKey = data.apiKey || data.FIREBASE_API_KEY || "";
  firebaseConfig.authDomain = data.authDomain || data.FIREBASE_AUTH_DOMAIN || "";
  firebaseConfig.projectId = data.projectId || data.FIREBASE_PROJECT_ID || "";
  firebaseConfig.storageBucket = data.storageBucket || data.FIREBASE_STORAGE_BUCKET || "";
  firebaseConfig.messagingSenderId =
    data.messagingSenderId || data.FIREBASE_MESSAGING_SENDER_ID || "";
  firebaseConfig.appId = data.appId || data.FIREBASE_APP_ID || "";

  return Boolean(firebaseConfig.projectId && firebaseConfig.appId);
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function getRuntimeEnvUrls() {
  const urls = ["/api/env/public"];
  const host = self.location.hostname || "";
  const protocol = self.location.protocol || "https:";

  if (host.includes("foods.appzeto.com")) {
    urls.push(`${protocol}//api.foods.appzeto.com/api/env/public`);
  } else if (host.includes("appzeto.com")) {
    urls.push(`${protocol}//api.${host}/api/env/public`);
  }

  return [...new Set(urls)];
}

async function loadFirebaseConfig() {
  const staticConfig = await fetchJson("/firebase-config.json");
  if (applyFirebaseConfig(staticConfig)) {
    return true;
  }

  for (const url of getRuntimeEnvUrls()) {
    const envResponse = await fetchJson(url);
    if (applyFirebaseConfig(envResponse?.data || envResponse)) {
      return true;
    }
  }

  return false;
}

function buildNotificationFromPayload(payload) {
  const title =
    payload?.notification?.title ||
    payload?.data?.title ||
    "Ziggy Notification";

  const body =
    payload?.notification?.body ||
    payload?.data?.body ||
    "";

  const icon =
    payload?.notification?.icon ||
    payload?.data?.icon ||
    "/image.png";

  const image =
    payload?.notification?.image ||
    payload?.data?.image ||
    undefined;

  const tag =
    payload?.data?.tag ||
    payload?.data?.orderId ||
    payload?.messageId ||
    title;

  return {
    title,
    options: {
      body,
      icon,
      image,
      data: payload?.data || {},
      tag,
      badge: icon,
      requireInteraction: false,
      vibrate: [200, 100, 200],
    },
  };
}

async function initFirebaseMessaging() {
  const hasConfig = await loadFirebaseConfig();
  if (!hasConfig) return;

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const { title, options } = buildNotificationFromPayload(payload);
    return self.registration.showNotification(title, options);
  });
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const urlToOpen = data.link || data.click_action || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const targetUrl = new URL(urlToOpen, self.location.origin).href;
      for (const client of clientList) {
        if ((client.url === targetUrl || client.url.includes(urlToOpen)) && "focus" in client) {
          return client.focus();
        }
      }

      for (const client of clientList) {
        if ("focus" in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }

      return undefined;
    }),
  );
});

initFirebaseMessaging();
