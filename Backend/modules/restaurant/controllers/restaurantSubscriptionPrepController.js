import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import Order from "../../order/models/Order.js";
import UserSubscription from "../../subscription/models/UserSubscription.js";

function minuteKey(subscriptionId, dateLike) {
  const ms = new Date(dateLike).getTime();
  if (!Number.isFinite(ms)) return null;
  return `${String(subscriptionId)}:${Math.floor(ms / 60000)}`;
}

function mealCategoryForTime(dateLike) {
  const d = new Date(dateLike);
  const h = d.getHours();
  if (h >= 5 && h <= 10) return "breakfast";
  if (h >= 11 && h <= 15) return "lunch";
  if (h >= 16 && h <= 18) return "snacks";
  return "dinner";
}

function buildPrepSummaryAndRowsFromOrders(orders) {
  const prepSummary = {};
  const rows = orders.map((order) => {
    const { visible, reason, editWindowEndsAt, message } =
      canRestaurantSeeSubscriptionMealDetails(order);

    const base = {
      _id: order._id,
      orderId: order.orderId,
      status: order.status,
      preparationStatus: order.preparationStatus,
      user:
        order.userId && typeof order.userId === "object"
          ? {
              _id: order.userId._id,
              name: order.userId.name,
              phone: order.userId.phone,
            }
          : null,
      scheduledMealAt: order.scheduledMealAt,
      editWindow: order.editWindow,
      mealDetailsVisible: visible,
      visibilityReason: reason,
      userMessage: message,
      deliveryAddress:
        order.deliveryAddress || order.address?.formattedAddress || "",
      totalAmount: order.pricing?.total ?? null,
    };

    if (!visible) {
      return {
        ...base,
        items: [],
        selectedMeal: null,
        hint:
          editWindowEndsAt != null
            ? `Unlocks after ${new Date(editWindowEndsAt).toLocaleString()}`
            : "Waiting for customer meal-change window to finish.",
      };
    }

    const items = order.items || [];
    for (const it of items) {
      const name = it.name || "Item";
      const q = Number(it.quantity) || 1;
      prepSummary[name] = (prepSummary[name] || 0) + q;
    }

    return {
      ...base,
      items,
      selectedMeal: order.selectedMeal || null,
      pricing: order.pricing,
    };
  });

  return { prepSummary, rows };
}

async function appendUpcomingSubscriptionFallbackRows({
  restaurantId,
  restaurantName,
  start,
  end,
  existingOrders,
}) {
  const existingKeys = new Set(
    (existingOrders || [])
      .map((order) => minuteKey(order?.source?.subscriptionId, order?.scheduledMealAt))
      .filter(Boolean),
  );

  const subs = await UserSubscription.find({
    status: "active",
    nextDeliveryAt: { $gte: start, $lte: end },
    $and: [
      {
        $or: [
          { restaurantId },
          { restaurantId: "ziggybites" },
          ...(restaurantName
            ? [
                {
                  restaurantName: {
                    $regex: `^${String(restaurantName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
                    $options: "i",
                  },
                },
              ]
            : []),
          { restaurantName: { $regex: "^ziggybites$", $options: "i" } },
        ],
      },
      { $or: [{ pauseUntil: null }, { pauseUntil: { $lte: new Date() } }] },
      { $or: [{ endDate: null }, { endDate: { $gte: start } }] },
    ],
  })
    .sort({ nextDeliveryAt: 1, createdAt: 1 })
    .populate("userId", "name phone")
    .lean();

  const fallbackRows = [];

  for (const sub of subs) {
    const key = minuteKey(sub._id, sub.nextDeliveryAt);
    if (!key || existingKeys.has(key)) continue;

    const mealCategory = mealCategoryForTime(sub.nextDeliveryAt);
    const items = (sub.items || []).filter((item) => item?.mealCategory === mealCategory);
    if (!items.length) continue;

    const totalAmount = items.reduce(
      (sum, item) => sum + (Number(item?.price) || 0) * (Number(item?.quantity) || 1),
      0,
    );

    fallbackRows.push({
      _id: `subscription-${sub._id}-${mealCategory}`,
      orderId: `SUB-${String(sub._id).slice(-6).toUpperCase()}`,
      status: "scheduled",
      preparationStatus: "pending",
      user:
        sub.userId && typeof sub.userId === "object"
          ? {
              _id: sub.userId._id,
              name: sub.userId.name,
              phone: sub.userId.phone,
            }
          : null,
      scheduledMealAt: sub.nextDeliveryAt,
      editWindow: null,
      mealDetailsVisible: true,
      visibilityReason: "active_subscription",
      userMessage: null,
      deliveryAddress: sub.address?.formattedAddress || "",
      totalAmount,
      items,
      selectedMeal: items[0] || null,
      pricing: {
        total: totalAmount,
        subtotal: totalAmount,
      },
      sourcePreview: true,
      hint: "Showing active subscription meal before order generation.",
    });
  }

  return fallbackRows;
}

/**
 * Restaurant may see exact dishes only after the customer's meal-change edit window ends,
 * so preparation matches the final locked order.
 */
export function canRestaurantSeeSubscriptionMealDetails(order) {
  if (order.source?.type !== "subscription") {
    return { visible: true, reason: "not_subscription" };
  }
  const end = order.editWindow?.end ? new Date(order.editWindow.end) : null;
  if (end && !Number.isNaN(end.getTime())) {
    const visible = Date.now() > end.getTime();
    return {
      visible,
      reason: visible ? "edit_window_closed" : "edit_window_open",
      editWindowEndsAt: order.editWindow.end,
    };
  }
  // Subscription order but no editWindow yet (before 2h cron) — do not show dishes
  if (!order.mealChangeNotificationSentAt) {
    return {
      visible: false,
      reason: "awaiting_edit_window",
      message:
        "Meal details appear after the customer's change-meal window has ended.",
    };
  }
  // Notified but missing end (edge case) — stay hidden until window exists
  return {
    visible: false,
    reason: "edit_window_pending",
    message:
      "Meal details will unlock after the customer's 30-minute change window ends.",
  };
}

/**
 * GET /api/restaurant/subscription-prep/today
 * Today's subscription orders for this outlet + prep summary (meals only when unlocked).
 */
export const getTodaySubscriptionPrep = asyncHandler(async (req, res) => {
  const restaurant = req.restaurant;
  if (!restaurant?._id) {
    return errorResponse(res, 401, "Restaurant not found");
  }

  const restaurantId = String(restaurant._id);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const orders = await Order.find({
    restaurantId,
    "source.type": "subscription",
    scheduledMealAt: { $gte: start, $lte: end },
    status: { $nin: ["cancelled", "skipped"] },
  })
    .sort({ scheduledMealAt: 1, createdAt: 1 })
    .populate("userId", "name phone")
    .lean();

  const orderResult = buildPrepSummaryAndRowsFromOrders(orders);
  const fallbackRows = await appendUpcomingSubscriptionFallbackRows({
    restaurantId,
    start,
    end,
    existingOrders: orders,
  });
  const fallbackResult = buildPrepSummaryAndRowsFromOrders(
    fallbackRows.map((row) => ({
      ...row,
      source: { type: "subscription" },
      mealChangeNotificationSentAt: new Date(),
      editWindow: null,
    })),
  );
  const prepSummary = { ...orderResult.prepSummary };
  for (const [name, qty] of Object.entries(fallbackResult.prepSummary)) {
    prepSummary[name] = (prepSummary[name] || 0) + qty;
  }
  const rows = [...orderResult.rows, ...fallbackRows].sort(
    (a, b) => new Date(a.scheduledMealAt).getTime() - new Date(b.scheduledMealAt).getTime(),
  );

  return successResponse(res, 200, "Today's subscription preparation", {
    date: start.toISOString().slice(0, 10),
    orderCount: rows.length,
    mealDetailsUnlockedCount: rows.filter((r) => r.mealDetailsVisible).length,
    prepSummary,
    orders: rows,
  });
});

/**
 * GET /api/restaurant/subscription-prep/next-24h
 * Subscription orders scheduled in the next 24 hours for this outlet + prep summary (meals only when unlocked).
 */
export const getNext24hSubscriptionPrep = asyncHandler(async (req, res) => {
  const restaurant = req.restaurant;
  if (!restaurant?._id) {
    return errorResponse(res, 401, "Restaurant not found");
  }

  const restaurantId = String(restaurant._id);
  const restaurantName = restaurant.name || "";
  const start = new Date();
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const orders = await Order.find({
    restaurantId,
    "source.type": "subscription",
    scheduledMealAt: { $gte: start, $lte: end },
    status: { $nin: ["cancelled", "skipped"] },
  })
    .sort({ scheduledMealAt: 1, createdAt: 1 })
    .populate("userId", "name phone")
    .lean();

  const orderResult = buildPrepSummaryAndRowsFromOrders(orders);
  const fallbackRows = await appendUpcomingSubscriptionFallbackRows({
    restaurantId,
    restaurantName,
    start,
    end,
    existingOrders: orders,
  });
  const fallbackResult = buildPrepSummaryAndRowsFromOrders(
    fallbackRows.map((row) => ({
      ...row,
      source: { type: "subscription" },
      mealChangeNotificationSentAt: new Date(),
      editWindow: null,
    })),
  );
  const prepSummary = { ...orderResult.prepSummary };
  for (const [name, qty] of Object.entries(fallbackResult.prepSummary)) {
    prepSummary[name] = (prepSummary[name] || 0) + qty;
  }
  const rows = [...orderResult.rows, ...fallbackRows].sort(
    (a, b) => new Date(a.scheduledMealAt).getTime() - new Date(b.scheduledMealAt).getTime(),
  );

  return successResponse(res, 200, "Next 24 hours subscription preparation", {
    window: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
    orderCount: rows.length,
    mealDetailsUnlockedCount: rows.filter((r) => r.mealDetailsVisible).length,
    prepSummary,
    orders: rows,
  });
});
