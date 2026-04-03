import UserSubscription from "../models/UserSubscription.js";
import Order from "../../order/models/Order.js";
import SubscriptionSettings from "../models/SubscriptionSettings.js";
import { getNextMealDeliveryAt, getDeliveryWindowLabelForSubscription } from "./subscriptionScheduleService.js";
import { resumeExpiredPauses } from "./subscriptionPauseService.js";
import { getIO } from "../../../server.js";

const NOTIFICATION_WINDOW_MINUTES = 120; // 2 hours
const RUN_INTERVAL_MINUTES = 15;

/**
 * Get start and end of the window: from now to now+2hr.
 * We only notify if nextDeliveryAt falls in [now, now+2hr] and we haven't notified yet for this delivery.
 */
function getTwoHourWindow() {
  const now = new Date();
  const end = new Date(now.getTime() + NOTIFICATION_WINDOW_MINUTES * 60 * 1000);
  return { now, end };
}

/**
 * Process subscriptions due for 2hr notification: create pending order and notify.
 */
export async function processSubscriptionTwoHourNotifications() {
  const { now, end } = getTwoHourWindow();
  const results = { processed: 0, errors: [] };
  await resumeExpiredPauses();
  const settings = await SubscriptionSettings.getSettings();

  const subscriptions = await UserSubscription.find({
    status: "active",
    nextDeliveryAt: { $gte: now, $lte: end },
    $or: [
      { lastNotifiedAt: null },
      {
        lastNotifiedAt: {
          $lt: new Date(
            now.getTime() -
              (NOTIFICATION_WINDOW_MINUTES + RUN_INTERVAL_MINUTES) * 60 * 1000,
          ),
        },
      },
    ],
  })
    .populate("userId", "name email phone")
    .lean();

  for (const sub of subscriptions) {
    try {
      const orderCreated = await createPendingOrderForSubscription(sub, settings);
      if (orderCreated) {
        const nextDelivery = getNextMealDeliveryAt(sub.items || [], settings, sub.nextDeliveryAt);
        await UserSubscription.updateOne(
          { _id: sub._id },
          {
            $set: {
              lastNotifiedAt: now,
              pendingOrderId: orderCreated.orderId,
              nextDeliveryAt: nextDelivery,
            },
          },
        );
        sendSubscriptionNotification(sub, orderCreated);
        results.processed++;
      }
    } catch (err) {
      console.error("[Subscription 2hr] Error for subscription", sub._id, err);
      results.errors.push({ subscriptionId: sub._id, message: err.message });
    }
  }

  return {
    processed: results.processed,
    message: `Subscription 2hr notifications: ${results.processed} processed, ${results.errors.length} errors`,
    errors: results.errors,
  };
}

/**
 * Process renewal alerts: sent 3 days before expiry.
 */
export async function processSubscriptionRenewalAlerts() {
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
  const startOfDay = new Date(threeDaysFromNow);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(threeDaysFromNow);
  endOfDay.setHours(23, 59, 59, 999);

  const subscriptions = await UserSubscription.find({
    status: "active",
    endDate: { $gte: startOfDay, $lte: endOfDay },
  }).populate("userId", "name email phone");

  for (const sub of subscriptions) {
    const user = sub.userId;
    const message = sub.autoPayEnabled
      ? `Your plan expires in 3 days. A renewal of ₹${sub.planPrice || "..."} is scheduled via Auto-pay.`
      : `Your plan expires in 3 days. [Recharge Now] to avoid service interruption.`;

    console.log("[Subscription Renewal] Notification:", {
      userId: user?._id || user,
      userName: user?.name,
      message,
    });
    // TODO: Send via SMS/Email/Push
  }
}

/**
 * Create a pending order from subscription (user can then modify/skip/confirm).
 */
async function createPendingOrderForSubscription(sub) {
  const subtotal = sub.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const orderId = `ORD-SUB-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const userId = sub.userId?._id ?? sub.userId;
  const first = sub.items[0];
  const orderDoc = {
    orderId,
    userId,
    restaurantId: sub.restaurantId,
    restaurantName: sub.restaurantName,
    items: sub.items.map((i) => ({
      itemId: i.itemId,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      image: i.image,
      isVeg: i.isVeg,
    })),
    deliveryInstructions: "",
    status: "pending",
    specialCookingInstructions: sub.specialCookingInstructions || "",
    source: { type: "subscription", subscriptionId: sub._id },
    note: `Subscription delivery between ${windowLabel}. You can modify, skip, or confirm.`,
    // Required pricing + payment (Order schema); keeps subscription orders valid in MongoDB.
    pricing: {
      subtotal,
      deliveryFee: 0,
      platformFee: 0,
      tax: 0,
      discount: 0,
      total: subtotal,
    },
    payment: {
      method: "wallet",
      status: "pending",
    },
    // Meal-edit cron + wallet deltas (additive fields).
    scheduledMealAt: sub.nextDeliveryAt ? new Date(sub.nextDeliveryAt) : null,
    basePrice: subtotal,
    finalPrice: subtotal,
    selectedMeal: first
      ? {
          itemId: String(first.itemId || ""),
          name: String(first.name || ""),
          price: Number(first.price) || 0,
          quantity: Number(first.quantity) || 1,
          image: first.image || "",
          isVeg: first.isVeg !== false,
        }
      : undefined,
  };

  const order = await Order.create(orderDoc);

  // Notify restaurant via Socket.IO
  try {
    const io = getIO();
    const restaurantNamespace = io.of("/restaurant");
    restaurantNamespace.emit("new-order", {
      orderId: order.orderId,
      restaurantId: sub.restaurantId,
      message: "New subscription order (pending user confirmation)",
    });
  } catch (e) {
    console.warn("[Subscription 2hr] Socket emit failed:", e.message);
  }

  return { orderId: order.orderId, _id: order._id };
}

/**
 * Send in-app / push notification to user (placeholder: log; integrate FCM/push when ready).
 */
function sendSubscriptionNotification(sub, orderCreated) {
  const user = sub.userId;
  const message = `Your meal window is coming up (~2 hours). Order #${orderCreated.orderId} is ready – you can modify, skip, or confirm.`;
  console.log("[Subscription 2hr] Notification:", {
    userId: sub.userId._id || sub.userId,
    userName: user?.name,
    orderId: orderCreated.orderId,
    message,
  });
  // TODO: Push to notification collection or FCM when notification module is implemented
}
