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

async function loadFirebaseConfig() {
  try {
    const response = await fetch("/firebase-config.json", { cache: "no-store" });
    if (!response.ok) return false;

    const data = await response.json();
    firebaseConfig.apiKey = data.apiKey || "";
    firebaseConfig.authDomain = data.authDomain || "";
    firebaseConfig.projectId = data.projectId || "";
    firebaseConfig.storageBucket = data.storageBucket || "";
    firebaseConfig.messagingSenderId = data.messagingSenderId || "";
    firebaseConfig.appId = data.appId || "";

    return Boolean(firebaseConfig.projectId && firebaseConfig.appId);
  } catch {
    return false;
  }
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
    "/favicon.ico";

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
      for (const client of clientList) {
        if (client.url === urlToOpen && "focus" in client) {
          return client.focus();
        }
      }

      for (const client of clientList) {
        if ("focus" in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }

      return undefined;
    }),
  );
});

initFirebaseMessaging();
