import mongoose from "mongoose";
import Notification from "../model/Notification.js";
import User from "../../auth/models/User.js";
import Restaurant from "../../restaurant/models/Restaurant.js";
import Delivery from "../../delivery/models/Delivery.js";
import { sendPushNotification } from "../../../shared/services/firebaseAdmin.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";

const MODEL_BY_ROLE = {
  user: User,
  restaurant: Restaurant,
  delivery: Delivery,
};

const UI_ROLE_TO_DB_ROLE = {
  customer: "user",
  user: "user",
  "delivery man": "delivery",
  delivery: "delivery",
  restaurant: "restaurant",
};

function normalizeSendTo(sendTo = "") {
  const normalized = String(sendTo).trim().toLowerCase();
  return UI_ROLE_TO_DB_ROLE[normalized] || normalized;
}

function collectTokens(record) {
  return [
    ...new Set(
      [record?.fcmTokenWeb, record?.fcmTokenAndroid, record?.fcmTokenIos].filter(Boolean),
    ),
  ];
}

function getRelativeTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));

  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatNotification(notification) {
  return {
    id: notification._id,
    batchId: notification.batchId,
    title: notification.title,
    message: notification.message,
    imageUrl: notification.imageUrl || null,
    zone: notification.zone || "All",
    source: notification.source,
    recipientRole: notification.recipientRole,
    read: Boolean(notification.readAt),
    readAt: notification.readAt,
    createdAt: notification.createdAt,
    time: getRelativeTime(notification.createdAt),
    pushDelivery: notification.pushDelivery || { attempted: false, delivered: false },
    metadata: notification.metadata || {},
  };
}

async function clearInvalidTokens(model, records, cleanupTokens = []) {
  if (!cleanupTokens.length || !records.length) return;

  const invalidTokens = new Set(cleanupTokens);
  const bulkOps = [];

  for (const record of records) {
    const update = {};

    if (record.fcmTokenWeb && invalidTokens.has(record.fcmTokenWeb)) {
      update.fcmTokenWeb = null;
    }
    if (record.fcmTokenAndroid && invalidTokens.has(record.fcmTokenAndroid)) {
      update.fcmTokenAndroid = null;
    }
    if (record.fcmTokenIos && invalidTokens.has(record.fcmTokenIos)) {
      update.fcmTokenIos = null;
    }

    if (Object.keys(update).length > 0) {
      bulkOps.push({
        updateOne: {
          filter: { _id: record._id },
          update: { $set: update },
        },
      });
    }
  }

  if (bulkOps.length) {
    await model.bulkWrite(bulkOps);
  }
}

export async function sendAdminNotification(req, res) {
  try {
    const { title, description, sendTo, zone = "All", imageUrl = "" } = req.body || {};

    if (!title?.trim() || !description?.trim() || !sendTo?.trim()) {
      return errorResponse(res, 400, "title, description, and sendTo are required");
    }

    const recipientRole = normalizeSendTo(sendTo);
    const model = MODEL_BY_ROLE[recipientRole];

    if (!model) {
      return errorResponse(res, 400, "Unsupported notification recipient type");
    }

    const recipients = await model
      .find({ isActive: true })
      .select("_id fcmTokenWeb fcmTokenAndroid fcmTokenIos")
      .lean();

    const batchId = new mongoose.Types.ObjectId().toString();
    const notifications = recipients.map((recipient) => ({
      batchId,
      title: title.trim(),
      message: description.trim(),
      imageUrl: imageUrl?.trim() || null,
      zone: zone?.trim() || "All",
      source: "admin",
      recipientRole,
      recipientId: recipient._id,
      senderAdminId: req.admin?._id || null,
      pushDelivery: {
        attempted: false,
        delivered: false,
        deliveredAt: null,
      },
      metadata: {
        sendTo,
        zone: zone?.trim() || "All",
      },
    }));

    if (notifications.length) {
      await Notification.insertMany(notifications, { ordered: false });
    }

    const tokenOwners = recipients.filter((recipient) => collectTokens(recipient).length > 0);
    const tokens = [...new Set(tokenOwners.flatMap((recipient) => collectTokens(recipient)))];

    let pushResult = {
      success: true,
      successCount: 0,
      failureCount: 0,
      cleanupTokens: [],
      failedTokens: [],
    };

    if (tokens.length) {
      pushResult = await sendPushNotification(tokens, {
        title: title.trim(),
        body: description.trim(),
        imageUrl: imageUrl?.trim() || "",
        data: {
          type: "admin_broadcast",
          batchId,
          targetRole: recipientRole,
          title: title.trim(),
          body: description.trim(),
          image: imageUrl?.trim() || "",
          link: "/notifications",
        },
      });

      if (pushResult.cleanupTokens?.length) {
        await clearInvalidTokens(model, tokenOwners, pushResult.cleanupTokens);
      }
    }

    if (tokenOwners.length) {
      await Notification.updateMany(
        { batchId },
        {
          $set: {
            "pushDelivery.attempted": true,
            "pushDelivery.delivered": Boolean(pushResult.successCount > 0),
            "pushDelivery.deliveredAt": pushResult.successCount > 0 ? new Date() : null,
          },
        },
      );
    }

    return successResponse(res, 200, "Notification sent successfully", {
      batchId,
      recipients: recipients.length,
      recipientsWithTokens: tokenOwners.length,
      push: pushResult,
    });
  } catch (error) {
    console.error("Error sending admin notification:", error);
    return errorResponse(res, 500, "Failed to send notification");
  }
}

export async function getAdminNotificationHistory(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);

    const history = await Notification.aggregate([
      { $match: { source: "admin" } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$batchId",
          title: { $first: "$title" },
          message: { $first: "$message" },
          imageUrl: { $first: "$imageUrl" },
          zone: { $first: "$zone" },
          recipientRole: { $first: "$recipientRole" },
          createdAt: { $first: "$createdAt" },
          deliveredCount: {
            $sum: {
              $cond: [{ $eq: ["$pushDelivery.delivered", true] }, 1, 0],
            },
          },
          attemptedCount: {
            $sum: {
              $cond: [{ $eq: ["$pushDelivery.attempted", true] }, 1, 0],
            },
          },
          totalRecipients: { $sum: 1 },
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: limit },
    ]);

    return successResponse(
      res,
      200,
      "Notification history fetched successfully",
      history.map((item, index) => ({
        id: item._id,
        sl: index + 1,
        title: item.title,
        description: item.message,
        imageUrl: item.imageUrl || null,
        zone: item.zone || "All",
        target:
          item.recipientRole === "user"
            ? "Customer"
            : item.recipientRole === "delivery"
              ? "Delivery Man"
              : "Restaurant",
        createdAt: item.createdAt,
        time: getRelativeTime(item.createdAt),
        status: item.deliveredCount > 0,
        totalRecipients: item.totalRecipients,
        deliveredCount: item.deliveredCount,
        attemptedCount: item.attemptedCount,
      })),
    );
  } catch (error) {
    console.error("Error fetching admin notification history:", error);
    return errorResponse(res, 500, "Failed to fetch notification history");
  }
}

export async function getMyNotifications(req, res) {
  try {
    const { role, entityId } = req.notificationRecipient;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);

    const notifications = await Notification.find({
      recipientRole: role,
      recipientId: entityId,
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const unreadCount = notifications.filter((item) => !item.readAt).length;

    return successResponse(res, 200, "Notifications fetched successfully", {
      items: notifications.map(formatNotification),
      unreadCount,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return errorResponse(res, 500, "Failed to fetch notifications");
  }
}

export async function markNotificationAsRead(req, res) {
  try {
    const { id } = req.params;
    const { role, entityId } = req.notificationRecipient;

    const notification = await Notification.findOneAndUpdate(
      {
        _id: id,
        recipientRole: role,
        recipientId: entityId,
      },
      {
        $set: {
          readAt: new Date(),
        },
      },
      { new: true },
    ).lean();

    if (!notification) {
      return errorResponse(res, 404, "Notification not found");
    }

    return successResponse(res, 200, "Notification marked as read", formatNotification(notification));
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return errorResponse(res, 500, "Failed to update notification");
  }
}
