import mongoose from "mongoose";
import { sendPushNotification } from "../../../shared/services/firebaseAdmin.js";
import User from "../../auth/models/User.js";
import Restaurant from "../../restaurant/models/Restaurant.js";
import Delivery from "../../delivery/models/Delivery.js";

const MODEL_BY_TYPE = {
  user: User,
  restaurant: Restaurant,
  delivery: Delivery,
};

function getModelForType(targetType) {
  const model = MODEL_BY_TYPE[targetType];
  if (!model) {
    throw new Error(`Unsupported push notification target type: ${targetType}`);
  }
  return model;
}

function normalizeDataValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizePayload(payload = {}) {
  return {
    title: payload.title || "Ziggy Update",
    body: payload.body || "",
    data: Object.fromEntries(
      Object.entries(payload.data || {}).map(([key, value]) => [
        key,
        normalizeDataValue(value),
      ]),
    ),
  };
}

function collectTokens(record) {
  return [
    ...new Set([record?.fcmTokenWeb, record?.fcmTokenAndroid, record?.fcmTokenIos].filter(Boolean)),
  ];
}

async function findTargetRecord(model, targetId, targetType) {
  if (mongoose.Types.ObjectId.isValid(targetId)) {
    const byId = await model.findById(targetId).lean();
    if (byId) return byId;
  }

  if (targetType === "restaurant") {
    return model.findOne({ restaurantId: targetId }).lean();
  }

  if (targetType === "delivery") {
    return model.findOne({ deliveryId: targetId }).lean();
  }

  return null;
}

async function clearInvalidTokens(model, record, cleanupTokens = []) {
  if (!record?._id || !cleanupTokens.length) return;

  const invalid = new Set(cleanupTokens);
  const update = {};

  if (record.fcmTokenWeb && invalid.has(record.fcmTokenWeb)) update.fcmTokenWeb = null;
  if (record.fcmTokenAndroid && invalid.has(record.fcmTokenAndroid)) update.fcmTokenAndroid = null;
  if (record.fcmTokenIos && invalid.has(record.fcmTokenIos)) update.fcmTokenIos = null;

  if (Object.keys(update).length > 0) {
    await model.updateOne({ _id: record._id }, { $set: update });
  }
}

export async function sendEntityPushNotification(targetId, targetType, payload) {
  try {
    const model = getModelForType(targetType);
    const record = await findTargetRecord(model, targetId, targetType);

    if (!record) {
      console.warn(`[Push Notification] ${targetType} not found for identifier ${targetId}`);
      return { success: false, successCount: 0, failureCount: 0 };
    }

    const tokens = collectTokens(record);
    if (!tokens.length) {
      console.log(`[Push Notification] No FCM tokens found for ${targetType} ${targetId}`);
      return { success: true, successCount: 0, failureCount: 0 };
    }

    const result = await sendPushNotification(tokens, normalizePayload(payload));
    if (result.cleanupTokens?.length) {
      await clearInvalidTokens(model, record, result.cleanupTokens);
    }

    return result;
  } catch (error) {
    console.error(`[Push Notification] Error sending push to ${targetType} ${targetId}:`, error);
    return { success: false, successCount: 0, failureCount: 0 };
  }
}
