import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { getFirebaseCredentials } from "../utils/envService.js";

let isInitialized = false;

async function resolveServiceAccount() {
  const creds = await getFirebaseCredentials();
  if (creds.projectId && creds.clientEmail && creds.privateKey) {
    return {
      projectId: creds.projectId,
      clientEmail: creds.clientEmail,
      privateKey: String(creds.privateKey).replace(/\\n/g, "\n"),
    };
  }

  const root = process.cwd();
  const files = [
    path.resolve(root, "config", "serviceAccountKey.json"),
    path.resolve(root, "config", "ziggybites-default-rtdb-firebase-adminsdk.json"),
    path.resolve(root, "config", "zomato-607fa-firebase-adminsdk-fbsvc-f5f782c2cc.json"),
    path.resolve(root, "firebaseconfig.json"),
  ];

  for (const filePath of files) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (json.project_id && json.client_email && json.private_key) {
        return {
          projectId: json.project_id,
          clientEmail: json.client_email,
          privateKey: String(json.private_key).replace(/\\n/g, "\n"),
        };
      }
    } catch {
      // skip invalid credential file
    }
  }

  return null;
}

export async function initializeFirebaseAdminMessaging() {
  if (isInitialized) return true;

  try {
    if (admin.apps.length > 0) {
      isInitialized = true;
      return true;
    }

    const serviceAccount = await resolveServiceAccount();
    if (!serviceAccount) return false;

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    isInitialized = true;
    return true;
  } catch (error) {
    if (error?.code === "app/duplicate-app") {
      isInitialized = true;
      return true;
    }
    return false;
  }
}

export async function sendPushNotification(tokens, payload) {
  const ready = await initializeFirebaseAdminMessaging();
  if (!ready) {
    return {
      success: false,
      successCount: 0,
      failureCount: 0,
      cleanupTokens: [],
      failedTokens: [],
    };
  }

  const uniqueTokens = [...new Set((tokens || []).filter(Boolean))];
  if (!uniqueTokens.length) {
    return { success: true, successCount: 0, failureCount: 0, cleanupTokens: [], failedTokens: [] };
  }

  const chunks = [];
  const CHUNK_SIZE = 500;
  for (let i = 0; i < uniqueTokens.length; i += CHUNK_SIZE) {
    chunks.push(uniqueTokens.slice(i, i + CHUNK_SIZE));
  }

  const result = {
    success: true,
    successCount: 0,
    failureCount: 0,
    cleanupTokens: [],
    failedTokens: [],
  };

  for (const tokenChunk of chunks) {
    try {
      const tag = payload.data?.tag || payload.data?.orderId || payload.data?.notificationId || String(Date.now());
      const icon = payload.icon || payload.data?.icon || "/image.png";
      const image = payload.imageUrl || payload.data?.image || "";
      const link = payload.data?.link || payload.data?.click_action || "/";
      const message = {
        tokens: tokenChunk,
        data: {
          ...(payload.data || {}),
          title: payload.title || "",
          body: payload.body || "",
          tag,
          icon,
          image,
          link,
        },
        android: {
          priority: "high",
          collapseKey: tag,
          notification: {
            sound: "default",
            channelId: payload.androidChannelId || "default",
          },
        },
        apns: {
          headers: { "apns-collapse-id": tag, "apns-priority": "10" },
          payload: {
            aps: {
              alert: { title: payload.title || "", body: payload.body || "" },
              sound: "default",
              "thread-id": tag,
            },
          },
        },
        webpush: {
          headers: { Urgency: "high", Topic: tag.substring(0, 32) },
          notification: {
            title: payload.title,
            body: payload.body,
            tag,
            icon,
            badge: icon,
            image: image || undefined,
            requireInteraction: false,
          },
          fcmOptions: {
            link,
          },
        },
      };

      const messaging = admin.messaging();
      const response = typeof messaging.sendEachForMulticast === "function"
        ? await messaging.sendEachForMulticast(message)
        : await Promise.allSettled(
            tokenChunk.map((token) => {
              const { tokens: _tokens, ...singleMessage } = message;
              return messaging.send({ ...singleMessage, token });
            }),
          ).then((settled) => ({
            successCount: settled.filter((entry) => entry.status === "fulfilled").length,
            failureCount: settled.filter((entry) => entry.status === "rejected").length,
            responses: settled.map((entry) =>
              entry.status === "fulfilled"
                ? { success: true, messageId: entry.value }
                : { success: false, error: entry.reason },
            ),
          }));

      result.successCount += response.successCount || 0;
      result.failureCount += response.failureCount || 0;

      response.responses.forEach((entry, idx) => {
        if (entry.success) return;
        const token = tokenChunk[idx];
        const code = entry.error?.code || "unknown";
        result.failedTokens.push({ token, code });
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          result.cleanupTokens.push(token);
        }
      });
    } catch {
      result.success = false;
      result.failureCount += tokenChunk.length;
      for (const token of tokenChunk) {
        result.failedTokens.push({ token, code: "messaging/send-failure" });
      }
    }
  }

  return result;
}
