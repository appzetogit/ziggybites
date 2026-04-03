import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import Order from "../../order/models/Order.js";

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
    .lean();

  const prepSummary = {};
  const rows = orders.map((order) => {
    const { visible, reason, editWindowEndsAt, message } =
      canRestaurantSeeSubscriptionMealDetails(order);

    const base = {
      _id: order._id,
      orderId: order.orderId,
      status: order.status,
      preparationStatus: order.preparationStatus,
      scheduledMealAt: order.scheduledMealAt,
      editWindow: order.editWindow,
      mealDetailsVisible: visible,
      visibilityReason: reason,
      userMessage: message,
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

  return successResponse(res, 200, "Today's subscription preparation", {
    date: start.toISOString().slice(0, 10),
    orderCount: rows.length,
    mealDetailsUnlockedCount: rows.filter((r) => r.mealDetailsVisible).length,
    prepSummary,
    orders: rows,
  });
});
