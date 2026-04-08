import Order from "../models/Order.js";
import { getIO } from "../../../server.js";

const EDIT_WINDOW_MS = 30 * 60 * 1000;
const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;
/** Cron runs every 5 min; match slot around "exactly 24h before meal". */
const WINDOW_SLACK_MS = 5 * 60 * 1000;

/**
 * A) ~24 hours before scheduledMealAt: notify user, open 30m edit window (once).
 */
export async function processMealChangeNotifications() {
  const now = new Date();
  const results = { notified: 0, errors: [] };

  // scheduledMealAt ≈ now + 2h  (within slack)
  const lower = new Date(now.getTime() + TWENTY_FOUR_H_MS - WINDOW_SLACK_MS);
  const upper = new Date(now.getTime() + TWENTY_FOUR_H_MS + WINDOW_SLACK_MS);

  const orders = await Order.find({
    "source.type": "subscription",
    scheduledMealAt: { $gte: lower, $lte: upper },
    mealChangeNotificationSentAt: null,
    status: { $nin: ["cancelled", "delivered", "skipped"] },
  }).limit(500);

  for (const order of orders) {
    try {
      const start = new Date();
      const end = new Date(start.getTime() + EDIT_WINDOW_MS);
      order.editWindow = { start, end };
      order.mealChangeNotificationSentAt = start;
      if (order.status === "pending") {
        order.status = "scheduled";
      }
      order.subscriptionFlowVersion = (order.subscriptionFlowVersion || 0) + 1;
      await order.save();

      try {
        const io = getIO();
        io.to(`user:${order.userId}`).emit("subscription_meal_edit_window", {
          orderId: order._id.toString(),
          orderNumber: order.orderId,
          message:
            "You can change your meal within 30 minutes.",
          editWindow: order.editWindow,
        });
      } catch (_) {
        /* socket optional */
      }

      console.log("[MealEditCron] Notified user for order", order.orderId);
      results.notified++;
    } catch (e) {
      results.errors.push({ orderId: order._id, message: e.message });
    }
  }

  return results;
}

/**
 * B) After editWindow.end: lock meal — set status confirmed if still pre-confirmation.
 */
export async function processEditWindowLocks() {
  const now = new Date();
  const results = { locked: 0, errors: [] };

  const orders = await Order.find({
    "source.type": "subscription",
    "editWindow.end": { $lt: now, $ne: null },
    mealChangeNotificationSentAt: { $ne: null },
    status: { $in: ["pending", "scheduled"] },
  }).limit(500);

  for (const order of orders) {
    try {
      order.status = "confirmed";
      order.subscriptionFlowVersion = (order.subscriptionFlowVersion || 0) + 1;
      await order.save();
      results.locked++;
    } catch (e) {
      results.errors.push({ orderId: order._id, message: e.message });
    }
  }

  return results;
}

export async function runSubscriptionMealCronTick() {
  const a = await processMealChangeNotifications();
  const b = await processEditWindowLocks();
  return {
    notifications: a,
    locks: b,
  };
}
